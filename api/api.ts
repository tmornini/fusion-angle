import type {
    DbAdapter,
    GuardedDbAdapter,
} from './db.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
    foreignOrganizationMessage,
    MissingTableError,
    RetiredEntityError,
    UniqueConstraintError,
} from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    ValidationError,
    msSinceMonotonic,
    nowUtc,
} from '../shared/types.ts';
import type { Id } from '../shared/types.ts';
import { pathSegmentsOf } from './path-segments.ts';
import {
    formWriteMessagePair,
    storedPathAndNameOf,
    requestHeaderFields,
    requestTarget,
    documentHeadAt,
    writeAnswerOf,
    ownWireOf,
    attachEtag,
    httpDateOf,
    parseEntityTags,
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from './message-pair.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import type { ReceivedRequest } from './message-pair.ts';
import type {
    MessagePair, AuthMessagePairSeed,
} from './message-pair.ts';
import {
    documentFamilyWiring,
} from './document-family.ts';
import { servedSelection } from './head-reads.ts';
import {
    ANONYMOUS_ID,
    decodeAccessToken,
} from './access-token.ts';
import {
    identityTargetsFor,
} from '../shared/notifications.ts';
import {
    resolveGlobalOwner,
} from './derive-states.ts';
import {
    postToken,
    postAuthorize,
    refreshClearCookie,
    wireGrantError,
} from './authentication.ts';
import {
    ApiError,
    HTTP_NO_CONTENT,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_GONE,
    HTTP_METHOD_NOT_ALLOWED,
    HTTP_INTERNAL_ERROR,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_PRECONDITION_FAILED,
    HTTP_PRECONDITION_REQUIRED,
    errorJson,
} from '../shared/http-errors.ts';
import {
    AUTHENTICATION_ROUTES,
    authenticateRequest,
    unauthorizedBearerResponse,
    fenceRequest,
    authorizeRequest,
    authorizeIdentityPii,
    parseObjectBody,
} from './request-auth.ts';
import {
    routes,
    matchRoute,
    param,
    WRITE_RESPONSE_SPECS,
    conditionalOf,
    type Conditional,
    type Route,
    type WriteMethod,
    type WriteResponseSpec,
} from './routes.ts';

import {
    framingRefusal,
    incomingContext,
    type FramedContext,
    type IncomingContext,
} from './request-context.ts';
import { REQUEST_ID_HEADER } from '../shared/message-id-fields.ts';
import {
    isIdentifier,
} from '../shared/identifier.ts';
import { parsedMembershipName } from
    '../shared/membership-name.ts';
import {
    memberViewRefusal,
    membershipNameRefusal,
    type ViewQuery,
} from './membership-gate.ts';

export {
    ApiError,
    UnauthorizedError,
    RequestError,
    HTTP_OK,
    HTTP_CREATED,
    HTTP_NO_CONTENT,
    HTTP_BAD_REQUEST,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_NOT_FOUND,
    HTTP_METHOD_NOT_ALLOWED,
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
    HTTP_UNPROCESSABLE_ENTITY,
    HTTP_INTERNAL_ERROR,
    HTTP_NOT_IMPLEMENTED,
} from '../shared/http-errors.ts';

const routeTable: readonly Route[] = routes;

// The gate-side Decision 5 post: fired once per successful
// write, AFTER the route handler's promise resolves — the
// transaction has committed.
// Every write posts the fenced organization, identity
// targets the route/body name, and the actor so the
// writer's other tabs refresh even when the session is a
// flat (un-exchanged) token that cannot match on
// organization.
function invitationWriteOwnsNotification(
    routePattern: string,
): boolean {
    return routePattern
            === 'organizations/:id/invitations/'
        || routePattern
            === 'organizations/:id/invitations/'
                + ':membership-id'
        || routePattern
            === 'identities/:id/invitations/'
                + ':membership-id';
}

// Tenant-root document and its version reads. Path org
// is the document id, not a nested product fence.
function isOrganizationDocumentPath(
    pattern: string,
): boolean {
    return pattern === 'organizations/:id'
        || pattern === 'organizations/:id/versions/'
        || pattern
            === 'organizations/:id/versions/:etag';
}

function requireWrite(
    pair: NonNullable<Parameters<typeof writeAnswerOf>[0]>,
    routePattern: string,
): NonNullable<ReturnType<typeof writeAnswerOf>> {
    const written = writeAnswerOf(pair);
    const wire = ownWireOf(pair);
    if (written === undefined || wire === undefined) {
        throw new Error(
            'wired write stored no pair: ' + routePattern,
        );
    }
    return { ...written, response: wire };
}

function postWriteNotification(
    adapter: GuardedDbAdapter,
    routePattern: string,
    params: readonly string[],
    body: Record<string, unknown> | undefined,
    organization: Id | undefined,
    actor: Id,
): void {
    const identityIds = new Set(
        identityTargetsFor(routePattern, params, body),
    );
    if (actor !== ANONYMOUS_ID) {
        identityIds.add(actor);
    }
    adapter.postNotification({
        kind: 'scoped',
        organizationIds:
            organization === undefined
                ? [] : [organization],
        identityIds: [...identityIds],
    });
}

// Resolve a route pattern's WRITE_RESPONSE_SPECS entry for the
// verb actually in flight. Every entry but two is a plain
// WriteResponseSpec, applying regardless of which non-DELETE
// verb hit it (no prior pattern wired both a PUT and a POST at
// once). A PerVerbWriteResponseSpec — recognized by the absence
// of `conditional` at its top level — supplies one spec per verb
// instead; 'ai-members/:id' needs this because it wires a real
// PUT alongside its composed-edit POST, and 'human-members/:id'
// joins it (Phase 8 Task 4) for a DIFFERENT reason — its `put`
// slot serves no live route at all, only the synthesized
// detail-document bundle and the seed (see routes.ts). Task 10:
// resolve put / patch / else post EXPLICITLY — never let PATCH
// silently fall into the post branch.
function writeResponseSpecFor(
    routePattern: string,
    method: string,
): WriteResponseSpec | undefined {
    const entry = WRITE_RESPONSE_SPECS[routePattern];
    if (entry === undefined || 'conditional' in entry) {
        return entry;
    }
    if (method === 'PUT') return entry.put;
    if (method === 'PATCH') return entry.patch;
    return entry.post;
}

function isWriteMethod(method: string): method is WriteMethod {
    return method === 'PUT' || method === 'POST'
        || method === 'PATCH' || method === 'DELETE';
}

// Presence and form only (§2): the gate never reads a head
// to decide a latch; the statement judges the value.
function preconditionRefusal(
    headers: Headers,
    conditional: Conditional,
    method: string,
    pathname: string,
): Response | undefined {
    const ifMatch = headers.get(IF_MATCH_HEADER);
    const ifNoneMatch = headers.get(IF_NONE_MATCH_HEADER);
    if (conditional === 'none') {
        return ifMatch === null && ifNoneMatch === null
            ? undefined
            : errorJson(
                method + ' ' + pathname
                    + ' takes no precondition',
                HTTP_BAD_REQUEST,
            );
    }
    if (ifMatch !== null && ifNoneMatch !== null) {
        return errorJson(
            'If-Match and If-None-Match cannot both hold'
                + ' at ' + pathname,
            HTTP_PRECONDITION_FAILED,
        );
    }
    if (ifNoneMatch !== null) {
        if (conditional === 'in-order') {
            return errorJson(
                method + ' ' + pathname
                    + ' requires If-Match',
                HTTP_BAD_REQUEST,
            );
        }
        return ifNoneMatch.trim() === '*'
            ? undefined
            : errorJson(
                'If-None-Match must be *',
                HTTP_BAD_REQUEST,
            );
    }
    if (ifMatch !== null) {
        const tags = parseEntityTags(ifMatch);
        if (
            tags === undefined
            || (conditional !== 'in-order' && tags.length !== 1)
        ) {
            return errorJson(
                'If-Match must carry exactly one strong'
                    + ' validator',
                HTTP_BAD_REQUEST,
            );
        }
        return undefined;
    }
    if (conditional === 'required') {
        return errorJson(
            'If-Match or If-None-Match is required to '
                + method + ' ' + pathname,
            HTTP_PRECONDITION_REQUIRED,
        );
    }
    if (conditional === 'in-order') {
        return errorJson(
            'If-Match is required to ' + method + ' '
                + pathname,
            HTTP_PRECONDITION_REQUIRED,
        );
    }
    return undefined;
}

// The one catch shared by both pre-dispatch ownership regions
// (handleRequest, below) so their redaction discipline cannot
// diverge. A thrown fenceRequest membership/role read is storage-
// corruption territory, not a domain outcome — it gets the SAME
// fixed 500 body the domain-boundary catch (below, ~:938)
// already gives every other unmapped fault, console-logged with
// the request identity for correlation. A missing table is a
// failed request; product boot does not recover it.
function redactedFenceFailure(
    ctx: FramedContext,
    error: unknown,
): Response {
    if (error instanceof MissingTableError) {
        throw error;
    }
    console.error('fence read failed', {
        requestId: ctx.requestId,
        operationId: ctx.operationId,
        requestAt: ctx.requestAt,
        latencyMs: msSinceMonotonic(ctx.arrivalMs),
        method: ctx.method,
        pathname: ctx.pathname,
    }, error);
    return Response.json(
        { error: 'internal error' },
        { status: HTTP_INTERNAL_ERROR },
    );
}

const NON_IDENTIFIER_PARAMS = new Set([
    'name',
]);

function rejectMalformedIdentifierParams(
    route: Route,
    pathSegments: readonly string[],
): Response | undefined {
    for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]!;
        if (!seg.startsWith(':')) continue;
        const name = seg.slice(1);
        if (NON_IDENTIFIER_PARAMS.has(name)) continue;
        const value = pathSegments[i]!;
        if (name === 'membership-id') {
            if (parsedMembershipName(value) === undefined) {
                return Response.json(
                    {
                        error: 'membership-id must be two'
                            + ' identifiers joined by one'
                            + ' colon',
                    },
                    { status: HTTP_BAD_REQUEST },
                );
            }
            continue;
        }
        if (!isIdentifier(value)) {
            return Response.json(
                {
                    error: name
                        + ' must be a 22-character'
                        + ' identifier',
                },
                { status: HTTP_BAD_REQUEST },
            );
        }
    }
    return undefined;
}

