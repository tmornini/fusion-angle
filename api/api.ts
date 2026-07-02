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
    type Route,
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

    try {
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
                return Response.json(
                    await matched.get(
                        effective,
                        params,
                        actor,
                    ),
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
                        { status: 405 },
                    );
                }
                const result =
                    await matched.put(
                        effective,
                        params,
                        body!,
                        actor,
                    );
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
                );
                postWriteNotification(
                    adapter, routePattern, params,
                    body, organization,
                );
                return new Response(null, {
                    status: 204,
                });
            }
            case 'POST': {
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
                const result =
                    await matched.post(
                        effective,
                        params,
                        body!,
                        actor,
                    );
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

export async function GET<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
): Promise<T> {
    await adapter.simulateLatency();
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                    },
                },
            ),
        ),
    );
}

export async function PUT<T>(
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
                    method: 'PUT',
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
