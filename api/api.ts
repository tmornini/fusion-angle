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
    canonicalPath,
    storedPathAndNameOf,
    requestHeaderFields,
    requestTarget,
    documentHeadAt,
    writeAnswerOf,
    ownWireOf,
    responseFromHead,
    attachEtag,
    attachDate,
    streamGetFromStored,
    parseEntityTags,
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from './message-pair.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import type { ReceivedRequest } from './message-pair.ts';
import {
    bodyOctetsOf,
} from './message-form.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import type {
    MessagePair, AuthMessagePairSeed,
} from './message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
} from './family-registry.ts';
import {
    documentFamilyWiring,
    documentHeadMessagePairId,
    entityIdParam,
    idFamilyOf,
    throwDocumentMiss,
    requireOrganization,
} from './document-family.ts';
import {
    messageStore,
} from './message-store.ts';
import {
    deriveInstanceHead,
    projectionOmitsStored,
} from './derive-record-instances.ts';
import { projectReadableValues } from './attribute-acl.ts';
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
    writeAuthorizerFor,
    assertWritableInOrganization,
} from './write-authorizer.ts';
import {
    postToken,
    postAuthorize,
    refreshClearCookie,
    refreshTokenFromCookieHeader,
    wireGrantError,
} from './authentication.ts';
import {
    ApiError,
    UnauthorizedError,
    RequestError,
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
    loadAttributeSchemaById,
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

const BASE_URL = 'http://localhost';

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
            === 'organizations/:id/invitations/:id'
        || routePattern
            === 'identities/:id/invitations/:id';
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

function octetsEqual(
    left: Uint8Array,
    right: Uint8Array,
): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false;
    }
    return true;
}

async function instanceAdvertised(
    db: DbAdapter,
    organization: string,
    typeId: string,
    instanceId: string,
    roles: readonly string[],
): Promise<{
    tag: string;
    limited: boolean;
} | undefined> {
    const head = await deriveInstanceHead(
        db, organization, typeId, instanceId,
    );
    if (head === undefined) return undefined;
    const attributesById = await loadAttributeSchemaById(
        db, organization, typeId,
    );
    const projected = projectReadableValues(
        head.values, attributesById, roles,
    );
    return {
        tag: head.messagePairId,
        limited: projectionOmitsStored(
            head.values, projected,
        ),
    };
}

function limitedHeaders(
    limited: boolean,
): Record<string, string> {
    return limited
        ? { 'Authorization-Limited-Attributes': 'true' }
        : {};
}

