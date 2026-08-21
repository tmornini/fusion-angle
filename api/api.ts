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
    MESSAGE_TABLES,
} from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    ValidationError,
    msSinceUtc,
    nowUtc,
} from './types.ts';
import type { Id } from './types.ts';
import { messageAddress } from './message-address.ts';
import { pathSegmentsOf } from './path-segments.ts';
import {
    formWritePair,
    appendMessagePair,
    storedResponseFor,
    createdEntityUriId,
    canonicalUriCollection,
    hoistedHeaderFields,
    sendWriteResponse,
    documentHeadAt,
    attachEtag,
    attachDate,
    streamGetFromStored,
    parseIfMatch,
    requireOperationId,
    OPERATION_ID_HEADER,
    PAIR_WIRED_ROUTE_PATTERNS,
    REPLAY_EXEMPT_ROUTE_PATTERNS,
    IF_MATCH_HEADER,
} from './message-pair.ts';
import {
    bodyOctetsOf,
} from './message-form.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import type { MessagePair, AuthPairSeed } from './message-pair.ts';
import {
    familyRegistration,
    INSTANCE_DETAIL_PATTERN,
    INSTANCE_VERSION_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
} from './family-registry.ts';
import {
    documentFamilyWiring,
    documentHeadPairId,
    entityIdParam,
    idFamilyOf,
    lookupStoredRevision,
    throwDocumentMiss,
    requireOrganization,
    resolveStreamedTrioWriteBody,
} from './document-family.ts';
import {
    messageStore,
} from './message-store.ts';
import {
    deriveInstanceHead,
    instanceGetBody,
    instanceParentEtag,
    advertisedInstanceEtag,
    projectionOmitsStored,
    revisionValuesOf,
    instancesUriPrefix,
} from './derive-record-instances.ts';
import { projectReadableValues } from './attribute-acl.ts';
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
    postToken,
    postAuthorize,
    attachSetCookie,
    refreshSetCookie,
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
    HTTP_CONFLICT,
    HTTP_METHOD_NOT_ALLOWED,
    HTTP_INTERNAL_ERROR,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_PRECONDITION_FAILED,
    HTTP_PRECONDITION_REQUIRED,
} from './http-errors.ts';
import {
    AUTHENTICATION_ROUTES,
    authenticateRequest,
    unauthorizedBearerResponse,
    fenceRequest,
    authorizeRequest,
    authorizeIdentityPii,
    parseObjectBody,
    parsePutBody,
} from './request-auth.ts';
import {
    routes,
    matchRoute,
    param,
    WRITE_RESPONSE_SPECS,
    loadAttributeSchemaById,
    type Route,
    type WriteResponseSpec,
} from './routes.ts';

import {
    incomingContext,
    REQUEST_ID_HEADER,
    type IncomingContext,
} from './request-context.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';

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

// The gate-side Decision 5 post: fired once per successful
// write, AFTER the route handler's promise resolves (so on
// IndexedDB the commit has already reached `oncomplete`).
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

async function livePutVersion(
    db: DbAdapter,
    prefix: string,
    uriId: string,
): Promise<{ pairId: string; version: string } | undefined> {
    const pairId = await documentHeadPairId(
        db, prefix, uriId,
    );
    if (pairId === undefined) return undefined;
    const stored = await db.pairs.getById(pairId);
    if (stored === undefined) return undefined;
    return { pairId, version: stored.version };
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
    pairId: string;
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
    const parent = await instanceParentEtag(db, head.pairId);
    const tag = await advertisedInstanceEtag(
        instanceGetBody(
            instanceId, organization, typeId, projected,
        ),
        parent,
    );
    return {
        tag,
        limited: projectionOmitsStored(
            head.values, projected,
        ),
        pairId: head.pairId,
    };
}

function limitedHeaders(
    limited: boolean,
): Record<string, string> {
    return limited
        ? { 'Authorization-Limited-Attributes': 'true' }
        : {};
}