// The name's halves, after policy and before any read.
// Organization nest: a foreign organization half is 403.
// Identity nest: an identity half that is not the path's
// is 404. A route with no :membership-id is untouched.
function membershipNameGate(
    route: Route,
    params: readonly string[],
    pathname: string,
): Response | undefined {
    let captured = 0;
    let membershipId: string | undefined;
    for (const segment of route.segments) {
        if (!segment.startsWith(':')) continue;
        if (segment === ':membership-id') {
            membershipId = params[captured];
            break;
        }
        captured += 1;
    }
    if (membershipId === undefined) return undefined;
    const parsed = parsedMembershipName(membershipId);
    if (parsed === undefined) return undefined;
    const nest = route.segments[0] === 'organizations'
        ? 'organization'
        : 'identity';
    const pathId = params[0];
    if (pathId === undefined) return undefined;
    const refusal = membershipNameRefusal(
        nest, pathId, parsed,
    );
    if (refusal === 'foreign') {
        return Response.json(
            {
                error: foreignOrganizationMessage(
                    'invitations', membershipId,
                ),
            },
            { status: HTTP_FORBIDDEN },
        );
    }
    if (refusal === 'absent') {
        return Response.json(
            { error: 'Not found: ' + pathname },
            { status: HTTP_NOT_FOUND },
        );
    }
    return undefined;
}

