import type {
    DbAdapter,
    GuardedDbAdapter,
} from './db.ts';
import {
    EntityNotFoundError,
    ForeignOrganizationError,
    foreignOrganizationMessage,
    MissingTableError,
    UniqueConstraintError,
} from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    ValidationError,
    msSinceUtc,
} from './types.ts';
import type { Id } from './types.ts';
import { messageAddress } from './message-address.ts';
import {
    formWritePair,
    headPairIdAt,
    storedResponseFor,
    createdEntityUriId,
    canonicalUriPrefix,
    hoistedHeaderFields,
    responseFromStored,
    attachEtag,
    parseIfMatch,
    PAIR_WIRED_ROUTE_PATTERNS,
    DOCUMENT_CLASS_ROUTE_PATTERNS,
    REPLAY_EXEMPT_ROUTE_PATTERNS,
    IF_RESPONSE_ID_HEADER,
    IF_MATCH_HEADER,
} from './message-pair.ts';
import type { MessagePair, AuthPairSeed } from './message-pair.ts';
import {
    familyRegistration,
    INSTANCE_DETAIL_PATTERN,
    CREATE_ONLY_PUT_ROUTE_PATTERNS,
} from './family-registry.ts';
import {
    documentFamilyWiring,
    documentHeadPairId,
} from './document-family.ts';
import {
    instancesUriPrefix,
    deriveInstanceHead,
} from './derive-record-instances.ts';
import {
    ANONYMOUS_ID,
    decodeAccessToken,
} from './access-token.ts';
import {
    identityTargetsFor,
} from './notifications.ts';
import {
    resolveGlobalOwner,
    missedReadError,
} from './derive-states.ts';
import {
    writeAuthorizerFor,
    assertWritableInOrganization,
} from './write-authorizer.ts';
import {
    exchangeBearerForOrganization,
    postToken,
    postAuthorize,
} from './authentication.ts';
import {
    ApiError,
    UnauthorizedError,
    RequestError,
    HTTP_NO_CONTENT,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_METHOD_NOT_ALLOWED,
    HTTP_INTERNAL_ERROR,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_PRECONDITION_FAILED,
    HTTP_PRECONDITION_REQUIRED,
} from './http-errors.ts';
import {
    AUTHENTICATION_ROUTES,
    BOOTSTRAP_ROUTES,
    authenticateRequest,
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
    type Route,
    type WriteResponseSpec,
} from './routes.ts';
import {
    invitationsRequest,
} from './invitations-domain.ts';
import {
    identityDefaultOrganizationRequest,
    organizationsEnumerationRequest,
} from './organization-requests.ts';
import {
    incomingContext,
    REQUEST_ID_HEADER,
    type IncomingContext,
} from './request-context.ts';

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
} from './http-errors.ts';

const routeTable: readonly Route[] = routes;

const BASE_URL = 'http://localhost';

// Facade rewrite: exchange the caller's bearer for a token
// scoped to segments[1], then re-enter the gate against the
// flat resource path (segments[2:]). A non-member's exchange
// is a 403 — the tenant fence — and mints nothing.
async function facadeRequest(
    ctx: IncomingContext,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const header = request.headers.get('authorization');
    if (header === null
        || !header.startsWith('Bearer ')) {
        return Response.json(
            { error: 'facade requires a bearer token' },
            { status: HTTP_UNAUTHORIZED },
        );
    }
    const bearer = header.slice('Bearer '.length);
    const exchanged = await exchangeBearerForOrganization(
        ctx.base, bearer, segments[1]!,
    );
    if (!exchanged.ok) {
        return Response.json(
            { error: exchanged.error },
            { status: exchanged.status },
        );
    }
    const flatUrl = new URL(request.url);
    flatUrl.pathname = '/' + segments.slice(2).join('/');
    const headers = new Headers(request.headers);
    headers.set(
        'authorization',
        'Bearer ' + exchanged.response.access_token,
    );
    // The inner hop is the SAME user request — it keeps the
    // outer vessel's id across the re-entry.
    headers.set(REQUEST_ID_HEADER, ctx.requestId);
    const hasBody = ctx.method === 'PUT'
        || ctx.method === 'POST'
        || ctx.method === 'PATCH';
    const flatRequest = new Request(flatUrl.toString(), {
        method: ctx.method,
        headers,
        ...(hasBody
            ? { body: await request.text() } : {}),
    });
    return handleRequest(ctx.base, flatRequest);
}

