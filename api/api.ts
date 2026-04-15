import type { DbAdapter } from './db';
import { EntityNotFound } from './db';
import { nowUtc } from './types';

export class ApiError {
    constructor(
        readonly message: string,
        readonly status: number,
    ) {}
}

let adapter: DbAdapter | undefined;

export function initApi(
    dbAdapter: DbAdapter,
): void {
    if (adapter) {
        throw new Error(
            'initApi() already called.',
        );
    }
    adapter = dbAdapter;
}

function getDbAdapter(): DbAdapter {
    if (!adapter) {
        throw new Error(
            'API not initialized.'
            + ' Call initApi()'
            + ' first.',
        );
    }
    return adapter;
}

type GetHandler = (
    adapter: DbAdapter,
    params: string[],
) => Promise<unknown>;

type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
) => Promise<void>;

type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
) => Promise<unknown>;

interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}

function route(
    pattern: string,
    handlers: {
        get?: GetHandler;
        put?: PutHandler;
        delete?: DeleteHandler;
        post?: PostHandler;
    },
): Route {
    return {
        segments: pattern.split('/'),
        ...handlers,
    };
}

function param(
    params: string[],
    index: number,
): string {
    const value = params[index];
    if (value === undefined) {
        throw new Error(
            'Missing route param at index '
            + index,
        );
    }
    return value;
}