// The one catch shared by both pre-dispatch ownership regions
// (handleRequest, below) so their redaction discipline cannot
// diverge: fenceRequest membership/role reads, and the write
// authorizer's owner resolve. A thrown read is storage-
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
                            + 'invitations/:id'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/:id/versions/'
                    && fencePattern
                        !== 'identities/:id/'
                            + 'invitations/:id/versions/'
                            + ':etag'
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

    // Region B of the pre-dispatch write authorizer (Phase 12
    // Task 1, joined by WP8's self-only token-chain guard
    // below):
    // the one UNCONDITIONAL write guard below runs after body-
    // parse regardless of bearerExempt, mirroring Region A above.
    // The states/:id ownership authorizer RETIRED with the route
    // (states-document retirement Task 13); field-values leaf
    // write authorizer RETIRED with the leaf routes (Phase 15
    // Task 7).
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
        // Pre-write ownership authorizer for the 9 org-scoped
        // families' existing-id PUT/DELETE. Pair-plane
        // owner-null → genesis proceeds; foreign →
        // ForeignOrganizationError (HTTP 403). Runs BEFORE
        // formWriteMessagePair so a forged foreign id never
        // pays crypto or stores a pair.
        if (
            isWrite
            && hasWriteHandler
            && !bearerExempt
            && organization !== undefined
        ) {
            const writeAuthorizer = writeAuthorizerFor(
                routePattern, method,
            );
            if (writeAuthorizer !== undefined) {
                const entityId =
                    params[writeAuthorizer.idParamIndex];
                if (entityId !== undefined && entityId !== '') {
                    await assertWritableInOrganization(
                        effective,
                        entityId,
                        organization,
                        writeAuthorizer.table,
                    );
                }
            }
        }
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
            // Keyed through the wiring consult and the exact
            // entity pattern, so a family's sub-resource PUT
            // under the same prefix never reads the entity's
            // head.
            const wiring = wiringForSegments(
                matched.segments,
            );
            const isDocumentPut = method === 'PUT'
                && wiring !== undefined
                && routePattern
                    === documentEntityPattern(wiring);
            // Advertised ETag is the live PUT pair id. A
            // DELETE head is not live, so the same-body
            // no-append never answers over one.
            const head = isDocumentPut
                ? await documentHeadAt(
                    effective, canonicalPrefix, name,
                )
                : null;
            const livePut = head !== null
                && head.method === 'PUT'
                ? head.id
                : undefined;
            // DELETE responses are UNIVERSALLY 204 with no
            // body — every wired DELETE handler returns void
            // (message-pair.ts resolution: DELETEs join their
            // family's document class but never carry a
            // response body). The gate short-circuits the spec
            // lookup for DELETE rather than asking
            // WRITE_RESPONSE_SPECS to key by (pattern, verb):
            // a route pattern can carry BOTH a PUT (200, its
            // written row) and a DELETE (204) — the map's one
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
            // Same-body as live PUT head → 200, no append.
            // Body equality is octets, not ETag. The no-op
            // still takes the in-tx latch so it cannot
            // return a dead ETag.
            if (
                method === 'PUT'
                && livePut !== undefined
                && request.headers.get(IF_MATCH_HEADER) === null
                && request.headers.get(IF_NONE_MATCH_HEADER)
                    === null
            ) {
                const liveReq = await effective.messagePairs
                    .getById(livePut);
                if (liveReq !== undefined) {
                    const liveOctets = bodyOctetsOf(
                        parseWire(liveReq.request),
                    );
                    const newOctets = bodyOctetsOf(
                        parseWire(messagePair.requestMessage),
                    );
                    if (octetsEqual(liveOctets, newOctets)) {
                        const raced =
                            await effective.readTransaction(async (view) => {
                                    const latest =
                                        await documentHeadMessagePairId(
                                            view,
                                            canonicalPrefix,
                                            name,
                                        );
                                    return latest
                                        !== livePut;
                                },
                            );
                        if (raced) {
                            return Response.json(
                                {
                                    error: 'If-Match does not '
                                        + 'match the current '
                                        + 'document at '
                                        + pathname,
                                },
                                {
                                    status:
                                        HTTP_PRECONDITION_FAILED,
                                },
                            );
                        }
                        const stored =
                            await effective.messagePairs
                                .getById(livePut);
                        if (stored !== undefined) {
                            return attachEtag(
                                responseFromHead(
                                    stored.response,
                                    ctx.requestId,
                                ),
                                stored.id,
                            );
                        }
                    }
                }
            }
        }
        const received: ReceivedRequest = {
            target: requestTarget(request),
            headerFields: requestHeaderFields(request),
            bodyBytes: arrived.bodyBytes,
            requestId: ctx.requestId,
        };
        switch (method) {
            case 'GET': {
                if (!matched.get) {
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
                const streamedDocument =
                    await streamStoredDocumentGet(
                        effective,
                        routePattern,
                        params,
                        organization,
                    );
                if (streamedDocument !== undefined) {
                    return streamedDocument;
                }
                const streamedCollection =
                    await streamStoredCollectionGet(
                        effective,
                        routePattern,
                        organization,
                    );
                if (streamedCollection !== undefined) {
                    return streamedCollection;
                }
                const result = await matched.get(
                    effective,
                    params,
                    actor,
                    organization,
                    roles,
                );
                // ETag attach: the document GET of a family
                // whose PUT requires a conditional carries the
                // current head pair id — the client save's
                // baseline AND its echo source. Keyed through
                // the SAME wiring consult + exact-pattern match
                // the write side uses above (never a flows
                // literal).
                const readWiring = wiringForSegments(
                    matched.segments,
                );
                if (
                    readWiring !== undefined
                    && routePattern
                        === documentEntityPattern(
                            readWiring,
                        )
                    && conditionalOf(
                        documentEntityPattern(readWiring),
                        'PUT',
                    ) === 'required'
                ) {
                    const prefix = canonicalPath(
                        organization,
                        '/' + readWiring.family + '/',
                    );
                    // The derivation's OWN head pair id (Phase 4
                    // Task 8) — the SAME reduction the flipped GET
                    // above just ran to build `result`, not a
                    // second, divergent one
                    // (the store's document head read
                    // (`messageStore(db).getDocumentHead`) — the
                    // ANY-method LOCK head, still the write path's
                    // source above). Same value for a document-
                    // class route (tests/api-flow-document.test.ts
                    // pins the equality); one mechanism now.
                    const headMessagePairId =
                        await documentHeadMessagePairId(
                            effective, prefix,
                            entityIdParam(
                                readWiring, params,
                            ),
                        );
                    if (headMessagePairId !== undefined) {
                        return attachEtag(
                            Response.json(result),
                            headMessagePairId,
                        );
                    }
                }
                // Document /versions/:etag: ETag is the
                // path token.
                if (
                    routePattern.endsWith(
                        '/versions/:etag',
                    )
                ) {
                    return attachEtag(
                        Response.json(result),
                        param(
                            params, params.length - 1,
                        ),
                    );
                }
                // Instance detail ETag: the head pair id.
                if (
                    routePattern
                        === INSTANCE_DETAIL_PATTERN
                ) {
                    const advertisedGet =
                        await instanceAdvertised(
                            effective,
                            param(params, 0),
                            param(params, 1),
                            param(params, 2),
                            roles,
                        );
                    if (advertisedGet !== undefined) {
                        return attachEtag(
                            Response.json(result, {
                                headers: limitedHeaders(
                                    advertisedGet.limited,
                                ),
                            }),
                            advertisedGet.tag,
                        );
                    }
                }
                // Stream collection GET: one Date: now. No
                // collection ETag. No 304. Assemble surfaces
                // (organizations, invitations, members join)
                // stay Date-free.
                if (isLiveHeadCollectionGet(routePattern)) {
                    return attachDate(
                        Response.json(result), nowUtc(),
                    );
                }
                return Response.json(result);
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
                // and a non-POST verb still 405s via the
                // ordinary matched.get/put/delete checks). The
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

function setCookieFromResponse(response: Response): string {
    const cookies = typeof response.headers.getSetCookie
        === 'function'
        ? response.headers.getSetCookie()
        : [];
    if (cookies.length > 0) {
        return cookies.join('; ');
    }
    return response.headers.get('Set-Cookie') ?? '';
}

async function unwrapResponse<T>(
    response: Response,
): Promise<T> {
    if (response.ok) {
        const text = await response.text();
        if (text === '') return undefined as T;
        const parsed: unknown = JSON.parse(text);
        const refresh = refreshTokenFromCookieHeader(
            setCookieFromResponse(response),
        );
        if (
            refresh !== ''
            && typeof parsed === 'object'
            && parsed !== null
            && !Array.isArray(parsed)
            && !('refresh_token' in parsed)
        ) {
            return {
                ...(parsed as Record<string, unknown>),
                refresh_token: refresh,
            } as T;
        }
        return parsed as T;
    }
    const { error } =
        (await response.json()) as {
            error: string;
        };
    if (response.status === HTTP_UNAUTHORIZED) {
        throw new UnauthorizedError(error);
    }
    throw new RequestError(
        `${error} (${response.url})`,
        response.status,
    );
}

// Authorization and Content-Type only. operation-id is a
// caller header. request-id is the server's; this function
// neither copies nor mints one.
function facadeHeaders(
    token: string,
    contentType: boolean,
): Record<string, string> {
    const headers: Record<string, string> = {};
    if (token !== '') {
        headers['Authorization'] = 'Bearer ' + token;
    }
    if (contentType) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

// The ONE await site for a GET-shaped facade call — GET
// and GETWithEtag are thin wrappers over this, so the
// simulateLatency literal-count pin
// (pair-write-coverage.test.ts) stays at exactly 4 no matter
// how many GET-shaped verbs read from it (delegation, not a
// copy-pasted fifth await site).
async function getResponse(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?:
        readonly (readonly [string, string])[],
): Promise<Response> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(token, false);
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            { headers },
        ),
    );
}

// The ONE await site for a body-write facade call — PUT,
// PUTWithEtag, PATCH, and PATCHWithEtag all share it so the
// latency pin stays 4 (R3: never a fifth bare
// await adapter.simulateLatency()).
async function bodyWriteResponse(
    adapter: ClientFacadeAdapter,
    method: 'PUT' | 'PATCH',
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<Response> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(token, true);
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    const body = JSON.stringify(payload);
    headers['content-length'] = String(
        new TextEncoder().encode(body).byteLength,
    );
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                method,
                headers,
                body,
            },
        ),
    );
}

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