// The gate-side Decision 5 post: fired once per successful
// write, AFTER the route handler's promise resolves (so on
// IndexedDB the commit has already reached `oncomplete`).
// BOOTSTRAP_ROUTES (the snapshot plane) replace the whole
// store, so they post a full-refresh event rather than a
// scoped one; every other write posts the fenced organization,
// identity targets the route/body name, and the actor so the
// writer's other tabs refresh even when the session is a flat
// (un-exchanged) token that cannot match on organization.
function postWriteNotification(
    adapter: GuardedDbAdapter,
    routePattern: string,
    params: readonly string[],
    body: Record<string, unknown> | undefined,
    organization: Id | undefined,
    actor: Id,
): void {
    if (BOOTSTRAP_ROUTES.has(routePattern)) {
        adapter.postNotification({ kind: 'full' });
        return;
    }
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
// of `status` at its top level — supplies one spec per verb
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
    if (entry === undefined || 'status' in entry) {
        return entry;
    }
    if (method === 'PUT') return entry.put;
    if (method === 'PATCH') return entry.patch;
    return entry.post;
}

// Instance PATCH ETag (R8): the REVISION pair's response
// id (new head), not the wire PATCH pair. Recovery is one
// UNIQUE follows lookup on the If-Match-verified head the
// wire operation raced — synthesis Mechanism (Task 17).
async function revisionEtagForInstancePatch(
    db: DbAdapter,
    ifMatchPairId: string,
): Promise<string | undefined> {
    const rows = await db.responses.getAllWhere(
        'follows', ifMatchPairId,
    );
    return rows[0]?.id;
}

// The one catch shared by both pre-dispatch ownership regions
// (handleRequest, below) so their redaction discipline cannot
// diverge: fenceRequest membership/role reads, and the write
// authorizer's owner resolve. A thrown read is storage-
// corruption territory, not a domain outcome — it gets the SAME
// fixed 500 body the domain-boundary catch (below, ~:938)
// already gives every other unmapped fault, console-logged with
// the request identity for correlation. MissingTableError is
// the one designed exception: it re-raises FIRST, exactly as
// the domain-boundary catch re-raises it, so
// web-app/core.ts's redirectIfMissingTable recovery still fires.
function redactedFenceFailure(
    ctx: IncomingContext,
    error: unknown,
): Response {
    if (error instanceof MissingTableError) {
        throw error;
    }
    console.error('fence read failed', {
        requestId: ctx.requestId,
        requestAt: ctx.requestAt,
        latencyMs: msSinceUtc(ctx.requestAt),
        method: ctx.method,
        pathname: ctx.pathname,
    }, error);
    return Response.json(
        { error: 'internal error' },
        { status: HTTP_INTERNAL_ERROR },
    );
}

