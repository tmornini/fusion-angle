import type {
    DbAdapter,
    GuardedDbAdapter,
} from './db.ts';
import {
    EntityNotFoundError,
    LedgerImmutabilityError,
    MissingTableError,
    UniqueConstraintError,
} from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    ValidationError,
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
    wireHeadersFor,
    PAIR_WIRED_ROUTE_PATTERNS,
    DOCUMENT_CLASS_ROUTE_PATTERNS,
    REPLAY_EXEMPT_ROUTE_PATTERNS,
    IF_RESPONSE_ID_HEADER,
} from './message-pair.ts';
import type { MessagePair, AuthPairSeed } from './message-pair.ts';
import { familyRegistration } from './family-registry.ts';
import {
    documentFamilyWiring,
    documentHeadPairId,
} from './document-family.ts';
import {
    ANONYMOUS_ID,
    decodeAccessToken,
} from './access-token.ts';
import {
    identityTargetsFor,
} from './notifications.ts';
import {
    ownerOrganizationOfEntity,
    organizationOwnedProbes,
    graphEntityProbe,
} from './store-parent-scoped.ts';
import {
    exchangeBearerForOrganization,
    postToken,
    postAuthorize,
} from './authentication.ts';
import {
    ApiError,
    UnauthorizedError,
    RequestError,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_INTERNAL_ERROR,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
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
    HTTP_FORBIDDEN,
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
        || ctx.method === 'POST';
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
// scoped one; every other write posts the fenced organization
// plus whatever identity targets the route/body name.
function postWriteNotification(
    adapter: GuardedDbAdapter,
    routePattern: string,
    params: readonly string[],
    body: Record<string, unknown> | undefined,
    organization: Id | undefined,
): void {
    if (BOOTSTRAP_ROUTES.has(routePattern)) {
        adapter.postNotification({ kind: 'full' });
        return;
    }
    adapter.postNotification({
        kind: 'scoped',
        organizationIds:
            organization === undefined
                ? [] : [organization],
        identityIds: identityTargetsFor(
            routePattern, params, body,
        ),
    });
}

// Resolve a route pattern's WRITE_RESPONSE_SPECS entry for the
// verb actually in flight. Every entry but one is a plain
// WriteResponseSpec, applying regardless of which non-DELETE
// verb hit it (no prior pattern wired both a PUT and a POST at
// once). A PerVerbWriteResponseSpec — recognized by the absence
// of `status` at its top level — supplies one spec per verb
// instead; today only 'ai-members/:id' needs this (see
// routes.ts).
function writeResponseSpecFor(
    routePattern: string,
    method: string,
): WriteResponseSpec | undefined {
    const entry = WRITE_RESPONSE_SPECS[routePattern];
    if (entry === undefined || 'status' in entry) {
        return entry;
    }
    return method === 'PUT' ? entry.put : entry.post;
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
    // Facade: /organizations/:org/:entity[/:id] — exchange the
    // caller's bearer for an org-scoped token and re-enter the
    // gate against the flat resource path, so the existing
    // handler is fenced automatically. Organization rides the one
    // verified token, never the path.
    if (pathSegments[0] === 'organizations'
        && pathSegments.length >= 3) {
        return facadeRequest(ctx, request, pathSegments);
    }
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
    const match = matchRoute(routeTable, pathSegments);

    if (!match) {
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
    // Every authenticated request runs org-scoped — see
    // fenceRequest, which completes the vessel: the org, the
    // live memberships, the roles, and the scoped adapter.
    // Organization-owned stores fence to the org; the global
    // identity/auth spine passes through.
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
    // BOOTSTRAP_ROUTES: the accepted dev-tier auth-free
    // snapshot plane (removed at the Postgres server tier) —
    // see api/request-auth.ts.
    const bearerExempt =
        AUTHENTICATION_ROUTES.has(routePattern)
        || BOOTSTRAP_ROUTES.has(routePattern);
    if (!bearerExempt) {
        const authed =
            await authenticateRequest(ctx, request);
        if (typeof authed === 'string') {
            return Response.json(
                { error: authed },
                { status: HTTP_UNAUTHORIZED },
            );
        }
        const fence = await fenceRequest(authed);
        if (!fence.ok) {
            return Response.json(
                { error: fence.error },
                { status: fence.status },
            );
        }
        const fenced = fence.ctx;
        const authzFailure =
            routePattern === 'identities/:id/pii'
                ? authorizeIdentityPii(
                    fenced, param(params, 0))
                : authorizeRequest(fenced);
        if (authzFailure !== null) {
            return Response.json(
                { error: authzFailure },
                { status: HTTP_FORBIDDEN },
            );
        }
        // organizations/:id is global passthrough; fence READS
        // to the caller's memberships so a non-member id 404s
        // like any foreign row. PUT is not gated here — a new
        // org is created before its first membership exists.
        if (method === 'GET'
            && routePattern === 'organizations/:id'
            && !fenced.memberOrganizations.has(param(params, 0))) {
            return Response.json(
                { error: 'Not found: ' + pathname },
                { status: HTTP_NOT_FOUND },
            );
        }
        // entity-states/:id[/history] read StateStore methods
        // the store fence cannot cover; gate on PARENT
        // ownership — a DIFFERENT org's entity 404s, an orphan
        // or own entity passes. The history-leak bug gated on
        // entity_id alone.
        if (method === 'GET'
            && (routePattern === 'entity-states/:id'
                || routePattern
                    === 'entity-states/:id/history')) {
            // The owner resolves through the memberships
            // identity_id index, never a whole-ledger scan.
            // The graphProbe closes the flow_nodes / flow_edges
            // two-hop for node/edge deletion events.
            // rawReadRow bypasses EntityStore's deleted filter.
            const owner = await ownerOrganizationOfEntity(
                organizationOwnedProbes(adapter),
                adapter.memberships, fenced.organization,
                param(params, 0),
                graphEntityProbe(adapter, adapter.flows),
            );
            if (owner !== null
                && owner !== fenced.organization) {
                return Response.json(
                    { error: 'Not found: ' + pathname },
                    { status: HTTP_NOT_FOUND },
                );
            }
        }
        effective = fenced.scoped;
        actor = fenced.principal.id;
        organization = fenced.organization;
    }

    // Parse the request body when the method
    // has one. A malformed or non-object JSON
    // body is a client error (400), not a
    // server fault — it must not flow into the
    // domain-boundary try below.
    let body: Record<string, unknown> | undefined;
    if (method === 'PUT' || method === 'POST') {
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

    const isWrite = method === 'PUT' || method === 'POST'
        || method === 'DELETE';
    // A route pattern can be pair-wired for one verb (PUT,
    // say) while exposing no handler for another (DELETE) —
    // ideas/:id is exactly this today. Requiring the matched
    // verb's handler to exist keeps that combination 405ing
    // exactly as it did before pairs existed, rather than
    // running the pair machinery (and its successBody
    // validation) against a request no handler will ever see.
    const hasWriteHandler =
        (method === 'PUT' && matched.put !== undefined)
        || (method === 'POST' && matched.post !== undefined)
        || (method === 'DELETE'
            && matched.delete !== undefined);

    try {
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
            // must never chain (message-pair.ts).
            const headPairId =
                DOCUMENT_CLASS_ROUTE_PATTERNS.has(routePattern)
                    ? await headPairIdAt(
                        effective, canonicalPrefix, uriId,
                    )
                    : undefined;
            // The locked/simple divide (spec §The two PUT
            // classes): keyed by the route's family registration
            // THROUGH THE WIRING CONSULT — never a blanket
            // family-registry or DOCUMENT_CLASS_ROUTE_PATTERNS
            // read — so a family whose registration says
            // 'locked' but has no row in document-family.ts's
            // wiring table (flows, through this task) never rides
            // this arm; only a route actually served via
            // documentPutHandler can. The routePattern check
            // (not merely the first segment) matters once a
            // family's OTHER routes share its prefix (e.g. a
            // future locked family's own :id/sub-resource PUT
            // must never inherit the entity route's four-outcome
            // table) — documentEntityRoute's own pattern is
            // always exactly `${family}/:id`. PUT-only: the two
            // PUT classes govern PUT, never POST/DELETE.
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
            // with genuinely different shapes (ai-members/:id)
            // supplies a PerVerbWriteResponseSpec instead — see
            // writeResponseSpecFor.
            const spec = method === 'DELETE'
                ? { status: 204 }
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
            // routes' own domain guard (or, from Task 3, their
            // redacted stored body) makes serving the cached
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
                    return responseFromStored(replay);
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
                        { status: 405 },
                    );
                }
                const result = await matched.get(
                    effective,
                    params,
                    actor,
                    organization,
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
                        { status: 405 },
                    );
                }
                const result =
                    await matched.put(
                        effective,
                        params,
                        body!,
                        actor,
                        pair,
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
                        body, organization,
                    );
                    return responseFromStored(stored);
                }
                postWriteNotification(
                    adapter, routePattern, params,
                    body, organization,
                );
                if (result === undefined) {
                    return new Response(null, {
                        status: 204,
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
                        { status: 405 },
                    );
                }
                await matched.delete(
                    effective,
                    params,
                    actor,
                    pair,
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
                        body, organization,
                    );
                    return responseFromStored(stored);
                }
                postWriteNotification(
                    adapter, routePattern, params,
                    body, organization,
                );
                return new Response(null, {
                    status: 204,
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
                let authWireHeaders: HeadersInit | undefined;
                let result: unknown;
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
                    // hop, not a route dispatch).
                    if (dispatched.requestHash === undefined) {
                        throw new Error(
                            'authentication grant stored no'
                            + ' pair: ' + routePattern,
                        );
                    }
                    const stored = await storedResponseFor(
                        effective, dispatched.requestHash,
                    );
                    if (stored === undefined) {
                        throw new Error(
                            'wired write stored no pair: '
                            + routePattern,
                        );
                    }
                    // The ONE named exception where the wire
                    // body (live tokens) differs from the stored
                    // (redacted) body — the headers still derive
                    // from the SAME stored row every other wired
                    // write reads.
                    result = dispatched.response;
                    authWireHeaders = wireHeadersFor(stored);
                } else {
                    if (!matched.post) {
                        return Response.json(
                            {
                                error:
                                    'Method POST'
                                    + ' not allowed'
                                    + ' on '
                                    + pathname,
                            },
                            { status: 405 },
                        );
                    }
                    result = await matched.post(
                        effective,
                        params,
                        body!,
                        actor,
                        pair,
                        organization,
                    );
                }
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
                        body, organization,
                    );
                    return responseFromStored(stored);
                }
                // authentication/authorize mints an
                // authorization code, not a session — no UI
                // subscribes to it, so it posts nothing.
                // authentication/token mints the session
                // itself: decode the freshly minted access
                // token so the identity-tokens page refreshes
                // cross-tab, the same case every other write
                // reaches via the fenced organization.
                if (routePattern === 'authentication/token') {
                    const claims = decodeAccessToken(
                        (result as { access_token: string })
                            .access_token,
                    );
                    adapter.postNotification({
                        kind: 'scoped',
                        identityIds: [claims.sub],
                        organizationIds: [
                            ...(claims.organizations ?? []),
                        ],
                    });
                } else if (
                    routePattern !== 'authentication/authorize'
                ) {
                    postWriteNotification(
                        adapter, routePattern, params,
                        body, organization,
                    );
                }
                if (result === undefined) {
                    return new Response(null, {
                        status: 204,
                    });
                }
                return authWireHeaders === undefined
                    ? Response.json(result)
                    : Response.json(
                        result, { headers: authWireHeaders },
                    );
            }
            default:
                return Response.json(
                    {
                        error:
                            'Method '
                            + method
                            + ' not allowed',
                    },
                    { status: 405 },
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
            error instanceof LedgerImmutabilityError
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_CONFLICT },
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
        return (response.status === 204
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

// The ONE await site for a GET-shaped facade call — GET and
// GETWithResponseId are both thin wrappers over this, so the
// simulateLatency literal-count pin (pair-write-coverage.test.ts)
// stays at exactly 4 no matter how many GET-shaped verbs read
// from it (delegation, not a copy-pasted fifth await site).
async function getResponse(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
): Promise<Response> {
    await adapter.simulateLatency();
    return handleRequest(
        adapter,
        new Request(
            `${BASE_URL}/${resource}`,
            {
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
            },
        ),
    );
}

export async function GET<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
): Promise<T> {
    return unwrapResponse<T>(
        await getResponse(adapter, resource, token),
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
): Promise<{ body: T; responseId: string | undefined }> {
    const response = await getResponse(adapter, resource, token);
    const body = await unwrapResponse<T>(response);
    return {
        body,
        responseId:
            response.headers.get('Response-ID') ?? undefined,
    };
}

export async function PUT<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: readonly (readonly [string, string])[],
): Promise<T> {
    await adapter.simulateLatency();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
    };
    for (const [name, value] of headerFields ?? []) {
        headers[name] = value;
    }
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(payload),
                },
            ),
        ),
    );
}

export async function DELETE(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
): Promise<void> {
    await adapter.simulateLatency();
    await unwrapResponse(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                    },
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
): Promise<T> {
    await adapter.simulateLatency();
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
                        'Authorization': 'Bearer ' + token,
                    },
                    body: JSON.stringify(payload),
                },
            ),
        ),
    );
}