const routes: Route[] = [
    route('users', {
        get: (db) => db.users.getAll(),
    }),
    route('ideas', {
        get: (db) => db.ideas.getAll(),
    }),
    route('projects', {
        get: (db) => db.projects.getAll(),
    }),
    route('activities', {
        get: (db) => db.activities.getAll(),
    }),
    route('idea-submissions', {
        get: (db) =>
            db.ideaSubmissions.getAll(),
    }),
    route('activity-actors', {
        get: (db) =>
            db.activityActors.getAll(),
    }),
    route('team-memberships', {
        get: (db) =>
            db.teamMemberships.getAll(),
    }),
    route('team-membership-projects', {
        get: (db) =>
            db.teamMembershipProjects
                .getAll(),
    }),
    route('team-membership-users', {
        get: (db) =>
            db.teamMembershipUsers
                .getAll(),
    }),

    route('flows', {
        get: (db) =>
            db.flows.getAll(),
        put: async (db, _params, body) => {
            const id =
                body.id as string;
            return db.flows.put(
                id, body,
            );
        },
    }),
    route('flows/:id', {
        get: (db, params) =>
            db.flows.getById(
                param(params, 0),
            ),
        put: (db, params, body) =>
            db.flows.put(
                param(params, 0), body,
            ),
        delete: (db, params) =>
            db.flows.delete(
                param(params, 0),
            ),
    }),
    route('flow-versions', {
        get: (db) =>
            db.flowVersions.getAll(),
        put: async (db, _params, body) => {
            const id =
                body.id as string;
            return db.flowVersions.put(
                id, body,
            );
        },
    }),
    route('flow-versions/:id', {
        get: (db, params) =>
            db.flowVersions.getById(
                param(params, 0),
            ),
        delete: (db, params) =>
            db.flowVersions.delete(
                param(params, 0),
            ),
    }),
    route('project-flows', {
        get: (db) =>
            db.projectFlows
                .getAll(),
        put: async (
            db, _params, body,
        ) => {
            const id =
                body.id as string;
            return db.projectFlows
                .put(id, body);
        },
    }),
    route('project-flows/:id', {
        delete: (db, params) =>
            db.projectFlows.delete(
                param(params, 0),
            ),
    }),
    route('work-orders', {
        get: (db) =>
            db.workOrders.getAll(),
        put: async (
            db, _params, body,
        ) => {
            const id =
                body.id as string;
            return db.workOrders.put(
                id, body,
            );
        },
    }),
    route('work-orders/:id', {
        get: (db, params) =>
            db.workOrders.getById(
                param(params, 0),
            ),
        put: (db, params, body) =>
            db.workOrders.put(
                param(params, 0), body,
            ),
    }),
    route('flow-work-orders', {
        get: (db) =>
            db.flowWorkOrders.getAll(),
        put: async (
            db, _params, body,
        ) => {
            const id =
                body.id as string;
            return db.flowWorkOrders.put(
                id, body,
            );
        },
    }),
    route('work-order-transitions', {
        get: (db) =>
            db.workOrderTransitions
                .getAll(),
        put: async (
            db, _params, body,
        ) => {
            const id =
                body.id as string;
            return db
                .workOrderTransitions
                .put(id, body);
        },
    }),
    route('work-order-claims', {
        get: (db) =>
            db.workOrderClaims
                .getAll(),
        put: async (
            db, _params, body,
        ) => {
            const id =
                body.id as string;
            return db.workOrderClaims
                .put(id, body);
        },
    }),
    route('work-order-claims/:id', {
        delete: (db, params) =>
            db.workOrderClaims.delete(
                param(params, 0),
            ),
    }),

    route('company-settings', {
        get: (db) =>
            db.companySettings.get(),
        put: (db, _, payload) =>
            db.companySettings.put(payload),
    }),
    route('account', {
        get: (db) => db.account.get(),
        put: (db, _, payload) =>
            db.account.put(payload),
    }),
    route('current-user', {
        get: (db) =>
            db.users.getById('current'),
    }),

    route('users/:id', {
        get: (db, p) =>
            db.users.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.users.put(
                param(p, 0),
                payload,
            ),
    }),
    route('ideas/:id', {
        get: (db, p) =>
            db.ideas.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.ideas.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.ideas.delete(param(p, 0)),
    }),
    route('projects/:id', {
        get: (db, p) =>
            db.projects.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.projects.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.projects.delete(param(p, 0)),
    }),
    route('activities/:id', {
        put: (db, p, payload) =>
            db.activities.put(
                param(p, 0),
                payload,
            ),
    }),
    route('idea-submissions/:id', {
        put: (db, p, payload) =>
            db.ideaSubmissions.put(
                param(p, 0),
                payload,
            ),
    }),
    route('activity-actors/:id', {
        put: (db, p, payload) =>
            db.activityActors.put(
                param(p, 0),
                payload,
            ),
    }),
    route('team-memberships/:id', {
        put: (db, p, payload) =>
            db.teamMemberships.put(
                param(p, 0),
                payload,
            ),
    }),
    route(
        'team-membership-projects/:id',
        {
            put: (db, p, payload) =>
                db.teamMembershipProjects
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route(
        'team-membership-users/:id',
        {
            put: (db, p, payload) =>
                db.teamMembershipUsers
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route('projects/:projectId/team', {
        get: async (db, p) => {
            const pid = param(p, 0);
            const [
                tmProjects,
                memberships,
                tmUsers,
            ] = await Promise.all([
                db.teamMembershipProjects
                    .getAll(),
                db.teamMemberships
                    .getAll(),
                db.teamMembershipUsers
                    .getAll(),
            ]);
            const membershipIds = new Set(
                tmProjects
                    .filter(
                        l => l.project_id
                            === pid,
                    )
                    .map(
                        l =>
                            l.team_membership_id,
                    ),
            );
            const userByMembership = new Map(
                tmUsers.map(
                    u => [
                        u.team_membership_id,
                        u.user_id,
                    ],
                ),
            );
            return memberships
                .filter(
                    m =>
                        membershipIds.has(
                            m.id,
                        ),
                )
                .map(m => ({
                    id: m.id,
                    user_id:
                        userByMembership
                            .get(m.id)!,
                    role: m.role,
                    type: m.type,
                }));
        },
    }),

    route(
        'projects/:projectId/team/:userId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const uid = param(p, 1);
                if (
                    typeof payload.role
                        !== 'string'
                    || payload.role === ''
                ) {
                    throw new ApiError(
                        'Missing or invalid'
                        + ' "role" field.',
                        400,
                    );
                }
                if (
                    typeof payload.type
                        !== 'string'
                    || payload.type === ''
                ) {
                    throw new ApiError(
                        'Missing or invalid'
                        + ' "type" field.',
                        400,
                    );
                }
                const tmId =
                    `tm-${pid}-${uid}`;
                const membership =
                    await db.teamMemberships
                        .put(tmId, {
                            id: tmId,
                            role: payload.role,
                            type: payload.type,
                        });
                const projLinkId =
                    `tmp-${tmId}`;
                const userLinkId =
                    `tmu-${tmId}`;
                await Promise.all([
                    db.teamMembershipProjects
                        .put(projLinkId, {
                            id: projLinkId,
                            team_membership_id:
                                tmId,
                            project_id: pid,
                            created_at:
                                nowUtc(),
                        }),
                    db.teamMembershipUsers
                        .put(userLinkId, {
                            id: userLinkId,
                            team_membership_id:
                                tmId,
                            user_id: uid,
                            created_at:
                                nowUtc(),
                        }),
                ]);
                return membership;
            },
        },
    ),

    route('snapshots/schema', {
        get: async (db) =>
            (await db.hasSchema())
                ? db.exportSnapshot()
                : null,
        delete: (db) => db.deleteSchema(),
        post: (db) => db.createSchema(),
    }),
    route('snapshots/mock-data', {
        post: async (db) => {
            const { populateMockData } =
                await import('./mock-data');
            await populateMockData(db);
        },
    }),
    route('snapshots/bootstrap', {
        post: async (db) => {
            const {
                populateBootstrapData,
            } = await import('./mock-data');
            await populateBootstrapData(db);
        },
    }),
    route('snapshots/import', {
        put: (db, _, payload) => {
            if (
                typeof payload.json
                    !== 'string'
            ) {
                throw new ApiError(
                    'Missing or invalid'
                    + ' "json" field:'
                    + ' expected a string.',
                    400,
                );
            }
            return db.importSnapshot(
                payload.json,
            );
        },
    }),
];

function matchRoute(
    pathSegments: string[],
): { route: Route; params: string[] } | null {
    for (
        const routeDefinition of routes
    ) {
        if (
            routeDefinition.segments.length
            !== pathSegments.length
        ) {
            continue;
        }
        const params: string[] = [];
        let matched = true;
        for (
            let i = 0;
            i
                < routeDefinition.segments
                    .length;
            i++
        ) {
            if (
                routeDefinition
                    .segments[i]!
                    .startsWith(':')
            ) {
                params.push(
                    pathSegments[i]!,
                );
            } else if (
                routeDefinition.segments[i]
                !== pathSegments[i]
            ) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return {
                route: routeDefinition,
                params,
            };
        }
    }
    return null;
}

const BASE_URL = 'http://localhost';

export async function handleRequest(
    request: Request,
): Promise<Response> {
    const { pathname } = new URL(request.url);
    const pathSegments = pathname
        .split('/')
        .filter(Boolean);
    const match = matchRoute(pathSegments);

    if (!match) {
        return Response.json(
            {
                error:
                    'Not found: ' + pathname,
            },
            { status: 404 },
        );
    }

    const { route: matched, params } = match;
    const method = request.method;
    const db = getDbAdapter();

    // HTTP boundary handler: each case
    // calls a single route handler; the
    // catch translates domain exceptions
    // to HTTP responses.
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
                        db,
                        params,
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
                const payload =
                    (await request.json()) as Record<
                        string,
                        unknown
                    >;
                const result =
                    await matched.put(
                        db,
                        params,
                        payload,
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
                    db,
                    params,
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
                const payload =
                    (await request.json()) as Record<
                        string,
                        unknown
                    >;
                const result =
                    await matched.post(
                        db,
                        params,
                        payload,
                    );
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
        if (error instanceof ApiError) {
            return Response.json(
                { error: error.message },
                { status: error.status },
            );
        }
        if (
            error instanceof EntityNotFound
        ) {
            return Response.json(
                { error: error.message },
                { status: 404 },
            );
        }
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            { status: 500 },
        );
    }
}

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
    throw new Error(
        `${error} (${response.url})`,
    );
}

export async function GET<T>(
    resource: string,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
            ),
        ),
    );
}

export async function PUT<T>(
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type':
                            'application/json',
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}

export async function DELETE(
    resource: string,
): Promise<void> {
    await unwrapResponse(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                { method: 'DELETE' },
            ),
        ),
    );
}

export async function POST<T>(
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}