// Stream families read the stored head: a work order's is
// its whole state. Flows stay on derive for
// hasUndoHistory.
function streamFamilyWiring(
    routePattern: string,
): ReturnType<typeof documentFamilyWiring> {
    const family = idFamilyOf(routePattern);
    if (
        family === undefined
        || family === 'flows'
    ) {
        return undefined;
    }
    return documentFamilyWiring(family);
}

function collectionFamilyOf(
    routePattern: string,
): string | undefined {
    if (!routePattern.endsWith('/')) return undefined;
    const rest = routePattern.slice(0, -1);
    if (rest.startsWith('organizations/:id/')) {
        const family = rest.slice(
            'organizations/:id/'.length,
        );
        if (family.includes('/')) return undefined;
        return family;
    }
    if (rest.includes('/')) return undefined;
    return rest;
}

function streamCollectionWiring(
    routePattern: string,
): ReturnType<typeof documentFamilyWiring> {
    const family = collectionFamilyOf(routePattern);
    if (
        family === undefined
        || family === 'flows'
        || family === 'members'
    ) {
        return undefined;
    }
    return documentFamilyWiring(family);
}

async function streamStoredDocumentGet(
    db: DbAdapter,
    routePattern: string,
    params: string[],
    organization: Id | undefined,
): Promise<Response | undefined> {
    const wiring = streamFamilyWiring(routePattern);
    if (wiring === undefined) return undefined;
    const organizationId = requireOrganization(organization);
    const id = entityIdParam(wiring, params);
    const prefix = canonicalPath(
        organizationId, '/' + wiring.family + '/',
    );
    const stored = await messageStore(db).getDocumentHead(prefix, id);
    if (stored === null) {
        throw await throwDocumentMiss(
            wiring, db, organizationId, id,
        );
    }
    return streamGetFromStored(stored, nowUtc());
}