export async function handleRequest(
    adapter: GuardedDbAdapter,
    request: Request,
): Promise<Response> {
    const ctx = incomingContext(adapter, request);
    const { method, pathname } = ctx;
    const pathSegments = pathname
        .split('/')
        .filter(Boolean);
    if (pathSegments[0] === 'identities'
        && pathSegments.length === 3
        && pathSegments[2] === 'default-org') {
        return identityDefaultOrganizationRequest(
            ctx, request, pathSegments,
        );
    }
    // The invitation surface is identity/org-spanning, so it
    // runs on the BASE adapter with explicit guards rather than
    // the org-scoped route table — see invitationsRequest.
    if (pathSegments[0] === 'invitations') {
        return invitationsRequest(
            ctx, request, pathSegments,
        );
    }
    // Enumerating one's own orgs is identity-scoped, not
    // org-owned: it runs above the admin gate so a roleless
    // member can boot. Only the bare GET — PUT (create) and
    // /organizations/:id keep the org-scoped route handling.
    if (pathSegments[0] === 'organizations'
        && pathSegments.length === 1
        && method === 'GET') {
        return organizationsEnumerationRequest(ctx, request);
    }
    // Match first (pure, no I/O). Authentication runs before
    // the no-match 404 so an unauthenticated caller never maps
    // route topology (unknown path and real route both 401).
    // In-table organizations/... patterns win over the facade
    // when registered; the facade swallows only unmatched
    // nested org paths (length ≥ 3).
    const match = matchRoute(routeTable, pathSegments);
    // Facade: /organizations/:org/:entity[/:id] — exchange the
    // caller's bearer for an org-scoped token and re-enter the
    // gate against the flat resource path, so the existing
    // handler is fenced automatically. Organization rides the
    // one verified token, never the path.
    if (
        match === null
        && pathSegments[0] === 'organizations'
        && pathSegments.length >= 3
    ) {
        return facadeRequest(ctx, request, pathSegments);
    }
    const matchedRoutePattern = match !== null
        ? match.route.segments.join('/')
        : undefined;
    // Every authenticated request is fenced — see
    // fenceRequest, which completes the vessel: the
    // organization, the live memberships, and the roles.
    // Surviving stores are global (message plane);
    // pair-plane tenancy rides uri_prefix. effective stays
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
    // effective/actor/organization for WP8's self-only revocation
    // guard (Region B, below): MEMBER_VERBS widens PUT
    // /identity-token-revocations to the member tier, but an
    // admin may still name any identity. False for a bearer-
    // exempt route (no fence ran, so no role to hold) — the
    // guard below only ever runs on an authenticated route.
    let callerIsAdmin = false;
    // Fenced claim roles for the active organization —
    // threaded to every handler (Task 10 reconciliation 5).
    // Empty for bearer-exempt routes (no fence ran).
    let roles: readonly string[] = [];
    // BOOTSTRAP_ROUTES: the accepted dev-tier auth-free
    // snapshot plane (removed at the Postgres server tier) —
    // see api/request-auth.ts. An unmatched path can never be
    // exempt — bearerExempt requires a defined route pattern.
    const bearerExempt = matchedRoutePattern !== undefined
        && (AUTHENTICATION_ROUTES.has(matchedRoutePattern)
            || BOOTSTRAP_ROUTES.has(matchedRoutePattern));
    if (!bearerExempt) {
        const authed =
            await authenticateRequest(ctx, request);
        if (typeof authed === 'string') {
            return Response.json(
                { error: authed },
                { status: HTTP_UNAUTHORIZED },
            );
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
                return Response.json(
                    { error: fence.error },
                    { status: fence.status },
                );
            }
            const fenced = fence.ctx;
            // Nested org path fence: after fenceRequest and
            // before authorizeRequest. Path org never authorizes
            // alone — mismatch (incl. nonexistent path org)
            // is 403 with a fixed body. No auto-exchange.
            // Bare organizations/:id keeps its own membership
            // fence below; every other organizations/... match
            // takes this arm.
            if (
                match !== null
                && match.route.segments[0]
                    === 'organizations'
                && fencePattern !== 'organizations/:id'
                && fenceParams[0]
                    !== fenced.organization
            ) {
                return Response.json(
                    {
                        error: 'forbidden: path organization'
                            + ' does not match the token'
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
            // organizations/:id is global passthrough; fence
            // READS to the caller's memberships. A real org the
            // caller is not a member of is 403 (honest); a
            // genuinely absent id stays 404. PUT is not gated
            // here — a new org is created before its first
            // membership exists.
            if (method === 'GET'
                && fencePattern === 'organizations/:id'
                && !fenced.memberOrganizations
                    .has(param(fenceParams, 0))) {
                const organizationId =
                    param(fenceParams, 0);
                // Orgs self-own (resolveGlobalOwner →
                // resolveOwningOrganization returns the org
                // id when the document exists).
                const owner = await resolveGlobalOwner(
                    adapter,
                    organizationId,
                    fenced.organization,
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
            callerIsAdmin = fenced.roles.includes('admin');
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
        const parse = await parseObjectBody(request);
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

    // Region B of the pre-dispatch write authorizer (Phase 12
    // Task 1, joined by WP8's self-only revocation guard below):
    // the one UNCONDITIONAL write guard below runs after body-
    // parse regardless of bearerExempt, mirroring Region A above.
    // The states/:id ownership authorizer RETIRED with the route
    // (states-address retirement Task 13); field-values leaf
    // write authorizer RETIRED with the leaf routes (Phase 15
    // Task 7).
    try {
        // WP8 (Phase 13 Task 8): the self-only revocation guard.
        // MEMBER_VERBS widens PUT /identity-token-revocations to
        // the member tier (Region A's route-policy check already
        // cleared it), but the revocation's TARGET identity_id
        // rides the BODY, parsed above — the URL :id is the
        // revocation ROW's own id, never the target — so no
        // upstream check has fenced ownership yet. A member may
        // revoke only its OWN chain; an admin may name any
        // identity. The 403 body reuses authorizeRequest's OWN
        // wording (request-auth.ts) — byte-identical to what
        // EVERY member request against this route returned before
        // this task, self or foreign alike — so a foreign-target
        // member sees no wire change at all; only the self-target
        // case flips 403 to the admin path's exact success shape.
        if (
            method === 'PUT'
            && routePattern === 'identity-token-revocations/:id'
        ) {
            const targetIdentityId = body?.identity_id;
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

    try {
        // Pre-write ownership authorizer for the 9 org-scoped
        // families' existing-id PUT/DELETE. Pair-plane
        // owner-null → genesis proceeds; foreign →
        // ForeignOrganizationError (HTTP 403). Runs BEFORE
        // formWritePair so a forged foreign id never pays
        // crypto or stores a pair.
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
        // Create-only PUT (Task 15): If-Match is rejected
        // before pair formation — create is unconditional
        // and the in-tx spent-address check owns the race.
        const isCreateOnlyWrite = method === 'PUT'
            && CREATE_ONLY_PUT_ROUTE_PATTERNS
                .has(routePattern);
        if (
            isCreateOnlyWrite
            && request.headers.get(IF_MATCH_HEADER)
                !== null
        ) {
            return Response.json(
                {
                    error: 'If-Match is not accepted on PUT: '
                        + 'create is unconditional at '
                        + pathname,
                },
                { status: HTTP_BAD_REQUEST },
            );
        }
        // The shadow-ledger pair: formed pre-tx (all crypto and
        // address resolution happen before a transaction opens
        // — see api/message-pair.ts), gated to routes wired in
        // PAIR_WIRED_ROUTE_PATTERNS so no unwired route ever
        // advertises a Response-ID it did not store. Runs
        // INSIDE the try so a validation error raised while
        // precomputing the success body (below) is caught and
        // mapped to its usual HTTP status, exactly as if the
        // handler itself had raised it.
        let pair: MessagePair | undefined;
        if (isWrite && hasWriteHandler && !bearerExempt
            && PAIR_WIRED_ROUTE_PATTERNS.has(routePattern)) {
            // Nested attribute paths store under the type
            // attributes prefix directly (flat rewrite retired
            // Task 23).
            const address = messageAddress(
                matched.segments, pathSegments,
            );
            const canonicalPrefix = canonicalUriPrefix(
                organization, address.uriPrefix,
            );
            const uriId = createdEntityUriId(
                routePattern, body,
            ) ?? address.uriId;
            // The head-read class is encoded PER ROUTE PATTERN,
            // never inferred from uriId — an event-append
            // address (states/:id) has a non-empty uriId yet
            // must never chain (message-pair.ts). Create-only
            // (R10) forces undefined so genesis carries neither
            // supersedes nor follows — the in-tx spent check
            // owns the race.
            const headPairId =
                !isCreateOnlyWrite
                && DOCUMENT_CLASS_ROUTE_PATTERNS
                    .has(routePattern)
                    ? await headPairIdAt(
                        effective, canonicalPrefix, uriId,
                    )
                    : undefined;
            // The locked/simple divide (spec §The two PUT classes): keyed by
            // the route's family registration THROUGH THE WIRING CONSULT —
            // never a blanket family-registry or
            // DOCUMENT_CLASS_ROUTE_PATTERNS read — so a family whose
            // registration says 'locked' but has no row in
            // document-family.ts's wiring table never rides this arm; only a
            // route actually served via documentPutHandler can — flows is
            // the live family that rides the locked arm today (registered in
            // document-family.ts's wiring table AND 'locked' in
            // family-registry.ts). The routePattern check (not merely the
            // first segment) matters once a family's OTHER routes share its
            // prefix (e.g. a future locked family's own :id/sub-resource PUT
            // must never inherit the entity route's four-outcome table) —
            // documentEntityRoute's own pattern is always exactly
            // `${family}/:id`. PUT-only: the two PUT classes govern PUT,
            // never POST/DELETE.
            const wiring = documentFamilyWiring(
                matched.segments[0] ?? '',
            );
            const isLockedWrite = method === 'PUT'
                && wiring !== undefined
                && routePattern === wiring.family + '/:id'
                && familyRegistration(wiring.family)
                    ?.concurrency === 'locked';
            // The hoisted echo: read directly (not merely via
            // hoisted-header storage) so the gate can compare it
            // against the head BEFORE dispatch. Only consulted
            // for a locked write — inert (null) otherwise.
            const echo = isLockedWrite
                ? request.headers.get(IF_RESPONSE_ID_HEADER)
                : null;
            // follows is set ONLY when the echo matches the
            // current head — the locked sibling of headPairId's
            // supersedes; the two are mutually exclusive by
            // construction (a locked write never supersedes).
            const follows = isLockedWrite
                && echo !== null && echo === headPairId
                ? echo : undefined;
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
                ? { status: HTTP_NO_CONTENT }
                : writeResponseSpecFor(routePattern, method);
            if (spec === undefined) {
                throw new Error(
                    'no write response spec for wired route: '
                    + routePattern,
                );
            }
            pair = await formWritePair({
                method, pathname, routePattern,
                routeSegments: matched.segments,
                pathSegments,
                headerFields: hoistedHeaderFields(request),
                body,
                requesterIdentityId: actor,
                requestAt: ctx.requestAt,
                organization,
                responseStatus: spec.status,
                responseBody: spec.successBody?.(
                    params, body, actor, organization,
                ),
                // A locked write never supersedes (its head-read
                // decides genesis/412/follows, never a chain);
                // a simple write carries headPairId exactly as
                // today.
                headPairId: isLockedWrite ? undefined : headPairId,
                ...(follows === undefined ? {} : { follows }),
            });
            // The pre-tx idempotency fast-path: a byte-
            // identical resend never reaches the handler and
            // posts no notification — nothing was written.
            // Skipped for REPLAY_EXEMPT_ROUTE_PATTERNS: those
            // routes' own domain guard makes serving the cached
            // response wrong rather than merely redundant — see
            // message-pair.ts. ORDERING IS LOAD-BEARING: this
            // fast path runs BEFORE the locked four-outcome table
            // below, so a byte-identical resend of an
            // already-succeeded locked write (whose echo is now
            // stale against the NEW head) replays instead of
            // 412ing.
            if (!REPLAY_EXEMPT_ROUTE_PATTERNS.has(routePattern)) {
                const replay = await storedResponseFor(
                    effective, pair.requestHash,
                );
                if (replay !== undefined) {
                    const response =
                        responseFromStored(replay);
                    if (
                        routePattern
                            === INSTANCE_DETAIL_PATTERN
                    ) {
                        // PUT create: ETag = wire pair id.
                        // PATCH: ETag = revision that followed
                        // the If-Match head (R8 original).
                        if (method === 'PATCH') {
                            const raw = request.headers
                                .get(IF_MATCH_HEADER);
                            const ifMatch = raw === null
                                ? undefined
                                : parseIfMatch(raw);
                            if (ifMatch !== undefined) {
                                const revisionId =
                                    await revisionEtagForInstancePatch(
                                        effective, ifMatch,
                                    );
                                if (
                                    revisionId !== undefined
                                ) {
                                    return attachEtag(
                                        response,
                                        revisionId,
                                    );
                                }
                            }
                        }
                        return attachEtag(
                            response, replay.id,
                        );
                    }
                    return response;
                }
            }
            // The locked four-outcome table (spec §The two PUT
            // classes), applied ONLY after the replay fast-path
            // MISSES: head present + echo absent → 412; echo
            // present + != head → 412; echo present + == head →
            // follows already set above, proceed; head absent +
            // echo absent → genesis, proceed. A 412 here returns
            // BEFORE dispatch, and appendMessagePair only ever
            // runs inside the op's own tx, so NOTHING is stored.
            if (isLockedWrite) {
                if (headPairId !== undefined && echo === null) {
                    return Response.json(
                        {
                            error: 'If-Response-ID is required: '
                                + 'a document already exists at '
                                + pathname,
                        },
                        { status: HTTP_PRECONDITION_FAILED },
                    );
                }
                if (echo !== null && echo !== headPairId) {
                    return Response.json(
                        {
                            error: 'If-Response-ID does not '
                                + 'match the current document '
                                + 'at ' + pathname,
                        },
                        { status: HTTP_PRECONDITION_FAILED },
                    );
                }
            }
            // Instance PATCH If-Match ladder (Task 17 / R5):
            // AFTER replay (load-bearing). Tombstone == absent.
            // Wire pair is operation-plane; revision pair
            // carries follows = verified head (UNIQUE
            // backstop).
            if (
                method === 'PATCH'
                && routePattern
                    === INSTANCE_DETAIL_PATTERN
            ) {
                const pathOrganization = param(params, 0);
                const typeId = param(params, 1);
                const instanceId = param(params, 2);
                const head = await deriveInstanceHead(
                    effective,
                    pathOrganization,
                    typeId,
                    instanceId,
                );
                if (head === undefined) {
                    throw await missedReadError(
                        effective,
                        instanceId,
                        organization
                            ?? pathOrganization,
                        'record_instances',
                    );
                }
                const raw = request.headers
                    .get(IF_MATCH_HEADER);
                if (raw === null) {
                    return Response.json(
                        {
                            error: 'If-Match is required '
                                + 'to PATCH ' + pathname,
                        },
                        {
                            status:
                                HTTP_PRECONDITION_REQUIRED,
                        },
                    );
                }
                const ifMatch = parseIfMatch(raw);
                if (ifMatch === undefined) {
                    return Response.json(
                        {
                            error: 'If-Match must carry '
                                + 'exactly one strong '
                                + 'validator',
                        },
                        { status: HTTP_BAD_REQUEST },
                    );
                }
                if (ifMatch !== head.pairId) {
                    return Response.json(
                        {
                            error: 'If-Match does not '
                                + 'match the current '
                                + 'instance at '
                                + pathname,
                        },
                        {
                            status:
                                HTTP_PRECONDITION_FAILED,
                        },
                    );
                }
            }
        }
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
                const result = await matched.get(
                    effective,
                    params,
                    actor,
                    organization,
                    roles,
                );
                // Response-ID attach (spec §The two PUT
                // classes): a locked-family document GET
                // carries the current head pair id as
                // provenance — the C6 client save's baseline
                // AND its echo source. Keyed through the SAME
                // wiring consult + exact-pattern match the
                // write side's four-outcome table uses above
                // (never a blanket family-registry or
                // DOCUMENT_CLASS_ROUTE_PATTERNS read, never a
                // flows literal). Below the three-instance
                // threshold with the write side's own inline
                // check (Commandment IX Generality) — kept
                // duplicated rather than prematurely shared.
                const readWiring = documentFamilyWiring(
                    matched.segments[0] ?? '',
                );
                if (
                    readWiring !== undefined
                    && routePattern
                        === readWiring.family + '/:id'
                    && familyRegistration(readWiring.family)
                        ?.concurrency === 'locked'
                ) {
                    const prefix = canonicalUriPrefix(
                        organization,
                        '/' + readWiring.family + '/',
                    );
                    // The derivation's OWN head pair id (Phase 4
                    // Task 8) — the SAME reduction the flipped GET
                    // above just ran to build `result`, not a
                    // second, divergent one (headPairIdAt's own
                    // ANY-method LOCK head, still the write path's
                    // source above). Same value for a document-
                    // class address (tests/api-flow-document.test.ts
                    // pins the equality); one mechanism now.
                    const headPairId = await documentHeadPairId(
                        effective, prefix, param(params, 0),
                    );
                    if (headPairId !== undefined) {
                        return Response.json(result, {
                            headers: {
                                'Response-ID': headPairId,
                            },
                        });
                    }
                }
                // Instance detail ETag (Task 16 / R8): strong
                // validator from the head document-pair id
                // (PUT|DELETE only — never a PATCH wire pair).
                // Distinct from responses.etag (body sha).
                if (
                    routePattern
                        === INSTANCE_DETAIL_PATTERN
                ) {
                    const headPairId =
                        await documentHeadPairId(
                            effective,
                            instancesUriPrefix(
                                param(params, 0),
                                param(params, 1),
                            ),
                            param(params, 2),
                        );
                    if (headPairId !== undefined) {
                        return attachEtag(
                            Response.json(result),
                            headPairId,
                        );
                    }
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
                        pair,
                        organization,
                        roles,
                    );
                if (pair !== undefined) {
                    const stored = await storedResponseFor(
                        effective, pair.requestHash,
                    );
                    if (stored === undefined) {
                        throw new Error(
                            'wired write stored no pair: '
                            + routePattern,
                        );
                    }
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                    const response =
                        responseFromStored(stored);
                    if (
                        routePattern
                            === INSTANCE_DETAIL_PATTERN
                    ) {
                        return attachEtag(
                            response, stored.id,
                        );
                    }
                    return response;
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
            case 'PATCH': {
                // Task 10/17: instance PATCH wires through
                // the same gate shape as PUT (pair + replay
                // + ETag). Ladder ran pre-dispatch above.
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
                        pair,
                        organization,
                        roles,
                    );
                if (pair !== undefined) {
                    const stored = await storedResponseFor(
                        effective, pair.requestHash,
                    );
                    if (stored === undefined) {
                        throw new Error(
                            'wired write stored no pair: '
                            + routePattern,
                        );
                    }
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                    const response =
                        responseFromStored(stored);
                    if (
                        routePattern
                            === INSTANCE_DETAIL_PATTERN
                    ) {
                        // R8: ETag = revision head, not the
                        // wire PATCH operation pair.
                        const raw = request.headers
                            .get(IF_MATCH_HEADER);
                        const ifMatch = raw === null
                            ? undefined
                            : parseIfMatch(raw);
                        if (ifMatch !== undefined) {
                            const revisionId =
                                await revisionEtagForInstancePatch(
                                    effective, ifMatch,
                                );
                            if (
                                revisionId !== undefined
                            ) {
                                return attachEtag(
                                    response,
                                    revisionId,
                                );
                            }
                        }
                        return attachEtag(
                            response, stored.id,
                        );
                    }
                    return response;
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
                    pair,
                    organization,
                    roles,
                );
                if (pair !== undefined) {
                    const stored = await storedResponseFor(
                        effective, pair.requestHash,
                    );
                    if (stored === undefined) {
                        throw new Error(
                            'wired write stored no pair: '
                            + routePattern,
                        );
                    }
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                    return responseFromStored(stored);
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
                // for them, and neither carries a `post` closure
                // in routes.ts any more (retired into this arm —
                // matchRoute still matches both patterns, so an
                // unknown path still 404s and a non-POST verb
                // still 405s via the ordinary matched.get/put/
                // delete checks). The seed carries everything
                // WritePairInput needs except the requester
                // identity and the response — only the grant
                // itself, deep inside postToken/postAuthorize,
                // can resolve those (a code's issuer, a verified
                // token's subject) — so the grant forms its OWN
                // pair, pre-tx, and appends it as the last act of
                // its own domain transaction (authentication.ts).
                if (
                    routePattern === 'authentication/token'
                    || routePattern === 'authentication/authorize'
                ) {
                    const seed: AuthPairSeed = {
                        requestAt: ctx.requestAt,
                        headerFields: hoistedHeaderFields(request),
                        method, pathname, routePattern,
                        routeSegments: matched.segments,
                        pathSegments,
                    };
                    const dispatched =
                        routePattern === 'authentication/token'
                            ? await postToken(
                                effective, body!, seed)
                            : await postAuthorize(
                                effective, body!, seed);
                    if (!dispatched.ok) {
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
                    // keyed by id (putMessagePair), not hash —
                    // two identical logins each land a row.
                    if (dispatched.pairId === undefined) {
                        throw new Error(
                            'authentication grant stored no'
                            + ' pair: ' + routePattern,
                        );
                    }
                    const authStored = await effective.responses
                        .getById(dispatched.pairId);
                    // authentication/authorize mints an
                    // authorization code, not a session — no UI
                    // subscribes to it, so it posts nothing.
                    // authentication/token mints the session
                    // itself: decode the live response claims so
                    // the identity-tokens page refreshes
                    // cross-tab. Wire body comes from the stored
                    // row (stored == wire under verbatim storage).
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
                    return responseFromStored(authStored);
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
                    pair,
                    organization,
                    roles,
                );
                if (pair !== undefined) {
                    const stored = await storedResponseFor(
                        effective, pair.requestHash,
                    );
                    if (stored === undefined) {
                        throw new Error(
                            'wired write stored no pair: '
                            + routePattern,
                        );
                    }
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization, actor,
                    );
                    return responseFromStored(stored);
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
            requestAt: ctx.requestAt,
            latencyMs: msSinceUtc(ctx.requestAt),
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
// it per request) plus the segregated demo latency shim the
// facade awaits before each simulated network hop.
export type ClientFacadeAdapter =
    GuardedDbAdapter & LatencySimulation;

async function unwrapResponse<T>(
    response: Response,
): Promise<T> {
    if (response.ok) {
        return (response.status === HTTP_NO_CONTENT
            ? undefined
            : await response.json()) as T;
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

// Wire-side Authorization (+ optional Content-Type) plus the
// client vessel's requestId. Absent requestId keeps the prior
// mint-on-gate path (direct test callers); the client facade
// always supplies the vessel id so reportFault and the server
// trace share one identity.
function facadeHeaders(
    token: string,
    requestId: string | undefined,
    contentType: boolean,
): Record<string, string> {
    const headers: Record<string, string> = {
        'Authorization': 'Bearer ' + token,
    };
    if (contentType) {
        headers['Content-Type'] = 'application/json';
    }
    if (requestId !== undefined) {
        headers[REQUEST_ID_HEADER] = requestId;
    }
    return headers;
}

// The ONE await site for a GET-shaped facade call — GET,
// GETWithResponseId, and GETWithEtag are thin wrappers over
// this, so the simulateLatency literal-count pin
// (pair-write-coverage.test.ts) stays at exactly 4 no matter
// how many GET-shaped verbs read from it (delegation, not a
// copy-pasted fifth await site).
async function getResponse(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    requestId?: string,
): Promise<Response> {
    await adapter.simulateLatency();
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                headers: facadeHeaders(
                    token, requestId, false,
                ),
            },
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
    requestId?: string,
): Promise<Response> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(token, requestId, true);
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                method,
                headers,
                body: JSON.stringify(payload),
            },
        ),
    );
}

// Strong ETag header → opaque pair id (strip surrounding
// quotes when present). Absent / empty → undefined.
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
    requestId?: string,
): Promise<T> {
    return unwrapResponse<T>(
        await getResponse(
            adapter, resource, token, requestId,
        ),
    );
}

// The locked-class sibling of GET: the same wire round-trip,
// plus the response's Response-ID header (attached by
// handleRequest's GET case for a locked-family document read;
// undefined for every other route today) — the baseline a C6
// save both diffs against and echoes back as If-Response-ID.
export async function GETWithResponseId<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    requestId?: string,
): Promise<{ body: T; responseId: string | undefined }> {
    const response = await getResponse(
        adapter, resource, token, requestId,
    );
    const body = await unwrapResponse<T>(response);
    return {
        body,
        responseId:
            response.headers.get('Response-ID') ?? undefined,
    };
}

// Instance / concurrency sibling of GET: body plus the strong
// ETag (quotes stripped) for If-Match on a later PATCH.
export async function GETWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    requestId?: string,
): Promise<{ body: T; etag: string | undefined }> {
    const response = await getResponse(
        adapter, resource, token, requestId,
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
    requestId?: string,
): Promise<T> {
    return unwrapResponse<T>(
        await bodyWriteResponse(
            adapter, 'PUT', resource, payload, token,
            headerFields, requestId,
        ),
    );
}

export async function PUTWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
    requestId?: string,
): Promise<{ body: T; etag: string | undefined }> {
    const response = await bodyWriteResponse(
        adapter, 'PUT', resource, payload, token,
        headerFields, requestId,
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
    requestId?: string,
): Promise<T> {
    return unwrapResponse<T>(
        await bodyWriteResponse(
            adapter, 'PATCH', resource, payload, token,
            headerFields, requestId,
        ),
    );
}

export async function PATCHWithEtag<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
    requestId?: string,
): Promise<{ body: T; etag: string | undefined }> {
    const response = await bodyWriteResponse(
        adapter, 'PATCH', resource, payload, token,
        headerFields, requestId,
    );
    const body = await unwrapResponse<T>(response);
    return {
        body,
        etag: etagFromHeader(response),
    };
}

export async function DELETE(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    requestId?: string,
): Promise<void> {
    await adapter.simulateLatency();
    await unwrapResponse(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'DELETE',
                    headers: facadeHeaders(
                        token, requestId, false,
                    ),
                },
            ),
        ),
    );
}

export async function POST<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    requestId?: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<T> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(
        token, requestId, true,
    );
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                },
            ),
        ),
    );
}