// 412 / 428 with a live PUT: this caller's GET of the
// current head — fresh Date, current ETag, limited
// header when the projection omits stored attributes.
function preconditionDocument(
    status: number,
    document: unknown,
    etag: string,
    limited: boolean,
): Response {
    return attachDate(
        attachEtag(
            Response.json(document, {
                status,
                headers: limitedHeaders(limited),
            }),
            etag,
        ),
        nowUtc(),
    );
}

async function revisionPairIdForPatch(
    db: DbAdapter,
    wirePairId: string,
): Promise<string | undefined> {
    const wireReq = await db.pairs.getById(wirePairId);
    if (wireReq === undefined) return undefined;
    const siblings = await db.pairs.getAllWhere(
        'uri_collection', wireReq.uri_collection,
    );
    const revision = siblings.find(
        (row) =>
            row.uri_id === wireReq.uri_id
            && row.request_at === wireReq.request_at
            && row.id !== wirePairId,
    );
    return revision?.id;
}

async function advertisedForRevisionPair(
    db: DbAdapter,
    organization: string,
    typeId: string,
    instanceId: string,
    roles: readonly string[],
    revisionPairId: string,
): Promise<string | undefined> {
    const stored = await db.pairs.getById(
        revisionPairId,
    );
    if (stored === undefined) return undefined;
    const model = parseWire(stored.request);
    const wireBody = HttpMessage.fromModel(model).body();
    const parsed = wireBody.exists()
        ? JSON.parse(wireBody.toText()) as Record<
            string, unknown
        >
        : {};
    const values = revisionValuesOf(parsed);
    const attributesById = await loadAttributeSchemaById(
        db, organization, typeId,
    );
    const projected = projectReadableValues(
        values, attributesById, roles,
    );
    const parent = await instanceParentEtag(
        db, revisionPairId,
    );
    return advertisedInstanceEtag(
        instanceGetBody(
            instanceId, organization, typeId, projected,
        ),
        parent,
    );
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
    // pair-plane tenancy rides uri_collection. effective stays
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
    // /identities/:id/token-revocations to the member tier, but
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
                // Org-less identity-scoped GET reaches
                // the handler; fence would 403 first.
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

    const denied = requireOperationId(
        request, method, bearerExempt,
    );
    if (denied !== undefined) return denied;

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
        const parse = method === 'PUT'
            ? await parsePutBody(request)
            : await parseObjectBody(request);
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
        // WP8 self-only revocation guard. MEMBER_VERBS widens
        // PUT /identities/:id/token-revocations to the member
        // tier (Region A's route-policy check already cleared
        // it). The path identity IS the address — compare it
        // to the actor. A member may revoke only its OWN
        // chain; an admin may name any identity. The 403 body
        // reuses authorizeRequest's OWN wording
        // (request-auth.ts).
        if (
            method === 'PUT'
            && routePattern
                === 'identities/:id/token-revocations/:rid'
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
            const canonicalPrefix = canonicalUriCollection(
                organization, address.uriCollection,
            );
            const uriId = createdEntityUriId(
                routePattern, body,
            ) ?? address.uriId;
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
            const wiring = wiringForSegments(
                matched.segments,
            );
            const isDocumentPut = method === 'PUT'
                && wiring !== undefined
                && routePattern
                    === documentEntityPattern(wiring);
            const isLockedWrite = isDocumentPut
                && wiring !== undefined
                && familyRegistration(wiring.family)
                    ?.concurrency === 'locked';
            // Advertised ETag is the live PUT's version,
            // never the lock-head pair id. DELETE heads have
            // no If-Match target (documentHeadPairId skips
            // them). Same-body no-append uses this for both
            // PUT kinds (simple and locked).
            const livePut = isDocumentPut
                ? await livePutVersion(
                    effective, canonicalPrefix, uriId,
                )
                : undefined;
            const advertised = livePut?.version;
            // The hoisted echo: read If-Match directly so
            // the gate can compare the parsed 64-hex tag
            // against the advertised ETag BEFORE dispatch.
            const rawIfMatch = isLockedWrite
                ? request.headers.get(IF_MATCH_HEADER)
                : null;
            const echo = rawIfMatch === null
                ? null
                : parseIfMatch(rawIfMatch);
            const echoMatchesHead = isLockedWrite
                && echo !== undefined
                && echo !== null
                && advertised !== undefined
                && echo === advertised;
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
            const operationId = request.headers.get(
                OPERATION_ID_HEADER,
            );
            if (
                operationId === null || operationId === ''
            ) {
                throw new Error(
                    'Operation-ID missing after require',
                );
            }
            // DELETE table: never-written 404 stores nothing;
            // already-gone 204 no append; live PUT proceeds.
            if (method === 'DELETE') {
                const head = await documentHeadAt(
                    effective, canonicalPrefix, uriId,
                );
                if (head === undefined) {
                    return Response.json(
                        { error: 'Not found: ' + pathname },
                        { status: HTTP_NOT_FOUND },
                    );
                }
                if (head.method === 'DELETE') {
                    return new Response(null, {
                        status: HTTP_NO_CONTENT,
                        headers: {
                            'Operation-ID': operationId,
                        },
                    });
                }
            }
            const streamedTrioBody =
                method === 'PUT'
                && body === undefined
                    ? undefined
                    : await resolveStreamedTrioWriteBody(
                        effective,
                        routePattern,
                        params,
                        body,
                        actor,
                        organization,
                    );
            pair = await formWritePair({
                method, pathname, routePattern,
                routeSegments: matched.segments,
                pathSegments,
                headerFields: hoistedHeaderFields(request),
                body,
                requesterIdentityId: actor,
                requestAt: ctx.requestAt,
                organization,
                operationId,
                responseStatus: spec.status,
                responseBody: method === 'PUT'
                    && body === undefined
                    ? undefined
                    : streamedTrioBody
                        ?? spec.successBody?.(
                            params, body, actor,
                            organization,
                        ),
                ...(echoMatchesHead
                    && echo !== null
                    && echo !== undefined
                    && livePut !== undefined
                    ? {
                        matchedEtag: echo,
                        latchedHeadPairId: livePut.pairId,
                    }
                    : {}),
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
                    const response = sendWriteResponse(
                        replay, method, true,
                    );
                    if (
                        routePattern
                            === INSTANCE_DETAIL_PATTERN
                    ) {
                        if (method === 'PATCH') {
                            const revisionId =
                                await revisionPairIdForPatch(
                                    effective, replay.id,
                                );
                            if (
                                revisionId !== undefined
                            ) {
                                const tag =
                                    await advertisedForRevisionPair(
                                        effective,
                                        param(params, 0),
                                        param(params, 1),
                                        param(params, 2),
                                        roles,
                                        revisionId,
                                    );
                                if (tag !== undefined) {
                                    return attachEtag(
                                        response, tag,
                                    );
                                }
                            }
                        }
                        const advertisedReplay =
                            await instanceAdvertised(
                                effective,
                                param(params, 0),
                                param(params, 1),
                                param(params, 2),
                                roles,
                            );
                        if (
                            advertisedReplay !== undefined
                        ) {
                            return attachEtag(
                                response,
                                advertisedReplay.tag,
                            );
                        }
                    }
                    if (isDocumentPut) {
                        return attachEtag(
                            response, replay.version,
                        );
                    }
                    return response;
                }
            }
            // The locked six-outcome table, applied ONLY after
            // the replay fast-path MISSES: live + absent → 428;
            // live + malformed → 400; live + ≠ head → 412; live
            // + == head → echoMatchesHead, proceed;
            // none + absent → genesis; none + present → 412.
            // A 412 here returns BEFORE dispatch, and
            // appendMessagePair only ever runs inside the op's
            // own tx, so NOTHING is stored.
            if (isLockedWrite) {
                if (
                    livePut !== undefined
                    && rawIfMatch === null
                ) {
                    if (matched.get !== undefined) {
                        try {
                            return preconditionDocument(
                                HTTP_PRECONDITION_REQUIRED,
                                await matched.get(
                                    effective, params,
                                    actor, organization,
                                    roles,
                                ),
                                livePut.version,
                                false,
                            );
                        } catch {
                            // GET derive may fail on a
                            // stored shape this caller
                            // cannot project; status
                            // still 428.
                        }
                    }
                    return Response.json(
                        {
                            error: 'If-Match is required to PUT '
                                + pathname,
                        },
                        {
                            status:
                                HTTP_PRECONDITION_REQUIRED,
                        },
                    );
                }
                if (
                    livePut !== undefined
                    && echo === undefined
                ) {
                    return Response.json(
                        {
                            error: 'If-Match must carry '
                                + 'exactly one strong '
                                + 'validator',
                        },
                        { status: HTTP_BAD_REQUEST },
                    );
                }
                if (
                    rawIfMatch !== null
                    && !echoMatchesHead
                ) {
                    if (
                        livePut !== undefined
                        && matched.get !== undefined
                    ) {
                        try {
                            return preconditionDocument(
                                HTTP_PRECONDITION_FAILED,
                                await matched.get(
                                    effective, params,
                                    actor, organization,
                                    roles,
                                ),
                                livePut.version,
                                false,
                            );
                        } catch {
                            // Same fallback as 428.
                        }
                    }
                    return Response.json(
                        {
                            error: 'If-Match does not '
                                + 'match the current document '
                                + 'at ' + pathname,
                        },
                        { status: HTTP_PRECONDITION_FAILED },
                    );
                }
            }
            // Instance PATCH table (Task 20). AFTER replay.
            // Malformed If-Match is 400 before create/404/
            // 412. Never-written + no pin → create. DELETE
            // head + no pin → 409 spent; + pin → 404.
            if (
                method === 'PATCH'
                && routePattern
                    === INSTANCE_DETAIL_PATTERN
            ) {
                const pathOrganization = param(params, 0);
                const typeId = param(params, 1);
                const instanceId = param(params, 2);
                const prefix = instancesUriPrefix(
                    pathOrganization, typeId,
                );
                const raw = request.headers
                    .get(IF_MATCH_HEADER);
                if (raw !== null) {
                    const parsed = parseIfMatch(raw);
                    if (parsed === undefined) {
                        return Response.json(
                            {
                                error: 'If-Match must '
                                    + 'carry exactly '
                                    + 'one strong '
                                    + 'validator',
                            },
                            {
                                status:
                                    HTTP_BAD_REQUEST,
                            },
                        );
                    }
                }
                const head = await deriveInstanceHead(
                    effective,
                    pathOrganization,
                    typeId,
                    instanceId,
                );
                const docHead = await documentHeadAt(
                    effective, prefix, instanceId,
                );
                if (head === undefined) {
                    if (docHead?.method === 'DELETE') {
                        if (raw === null) {
                            return Response.json(
                                {
                                    error:
                                        'instance '
                                        + 'already '
                                        + 'exists at '
                                        + pathname,
                                },
                                {
                                    status:
                                        HTTP_CONFLICT,
                                },
                            );
                        }
                        throw await missedReadError(
                            effective,
                            instanceId,
                            organization
                                ?? pathOrganization,
                            'record_instances',
                        );
                    }
                    if (raw !== null) {
                        return Response.json(
                            {
                                error: 'If-Match does '
                                    + 'not match the '
                                    + 'current '
                                    + 'instance at '
                                    + pathname,
                            },
                            {
                                status:
                                    HTTP_PRECONDITION_FAILED,
                            },
                        );
                    }
                    // Never written, no pin → create.
                } else {
                    const advertisedNow =
                        await instanceAdvertised(
                            effective,
                            pathOrganization,
                            typeId,
                            instanceId,
                            roles,
                        );
                    if (raw === null) {
                        if (
                            advertisedNow !== undefined
                            && matched.get !== undefined
                        ) {
                            try {
                                return preconditionDocument(
                                    HTTP_PRECONDITION_REQUIRED,
                                    await matched.get(
                                        effective,
                                        params,
                                        actor,
                                        organization,
                                        roles,
                                    ),
                                    advertisedNow.tag,
                                    advertisedNow.limited,
                                );
                            } catch {
                                // Status stays 428.
                            }
                        }
                        return Response.json(
                            {
                                error: 'If-Match is '
                                    + 'required to '
                                    + 'PATCH '
                                    + pathname,
                            },
                            {
                                status:
                                    HTTP_PRECONDITION_REQUIRED,
                            },
                        );
                    }
                    const ifMatch = parseIfMatch(raw);
                    if (
                        advertisedNow === undefined
                        || ifMatch !== advertisedNow.tag
                    ) {
                        if (
                            advertisedNow !== undefined
                            && matched.get !== undefined
                        ) {
                            try {
                                return preconditionDocument(
                                    HTTP_PRECONDITION_FAILED,
                                    await matched.get(
                                        effective,
                                        params,
                                        actor,
                                        organization,
                                        roles,
                                    ),
                                    advertisedNow.tag,
                                    advertisedNow.limited,
                                );
                            } catch {
                                // Status stays 412.
                            }
                        }
                        return Response.json(
                            {
                                error: 'If-Match does '
                                    + 'not match the '
                                    + 'current '
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
            // Same-body as live PUT head → 200, no append.
            // Body equality is octets, not ETag. The no-op
            // still takes the in-tx latch so it cannot
            // return a dead ETag.
            if (
                method === 'PUT'
                && livePut !== undefined
                && (
                    !isLockedWrite
                    || echoMatchesHead
                )
            ) {
                const liveReq = await effective.pairs
                    .getById(livePut.pairId);
                if (liveReq !== undefined) {
                    const liveOctets = bodyOctetsOf(
                        parseWire(liveReq.request),
                    );
                    const newOctets = bodyOctetsOf(
                        parseWire(pair.requestMessage),
                    );
                    if (octetsEqual(liveOctets, newOctets)) {
                        const raced =
                            await effective.transaction(
                                MESSAGE_TABLES,
                                async (view) => {
                                    const latest =
                                        await documentHeadPairId(
                                            view,
                                            canonicalPrefix,
                                            uriId,
                                        );
                                    return latest
                                        !== livePut.pairId;
                                },
                            );
                        if (raced) {
                            const nowLive =
                                await livePutVersion(
                                    effective,
                                    canonicalPrefix,
                                    uriId,
                                );
                            if (
                                nowLive !== undefined
                                && matched.get
                                    !== undefined
                            ) {
                                try {
                                    return preconditionDocument(
                                        HTTP_PRECONDITION_FAILED,
                                        await matched.get(
                                            effective,
                                            params,
                                            actor,
                                            organization,
                                            roles,
                                        ),
                                        nowLive.version,
                                        false,
                                    );
                                } catch {
                                    // GET derive failed;
                                    // no document body.
                                }
                            }
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
                            await effective.pairs
                                .getById(livePut.pairId);
                        if (stored !== undefined) {
                            return attachEtag(
                                sendWriteResponse(
                                    stored, 'PUT', false,
                                ),
                                stored.version,
                            );
                        }
                    }
                }
            }
            // Empty-body PUT is a live empty document. Skip
            // the family validator; store GET-shaped 200
            // with ETag sha256('').
            if (
                method === 'PUT'
                && body === undefined
                && pair !== undefined
            ) {
                const emptyPair = pair;
                await effective.transaction(
                    MESSAGE_TABLES,
                    async (view) => {
                        const latchedId =
                            emptyPair.latchedHeadPairId;
                        if (latchedId !== undefined) {
                            const latest =
                                await documentHeadPairId(
                                    view,
                                    emptyPair.uriCollection,
                                    emptyPair.uriId,
                                );
                            if (latest !== latchedId) {
                                throw new ApiError(
                                    'If-Match does not match'
                                    + ' the current document'
                                    + ' at ' + pathname,
                                    HTTP_PRECONDITION_FAILED,
                                );
                            }
                        }
                        await appendMessagePair(
                            view, emptyPair,
                        );
                    },
                );
                const stored = await storedResponseFor(
                    effective, emptyPair.requestHash,
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
                return attachEtag(
                    sendWriteResponse(
                        stored, 'PUT', true,
                    ),
                    stored.version,
                );
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
                const readWiring = wiringForSegments(
                    matched.segments,
                );
                if (
                    readWiring !== undefined
                    && routePattern
                        === documentEntityPattern(
                            readWiring,
                        )
                    && familyRegistration(readWiring.family)
                        ?.concurrency === 'locked'
                ) {
                    const prefix = canonicalUriCollection(
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
                        effective, prefix,
                        entityIdParam(readWiring, params),
                    );
                    if (headPairId !== undefined) {
                        const stored = await effective
                            .pairs.getById(headPairId);
                        if (stored !== undefined) {
                            return attachEtag(
                                Response.json(result, {
                                    headers: {
                                        'Response-ID':
                                            headPairId,
                                    },
                                }),
                                stored.version,
                            );
                        }
                    }
                }
                // Document /versions/:etag: ETag is the
                // column hash (same as the path token).
                if (
                    routePattern.endsWith(
                        '/versions/:etag',
                    )
                    && routePattern
                        !== INSTANCE_VERSION_PATTERN
                ) {
                    return attachEtag(
                        Response.json(result),
                        param(
                            params, params.length - 1,
                        ),
                    );
                }
                // Instance versions leaf: ETag is the
                // projected hash, not the path token.
                if (
                    routePattern
                        === INSTANCE_VERSION_PATTERN
                ) {
                    const found =
                        await lookupStoredRevision(
                            effective,
                            instancesUriPrefix(
                                param(params, 0),
                                param(params, 1),
                            ),
                            param(params, 2),
                            param(params, 3),
                        );
                    const parent = found === undefined
                        ? undefined
                        : await instanceParentEtag(
                            effective,
                            found.id,
                        );
                    const tag =
                        await advertisedInstanceEtag(
                            result, parent,
                        );
                    return attachEtag(
                        Response.json(result), tag,
                    );
                }
                // Instance detail ETag: documentVersion of
                // this caller's projected GET body.
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
                        pair,
                        organization,
                        roles,
                        ctx.requestAt,
                        request.headers.get(
                            OPERATION_ID_HEADER,
                        ) ?? '',
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
                    const response = sendWriteResponse(
                        stored, 'PUT', true,
                    );
                    if (
                        routePattern
                            === 'identities/:id/token-revocations/:rid'
                    ) {
                        return attachSetCookie(
                            response,
                            refreshClearCookie(request),
                        );
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
                    ) {
                        return attachEtag(
                            response, stored.version,
                        );
                    }
                    return response;
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
                // Instance PATCH (Task 20): create and
                // update. Pair + replay + ETag. Table ran
                // pre-dispatch above.
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
                    const response = sendWriteResponse(
                        stored, 'PATCH', true,
                    );
                    if (
                        routePattern
                            === INSTANCE_DETAIL_PATTERN
                    ) {
                        const advertisedPatch =
                            await instanceAdvertised(
                                effective,
                                param(params, 0),
                                param(params, 1),
                                param(params, 2),
                                roles,
                            );
                        if (
                            advertisedPatch !== undefined
                        ) {
                            return attachEtag(
                                response,
                                advertisedPatch.tag,
                            );
                        }
                        return attachEtag(
                            response, stored.version,
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
                    return sendWriteResponse(
                        stored, 'DELETE', true,
                    );
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
                                effective, body!, seed,
                                request.headers.get('cookie'))
                            : await postAuthorize(
                                effective, body!, seed);
                    if (!dispatched.ok) {
                        if (dispatched.status
                            === HTTP_UNAUTHORIZED) {
                            console.warn(
                                'authentication failed',
                                {
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
                    // keyed by id (putMessagePair), not hash —
                    // two identical logins each land a row.
                    if (dispatched.pairId === undefined) {
                        throw new Error(
                            'authentication grant stored no'
                            + ' pair: ' + routePattern,
                        );
                    }
                    const authStored = await effective.pairs
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
                    const written = sendWriteResponse(
                        authStored, 'POST', true,
                    );
                    const grantType =
                        typeof body!.grant_type === 'string'
                            ? body!.grant_type
                            : '';
                    const setsRefreshCookie =
                        grantType === 'authorization_code'
                        || grantType === 'refresh'
                        || grantType === 'client_credentials';
                    if (
                        routePattern === 'authentication/token'
                        && 'refreshToken' in dispatched
                        && setsRefreshCookie
                    ) {
                        return attachSetCookie(
                            written,
                            refreshSetCookie(
                                dispatched.refreshToken,
                                request,
                            ),
                        );
                    }
                    return written;
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
                    ctx.requestAt,
                    request.headers.get(
                        OPERATION_ID_HEADER,
                    ) ?? '',
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
                    return sendWriteResponse(
                        stored, 'POST', true,
                    );
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

// Wire-side Authorization (+ optional Content-Type) plus the
// client vessel's requestId. Absent requestId keeps the prior
// mint-on-gate path (direct test callers); the client facade
// always supplies the vessel id so reportFault and the server
// trace share one identity.
function facadeHeaders(
    token: string,
    requestId: string | undefined,
    contentType: boolean,
    write = false,
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
    if (write) {
        headers[OPERATION_ID_HEADER] =
            generateCryptoSafeBase62();
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
    const headers = facadeHeaders(
        token, requestId, true, true,
    );
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    if (headers[OPERATION_ID_HEADER] === undefined) {
        headers[OPERATION_ID_HEADER] =
            generateCryptoSafeBase62();
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

// Stream families (ideas, projects, …). Work-orders still
// assemble (binding). Flows stay on derive: stored PUT has
// no trio, so a state-'deleted' head must 404 via the
// lifecycle walk, and hasUndoHistory is stamped there.
// Record instances still project.
function streamFamilyWiring(
    routePattern: string,
): ReturnType<typeof documentFamilyWiring> {
    const family = idFamilyOf(routePattern);
    if (
        family === undefined
        || family === 'work-orders'
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
        || family === 'work-orders'
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
    const prefix = canonicalUriCollection(
        organizationId, '/' + wiring.family + '/',
    );
    const stored = await messageStore(db).get(prefix, id);
    if (stored === undefined) {
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
    const prefix = canonicalUriCollection(
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

// Strong ETag header → unquoted 64-hex version token
// (strip surrounding quotes when present). Absent /
// empty → undefined.
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

// Locked / instance sibling of GET: body plus the strong
// ETag (quotes stripped) for If-Match on a later PUT/PATCH.
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
    headerFields?: readonly (readonly [string, string])[],
): Promise<void> {
    await adapter.simulateLatency();
    const headers = facadeHeaders(
        token, requestId, false, true,
    );
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    if (headers[OPERATION_ID_HEADER] === undefined) {
        headers[OPERATION_ID_HEADER] =
            generateCryptoSafeBase62();
    }
    await unwrapResponse(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'DELETE',
                    headers,
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
        token, requestId, true, true,
    );
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    if (headers[OPERATION_ID_HEADER] === undefined) {
        headers[OPERATION_ID_HEADER] =
            generateCryptoSafeBase62();
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