async function streamStoredCollectionGet(
    db: DbAdapter,
    routePattern: string,
    organization: Id | undefined,
): Promise<Response | undefined> {
    const wiring = streamCollectionWiring(routePattern);
    if (wiring === undefined) return undefined;
    const organizationId = requireOrganization(organization);
    const prefix = canonicalPath(
        organizationId, '/' + wiring.family + '/',
    );
    const rows = await messageStore(db).getCollection(
        prefix,
    );
    return attachDate(Response.json(rows), nowUtc());
}

// Stream family collection GET (live heads). members is
// a memberships join (not this path). record-types is
// org-nested, so its pattern is not the family name.
function isLiveHeadCollectionGet(
    routePattern: string,
): boolean {
    if (routePattern === RECORD_TYPES_COLLECTION_PATTERN) {
        return true;
    }
    const family = collectionFamilyOf(routePattern);
    if (family === undefined || family === 'members') {
        return false;
    }
    return documentFamilyWiring(family) !== undefined;
}

// Strong ETag header → unquoted validator (strip
// surrounding quotes when present). Absent / empty →
// undefined.
function etagFromHeader(
    response: Response,
): string | undefined {
    const raw = response.headers.get('ETag');
    if (raw === null || raw === '') {
        return undefined;
    }
    if (
        raw.length >= 2
        && raw[0] === '"'
        && raw[raw.length - 1] === '"'
    ) {
        return raw.slice(1, -1);
    }
    return raw;
}