// WP8 self-only token-chain guard (below): the route-and-
// method pairs it covers — the token revocation document's
// PUT and both token operations' POSTs. `:id` in each pattern
// names the identity whose chain the route acts on.
const SELF_ONLY_TOKEN_ROUTES: ReadonlySet<string> = new Set([
    'PUT identities/:id/token-revocations/:rid',
    'POST identities/:id/tokens/:jti/rotation',
    'POST identities/:id/tokens/:jti/revocation',
]);

function finish(
    ctx: IncomingContext,
    response: Response,
): Response {
    response.headers.set(
        REQUEST_ID_HEADER, ctx.requestId,
    );
    return response;
}

export async function handleRequest(
    adapter: GuardedDbAdapter,
    request: Request,
): Promise<Response> {
    const ctx = await incomingContext(adapter, request);
    const response = await dispatched(ctx, request);
    return finish(ctx, response);
}

async function dispatched(
    arrived: IncomingContext,
    request: Request,
): Promise<Response> {
    const framing = framingRefusal(
        request.headers, arrived.bodyBytes,
    );
    if (framing !== undefined) return framing;
    if (request.headers.has(REQUEST_ID_HEADER)) {
        return errorJson(
            'Request-ID is minted by the server',
            HTTP_BAD_REQUEST,
        );
    }
    const operationId = request.headers.get(
        OPERATION_ID_HEADER,
    );
    if (operationId === null || operationId === '') {
        return errorJson(
            'Operation-ID is required',
            HTTP_BAD_REQUEST,
        );
    }
    if (!isIdentifier(operationId)) {
        return errorJson(
            'Operation-ID must be a 22-'
                + 'character identifier',
            HTTP_BAD_REQUEST,
        );
    }
    const ctx: FramedContext = {
        ...arrived,
        operationId,
    };
    const adapter = ctx.base;
    const { method, pathname } = ctx;
    const pathSegments = pathSegmentsOf(pathname);
    // Match first (pure, no I/O). Authentication runs before
    // the no-match 404 so an unauthenticated caller never maps
    // route topology (unknown path and real route both 401).
    const match = matchRoute(routeTable, pathSegments);
    const matchedRoutePattern = match !== null
        ? match.route.segments.join('/')
        : undefined;
    // Every authenticated request is fenced — see
    // fenceRequest, which completes the vessel: the
    // organization, the live memberships, and the roles.
    // Surviving stores are global (message plane);
    // message-plane tenancy rides path. effective stays
    // the unfenced base adapter.
    let effective: DbAdapter = adapter;
    // The acting member, sourced from the verified token and
    // handed to every handler so authorship is never client-
    // supplied. A bearer-exempt route has no principal, so it
    // carries the anonymous id — its handlers never author a
    // member-state event.
    let actor: Id = ANONYMOUS_ID;
    // The fenced organization, for the post-write notification
    // target — undefined for a bearer-exempt route (no fence
    // ran) or the global identity/auth spine.
    let organization: Id | undefined;
    // Whether the caller holds the admin role in the fenced
    // organization — threaded out of Region A (below) alongside
    // effective/actor/organization for WP8's self-only token-
    // chain guard (Region B, below, SELF_ONLY_TOKEN_ROUTES):
    // MEMBER_VERBS widens the token revocation document's PUT
    // and both token operations' POSTs to the member tier, but
    // an admin may still name any identity. False for a bearer-
    // exempt route (no fence ran, so no role to hold) — the
    // guard below only ever runs on an authenticated route.
    let callerIsAdmin = false;
    // Fenced claim roles for the active organization —
    // threaded to every handler (Task 10 reconciliation 5).
    // Empty for bearer-exempt routes (no fence ran).
    let roles: readonly string[] = [];
    // AUTHENTICATION_ROUTES stay bearer-exempt.
    // An unmatched path can never be exempt —
    // bearerExempt requires a defined route
    // pattern.
    const bearerExempt = matchedRoutePattern !== undefined
        && AUTHENTICATION_ROUTES.has(matchedRoutePattern);
    if (!bearerExempt) {
        const authed =
            await authenticateRequest(ctx, request);
        if (typeof authed === 'string') {
            return unauthorizedBearerResponse(authed);
        }
        // Auth first; only then admit an unmatched path as
        // 404 (bytes unchanged for authenticated callers).
        if (match === null) {
            return Response.json(
                {
                    error:
                        'Not found: ' + pathname,
                },
                { status: HTTP_NOT_FOUND },
            );
        }
        const rejectedIds =
            rejectMalformedIdentifierParams(
                match.route, pathSegments,
            );
        if (rejectedIds !== undefined) {
            return rejectedIds;
        }
        const { params: fenceParams } = match;
        const fencePattern = matchedRoutePattern!;
        // Region A of the pre-dispatch ownership fence (Phase 12
        // Task 1): every read below — fenceRequest's own
        // memberships/roleGrants/requests/responses reads, and
        // the organizations/:id membership fence resolve — is
        // storage-corruption territory should it throw. Redact
        // through the shared helper rather than letting the
        // fault reach the wire; MissingTableError still escapes.
        try {
            const fence = await fenceRequest(authed);
            if (!fence.ok) {
                // Org-less identity-scoped reads (invitations,
                // default-org, reachable orgs) reach the
                // handler; fence would 403 first. Sign-out
                // PUT is the same class: a zero-membership
                // identity must still revoke its refresh
                // cookie. GET of revocations stays fenced
                // (admin-only via authorizeRequest).
                if (
                    fencePattern
                        !== 'identities/:id/'
                            + 'default-organization'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'organizations/'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/:membership-id'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/:membership-id'
                            + '/versions/'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/:membership-id'
                            + '/versions/:etag'
                    && !(
                        method === 'PUT'
                        && fencePattern
                            === 'identities/:id/'
                                + 'token-revocations/'
                                + ':rid'
                    )
                ) {
                    return Response.json(
                        { error: fence.error },
                        { status: fence.status },
                    );
                }
                actor = authed.principal.id;
            }
            if (fence.ok) {
                const fenced = fence.ctx;
                // Nested org path fence: after fenceRequest and
                // before authorizeRequest. Path org never
                // authorizes alone — mismatch (incl.
                // nonexistent path org) is 403 with a fixed
                // body. No auto-exchange. The organization
                // document and its versions keep the
                // membership fence below; every other
                // organizations/... match takes this arm.
                if (
                    match !== null
                    && match.route.segments[0]
                        === 'organizations'
                    && !isOrganizationDocumentPath(
                        fencePattern,
                    )
                    && fenceParams[0]
                        !== fenced.organization
                ) {
                    return Response.json(
                        {
                            error: 'forbidden: path'
                                + ' organization does not'
                                + ' match the token'
                                + ' organization',
                        },
                        { status: HTTP_FORBIDDEN },
                    );
                }
                const authzFailure =
                    fencePattern === 'identities/:id/pii'
                        ? authorizeIdentityPii(
                            fenced, param(fenceParams, 0))
                        : authorizeRequest(fenced);
                if (authzFailure !== null) {
                    return Response.json(
                        { error: authzFailure },
                        { status: HTTP_FORBIDDEN },
                    );
                }
                // Organization document reads (item and
                // versions) are global passthrough;
                // fence READS to the caller's memberships.
                // A real org the caller is not a member of
                // is 403 (honest); a genuinely absent id
                // stays 404. PUT is not gated here — a new
                // org is created before its first membership
                // exists.
                if (method === 'GET'
                    && isOrganizationDocumentPath(
                        fencePattern,
                    )
                    && !fenced.memberOrganizations
                        .has(param(fenceParams, 0))) {
                    const organizationId =
                        param(fenceParams, 0);
                    // Orgs self-own (resolveGlobalOwner →
                    // resolveOwningOrganization returns the
                    // org id when the document exists).
                    const owner = await resolveGlobalOwner(
                        adapter,
                        organizationId,
                        fenced.organization,
                        'organizations',
                    );
                    if (owner !== null) {
                        return Response.json(
                            {
                                error:
                                    foreignOrganizationMessage(
                                        'organizations',
                                        organizationId,
                                    ),
                            },
                            { status: HTTP_FORBIDDEN },
                        );
                    }
                    return Response.json(
                        { error: 'Not found: ' + pathname },
                        { status: HTTP_NOT_FOUND },
                    );
                }
                actor = fenced.principal.id;
                organization = fenced.organization;
                roles = fenced.roles;
                callerIsAdmin =
                    fenced.roles.includes('admin');
            }
        } catch (error) {
            return redactedFenceFailure(ctx, error);
        }
    }

    // Unmatched non-exempt paths already 404'd above after
    // auth. Unmatched paths are never bearer-exempt. Match is
    // therefore non-null from here.
    if (match === null) {
        return Response.json(
            {
                error:
                    'Not found: ' + pathname,
            },
            { status: HTTP_NOT_FOUND },
        );
    }
    const { route: matched, params } = match;
    const routePattern = matched.segments.join('/');

    const named = membershipNameGate(
        matched, params, pathname,
    );
    if (named !== undefined) return named;

    let viewQuery: ViewQuery | undefined;
    if (method === 'GET' && matched.query !== undefined) {
        const judged = matched.query(ctx.search);
        if (judged.kind === 'refused') {
            return Response.json(
                { error: judged.error },
                { status: HTTP_BAD_REQUEST },
            );
        }
        if (
            routePattern
                === 'organizations/:id/invitations/'
        ) {
            const memberRefusal = memberViewRefusal(
                roles, judged,
            );
            if (memberRefusal !== undefined) {
                return Response.json(
                    { error: memberRefusal },
                    { status: HTTP_FORBIDDEN },
                );
            }
        }
        viewQuery = judged;
    }

    // Parse the request body when the method
    // has one. A malformed or non-object JSON
    // body is a client error (400), not a
    // server fault — it must not flow into the
    // domain-boundary try below.
    let body: Record<string, unknown> | undefined;
    if (
        method === 'PUT'
        || method === 'POST'
        || method === 'PATCH'
    ) {
        const parse = parseObjectBody(ctx.bodyBytes);
        if (!parse.ok) {
            return Response.json(
                {
                    error:
                        'Invalid JSON body for '
                        + method + ' '
                        + pathname,
                },
                { status: HTTP_BAD_REQUEST },
            );
        }
        body = parse.body;
    }
    // A route pattern can be pair-wired for one verb (PUT,
    // say) while exposing no handler for another (DELETE) —
    // ideas/:id is exactly this today. Requiring the matched
    // verb's handler to exist keeps that combination 405ing
    // exactly as it did before pairs existed, rather than
    // running the pair machinery (and its successBody
    // validation) against a request no handler will ever see.
    // Task 10: PATCH joins the write alphabet the same way.
    const hasWriteHandler =
        (method === 'PUT' && matched.put !== undefined)
        || (method === 'POST' && matched.post !== undefined)
        || (method === 'PATCH'
            && matched.patch !== undefined)
        || (method === 'DELETE'
            && matched.delete !== undefined);
    if (isWriteMethod(method) && hasWriteHandler) {
        const refused = preconditionRefusal(
            request.headers,
            conditionalOf(routePattern, method),
            method,
            pathname,
        );
        if (refused !== undefined) {
            return refused;
        }
    }

    // Region B of the pre-dispatch ownership fence: WP8's
    // self-only token-chain guard. It runs after body-parse
    // regardless of bearerExempt, mirroring Region A above.
    try {
        // WP8 self-only token-chain guard. MEMBER_VERBS widens
        // the token revocation document's PUT and both token
        // operations' POSTs to the member tier (Region A's
        // route-policy check already cleared each). The path
        // identity IS the document, or owns the chain the
        // operation acts on — compare it to the actor. A
        // member may act only on its OWN chain; an admin may
        // name any identity. The 403 body reuses
        // authorizeRequest's OWN wording (request-auth.ts).
        if (
            SELF_ONLY_TOKEN_ROUTES.has(
                method + ' ' + routePattern,
            )
        ) {
            const targetIdentityId = params[0];
            if (
                typeof targetIdentityId === 'string'
                && targetIdentityId !== actor
                && !callerIsAdmin
            ) {
                return Response.json(
                    {
                        error: 'forbidden: ' + method + ' '
                            + pathname
                            + ' requires a role this principal'
                            + ' lacks',
                    },
                    { status: HTTP_FORBIDDEN },
                );
            }
        }
    } catch (error) {
        return redactedFenceFailure(ctx, error);
    }

    const isWrite = method === 'PUT' || method === 'POST'
        || method === 'DELETE' || method === 'PATCH';

    try {
        // The shadow-ledger pair: formed pre-tx (all crypto and
        // document resolution happen before a transaction opens
        // — see api/message-pair.ts), gated to routes wired in
        // MESSAGE_PAIR_WIRED_ROUTE_PATTERNS so no unwired route ever
        // advertises an ETag it did not store. Runs
        // INSIDE the try so a validation error raised while
        // precomputing the success body (below) is caught and
        // mapped to its usual HTTP status, exactly as if the
        // handler itself had raised it.
        let messagePair: MessagePair | undefined;
        if (isWrite && hasWriteHandler && !bearerExempt
            && MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.has(routePattern)) {
            // Nested attribute paths store under the type
            // attributes prefix directly (flat rewrite retired
            // Task 23).
            const { path: canonicalPrefix, name } =
                storedPathAndNameOf({
                    routePattern,
                    routeSegments: matched.segments,
                    pathSegments,
                    organization,
                    body,
                });
            // A DELETE has no write response spec: its
            // handler forms its answer — a tombstone's 204
            // with no body, or the claim release's 200 with
            // the work order's state. The gate short-circuits
            // the spec lookup for DELETE rather than asking
            // WRITE_RESPONSE_SPECS to key by (pattern, verb):
            // a route pattern can carry BOTH a PUT (200, its
            // written row) and a DELETE — the map's one
            // entry per pattern serves the PUT/POST verb only.
            // The rare pattern that wires BOTH a PUT and a POST
            // with genuinely different shapes (ai-members/:id),
            // or a synthesized-only PUT beside a live POST
            // (human-members/:id, Phase 8 Task 4), supplies a
            // PerVerbWriteResponseSpec instead — see
            // writeResponseSpecFor.
            const spec = method === 'DELETE'
                ? undefined
                : writeResponseSpecFor(routePattern, method);
            if (method !== 'DELETE' && spec === undefined) {
                throw new Error(
                    'no write response spec for wired route: '
                    + routePattern,
                );
            }
            // DELETE table: never-written 404 stores nothing;
            // already-gone 204 no append; live PUT proceeds.
            // An in-order DELETE is an operation on another
            // document (a release), which answers its state.
            if (
                method === 'DELETE'
                && conditionalOf(routePattern, method)
                    !== 'in-order'
            ) {
                const head = await documentHeadAt(
                    effective, canonicalPrefix, name,
                );
                if (head === null) {
                    return Response.json(
                        { error: 'Not found: ' + pathname },
                        { status: HTTP_NOT_FOUND },
                    );
                }
                if (head.method === 'DELETE') {
                    return new Response(null, {
                        status: HTTP_NO_CONTENT,
                        headers: {
                            'Operation-ID': ctx.operationId,
                        },
                    });
                }
            }
            messagePair = await formWriteMessagePair({
                method,
                pathname: requestTarget(request),
                routePattern,
                routeSegments: matched.segments,
                pathSegments,
                headerFields: requestHeaderFields(request),
                body,
                bodyBytes: arrived.bodyBytes,
                requesterIdentityId: actor,
                requestAt: ctx.requestAt,
                organization,
                operationId: ctx.operationId,
                requestId: ctx.requestId,
                ...(request.headers.get(IF_NONE_MATCH_HEADER)
                    !== null
                    ? { genesis: 'client' as const }
                    : {}),
                responseBody: spec?.successBody?.(
                    params, body, actor, organization,
                ),
                ...(routePattern
                    === 'identities/:id/token-revocations/:rid'
                    ? {
                        responseFields: [{
                            name: 'set-cookie',
                            value: refreshClearCookie(
                                request,
                            ),
                        }],
                    }
                    : {}),
            });
        }
        const received: ReceivedRequest = {
            target: requestTarget(request),
            headerFields: requestHeaderFields(request),
            bodyBytes: arrived.bodyBytes,
            requestId: ctx.requestId,
        };
        switch (method) {
            case 'GET': {
                if (matched.select !== undefined) {
                    return servedSelection(
                        await matched.select(
                            effective, params, actor,
                            organization, roles,
                            viewQuery,
                        ),
                        {
                            date: httpDateOf(nowUtc()),
                            requestId: ctx.requestId,
                        },
                    );
                }
                return Response.json(
                    {
                        error:
                            'Method GET not'
                            + ' allowed on '
                            + pathname,
                    },
                    { status: HTTP_METHOD_NOT_ALLOWED },
                );
            }
            case 'PUT': {
                if (!matched.put) {
                    return Response.json(
                        {
                            error:
                                'Method PUT not'
                                + ' allowed on '
                                + pathname,
                        },
                        { status: HTTP_METHOD_NOT_ALLOWED },
                    );
                }
                const result =
                    await matched.put(
                        effective,
                        params,
                        body!,
                        actor,
                        messagePair,
                        organization,
                        roles,
                        ctx.requestAt,
                        request.headers.get(
                            OPERATION_ID_HEADER,
                        ) ?? '',
                        received,
                    );
                if (messagePair !== undefined) {
                    const written = requireWrite(
                        messagePair, routePattern,
                    );
                    if (written.outcome === 'land') {
                        postWriteNotification(
                            adapter, routePattern, params,
                            body, organization, actor,
                        );
                    }
                    if (
                        written.outcome === 'stale'
                        || written.outcome === 'refused'
                    ) {
                        return written.response;
                    }
                    const putWiring = wiringForSegments(
                        matched.segments,
                    );
                    if (
                        putWiring !== undefined
                        && routePattern
                            === documentEntityPattern(
                                putWiring,
                            )
                        && written.answeredId !== null
                    ) {
                        return attachEtag(
                            written.response,
                            written.answeredId,
                        );
                    }
                    return written.response;
                }
                if (!invitationWriteOwnsNotification(
                    routePattern,
                )) {
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                }
                if (result === undefined) {
                    return new Response(null, {
                        status: HTTP_NO_CONTENT,
                    });
                }
                // An unwired handler forms its own pair,
                // so the former's answer is already whole.
                if (result instanceof Response) {
                    return result;
                }
                return Response.json(result);
            }
            case 'PATCH': {
                // Instance PATCH: create and update. The
                // former's answer already names the revision.
                if (!matched.patch) {
                    return Response.json(
                        {
                            error:
                                'Method PATCH not'
                                + ' allowed on '
                                + pathname,
                        },
                        { status: HTTP_METHOD_NOT_ALLOWED },
                    );
                }
                const result =
                    await matched.patch(
                        effective,
                        params,
                        body!,
                        actor,
                        messagePair,
                        organization,
                        roles,
                        received,
                    );
                if (messagePair !== undefined) {
                    const written = requireWrite(
                        messagePair, routePattern,
                    );
                    if (written.outcome === 'land') {
                        postWriteNotification(
                            adapter, routePattern, params,
                            body, organization, actor,
                        );
                    }
                    return written.response;
                }
                postWriteNotification(
                    adapter, routePattern, params,
                    body, organization, actor,
                );
                if (result === undefined) {
                    return new Response(null, {
                        status: HTTP_NO_CONTENT,
                    });
                }
                return Response.json(result);
            }
            case 'DELETE': {
                if (!matched.delete) {
                    return Response.json(
                        {
                            error:
                                'Method DELETE'
                                + ' not allowed'
                                + ' on '
                                + pathname,
                        },
                        { status: HTTP_METHOD_NOT_ALLOWED },
                    );
                }
                await matched.delete(
                    effective,
                    params,
                    actor,
                    messagePair,
                    organization,
                    roles,
                    received,
                );
                if (messagePair !== undefined) {
                    const written = requireWrite(
                        messagePair, routePattern,
                    );
                    if (written.outcome === 'land') {
                        postWriteNotification(
                            adapter, routePattern, params,
                            body, organization, actor,
                        );
                    }
                    return written.response;
                }
                postWriteNotification(
                    adapter, routePattern, params,
                    body, organization, actor,
                );
                return new Response(null, {
                    status: HTTP_NO_CONTENT,
                });
            }
            case 'POST': {
                // The dedicated authentication arm (Task 3, C1
                // discharge): both grant routes are bearerExempt,
                // so the generic pair block above never fires
                // for them. The table offers `post` so the verb
                // is visible; this arm still intercepts before
                // `matched.post` runs (matchRoute still matches
                // both patterns, so an unknown path still 404s
                // and a non-POST verb still 405s in its own
                // arm: a GET has no select, and PUT, PATCH, and
                // DELETE find no handler). The
                // seed carries everything
                // WriteMessagePairInput needs except the
                // requester identity and the response — only
                // the grant
                // itself, deep inside postToken/postAuthorize,
                // can resolve those (a code's issuer, a verified
                // token's subject) — so the grant forms its OWN
                // pair, pre-tx, and appends it as the last act of
                // its own domain transaction (authentication.ts).
                if (
                    routePattern === 'authentication/token'
                    || routePattern === 'authentication/authorize'
                ) {
                    const seed: AuthMessagePairSeed = {
                        requestAt: ctx.requestAt,
                        headerFields: received.headerFields,
                        bodyBytes: received.bodyBytes,
                        method,
                        pathname: received.target,
                        routePattern,
                        routeSegments: matched.segments,
                        pathSegments,
                        operationId: ctx.operationId,
                        requestId: received.requestId,
                    };
                    const doorBody = body ?? {};
                    const dispatched =
                        routePattern === 'authentication/token'
                            ? await postToken(
                                effective, doorBody, seed,
                                request,
                            )
                            : await postAuthorize(
                                effective, doorBody, seed,
                                request,
                            );
                    if (!dispatched.ok) {
                        if (dispatched.status
                            === HTTP_UNAUTHORIZED) {
                            console.warn(
                                'authentication failed',
                                {
                                    requestId: ctx.requestId,
                                    operationId:
                                        ctx.operationId,
                                    reason: dispatched.error,
                                },
                            );
                            return Response.json(
                                {
                                    error: wireGrantError(
                                        dispatched.error,
                                    ),
                                },
                                {
                                    status:
                                        dispatched.status,
                                },
                            );
                        }
                        return Response.json(
                            { error: dispatched.error },
                            { status: dispatched.status },
                        );
                    }
                    // Non-2xx stores no pair (the branch above
                    // already returned); a 2xx here always
                    // carries one, since the dedicated arm is
                    // the ONLY caller that seeds postToken/
                    // postAuthorize (exchangeBearerForOrganization,
                    // the other grantTokenExchange caller, never
                    // reaches here — it is an internal facade
                    // hop, not a route dispatch). Auth pairs are
                    // keyed by id (appendMessagePairAlways), not hash —
                    // two identical logins each land a row.
                    if (dispatched.messagePairId === undefined) {
                        throw new Error(
                            'authentication grant stored no'
                            + ' pair: ' + routePattern,
                        );
                    }
                    if (dispatched.wire === undefined) {
                        throw new Error(
                            'authentication grant stored no'
                            + ' wire: ' + routePattern,
                        );
                    }
                    // authentication/authorize mints an
                    // authorization code, not a session — no UI
                    // subscribes to it, so it posts nothing.
                    // authentication/token mints the session
                    // itself: decode the live response claims so
                    // the identity-tokens page refreshes
                    // cross-tab.
                    if (routePattern === 'authentication/token') {
                        const claims = decodeAccessToken(
                            (dispatched.response as {
                                access_token: string;
                            }).access_token,
                        );
                        adapter.postNotification({
                            kind: 'scoped',
                            identityIds: [claims.sub],
                            organizationIds: [
                                ...(claims.organizations ?? []),
                            ],
                        });
                    }
                    return dispatched.wire;
                }
                if (!matched.post) {
                    return Response.json(
                        {
                            error:
                                'Method POST'
                                + ' not allowed'
                                + ' on '
                                + pathname,
                        },
                        { status: HTTP_METHOD_NOT_ALLOWED },
                    );
                }
                const result = await matched.post(
                    effective,
                    params,
                    body!,
                    actor,
                    messagePair,
                    organization,
                    roles,
                    ctx.requestAt,
                    request.headers.get(
                        OPERATION_ID_HEADER,
                    ) ?? '',
                    received,
                );
                if (messagePair !== undefined) {
                    const written = requireWrite(
                        messagePair, routePattern,
                    );
                    if (written.outcome === 'land') {
                        postWriteNotification(
                            adapter, routePattern, params,
                            body, organization, actor,
                        );
                    }
                    return written.response;
                }
                if (!invitationWriteOwnsNotification(
                    routePattern,
                )) {
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                }
                if (result === undefined) {
                    return new Response(null, {
                        status: HTTP_NO_CONTENT,
                    });
                }
                // An unwired handler forms its own pair,
                // so the former's answer is already whole.
                if (result instanceof Response) {
                    return result;
                }
                return Response.json(result);
            }
            default:
                return Response.json(
                    {
                        error:
                            'Method '
                            + method
                            + ' not allowed',
                    },
                    { status: HTTP_METHOD_NOT_ALLOWED },
                );
        }
    } catch (error) {
        if (
            error instanceof MissingTableError
        ) {
            throw error;
        }
        if (error instanceof ApiError) {
            return Response.json(
                { error: error.message },
                { status: error.status },
            );
        }
        if (
            error instanceof EntityNotFoundError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_NOT_FOUND },
            );
        }
        if (
            error instanceof RetiredEntityError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_GONE },
            );
        }
        if (
            error instanceof ForeignOrganizationError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_FORBIDDEN },
            );
        }
        if (
            error instanceof UniqueConstraintError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_PRECONDITION_FAILED },
            );
        }
        if (
            error instanceof ValidationError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_BAD_REQUEST },
            );
        }
        // The fault is server-side detail; the wire gets a
        // fixed body, the console gets the evidence — keyed
        // by the request identity so the story correlates.
        console.error('request failed', {
            requestId: ctx.requestId,
            operationId: ctx.operationId,
            requestAt: ctx.requestAt,
            latencyMs: msSinceMonotonic(ctx.arrivalMs),
            method,
            pathname,
        }, error);
        return Response.json(
            { error: 'internal error' },
            { status: HTTP_INTERNAL_ERROR },
        );
    }
}

// What the client verb facade requires of its adapter: the
// unfenced tier's full contract (handleRequest's gate fences
// it per request) plus the latency shim — both presets pass
// a no-op today.
export type ClientFacadeAdapter =
    GuardedDbAdapter & LatencySimulation;

function wiringForSegments(
    segments: readonly string[],
): ReturnType<typeof documentFamilyWiring> {
    const family = segments[0] === 'organizations'
        ? (segments[2] ?? '')
        : (segments[0] ?? '');
    return documentFamilyWiring(family);
}

function documentEntityPattern(
    wiring: NonNullable<
        ReturnType<typeof documentFamilyWiring>
    >,
): string {
    return wiring.httpNest === 'organization'
        ? 'organizations/:id/' + wiring.family + '/:id'
        : wiring.family + '/:id';
}