export async function GET<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?:
        readonly (readonly [string, string])[],
): Promise<T> {
    return unwrapResponse<T>(
        await getResponse(
            adapter, resource, token, headerFields,
        ),
    );
}

// GET plus the strong ETag (quotes stripped), for the
// If-Match of a later conditional PUT or PATCH.
export async function GETWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?:
        readonly (readonly [string, string])[],
): Promise<{ body: T; etag: string | undefined }> {
    const response = await getResponse(
        adapter, resource, token, headerFields,
    );
    const body = await unwrapResponse<T>(response);
    return {
        body,
        etag: etagFromHeader(response),
    };
}

export async function PUT<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<T> {
    return unwrapResponse<T>(
        await bodyWriteResponse(
            adapter, 'PUT', resource, payload, token,
            headerFields,
        ),
    );
}

export async function PUTWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<{ body: T; etag: string | undefined }> {
    const response = await bodyWriteResponse(
        adapter, 'PUT', resource, payload, token,
        headerFields,
    );
    const body = await unwrapResponse<T>(response);
    return {
        body,
        etag: etagFromHeader(response),
    };
}

export async function PATCH<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<T> {
    return unwrapResponse<T>(
        await bodyWriteResponse(
            adapter, 'PATCH', resource, payload, token,
            headerFields,
        ),
    );
}

export async function PATCHWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<{ body: T; etag: string | undefined }> {
    const response = await bodyWriteResponse(
        adapter, 'PATCH', resource, payload, token,
        headerFields,
    );
    const body = await unwrapResponse<T>(response);
    return {
        body,
        etag: etagFromHeader(response),
    };
}

// The ONE await site for a DELETE-shaped facade call —
// DELETE and DELETEWithEtag share it so the latency pin
// stays 4.
async function deleteResponse(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<Response> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(token, false);
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                method: 'DELETE',
                headers,
            },
        ),
    );
}

export async function DELETE(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<void> {
    await unwrapResponse(
        await deleteResponse(
            adapter, resource, token, headerFields,
        ),
    );
}

// DELETE plus the strong ETag of the state it answers: a
// release answers its work order's version.
export async function DELETEWithEtag(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<{ etag: string | undefined }> {
    const response = await deleteResponse(
        adapter, resource, token, headerFields,
    );
    await unwrapResponse(response);
    return { etag: etagFromHeader(response) };
}

async function postResponse(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<Response> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(token, true);
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    const body = JSON.stringify(payload);
    headers['content-length'] = String(
        new TextEncoder().encode(body).byteLength,
    );
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                method: 'POST',
                headers,
                body,
            },
        ),
    );
}

export async function POST<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<T> {
    return unwrapResponse<T>(
        await postResponse(
            adapter, resource, payload, token,
            headerFields,
        ),
    );
}

export async function postForHeaders(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<{
    readonly status: number;
    readonly headers: Headers;
    readonly body: string;
}> {
    const response = await postResponse(
        adapter, resource, payload, token, headerFields,
    );
    return {
        status: response.status,
        headers: response.headers,
        body: await response.text(),
    };
}
