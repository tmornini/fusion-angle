import type { DbAdapter } from './db.ts';
import {
    EntityNotFound,
    MissingTableError,
} from './db.ts';
import {
    validateHumanWorkerEntity,
    validateAIWorkerEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateStateEntity,
} from './validators.ts';

export class ApiError {
    readonly message: string;
    readonly status: number;

    constructor(
        message: string,
        status: number,
    ) {
        this.message = message;
        this.status = status;
    }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

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
    if (value === undefined || value === '') {
        throw new Error(
            'Missing route param at index '
            + index,
        );
    }
    return value;
}

// Strip `id` from the request body before
// passing to entity validators. `id` is a
// routing/storage key, not a body field;
// validators enforce the exact body key set.
function withoutId(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const { id: _id, ...rest } = body;
    return rest;
}


const routes: Route[] = [
    route('workers', {
        get: (db) => db.workers.getAll(),
    }),
    route('ai-workers', {
        get: (db) => db.aiWorkers.getAll(),
    }),
    route('ai-workers/:id', {
        get: (db, p) =>
            db.aiWorkers.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.aiWorkers.put(
                param(p, 0),
                validateAIWorkerEntity(
                    withoutId(payload),
                ),
            ),
        delete: (db, p) =>
            db.aiWorkers.delete(
                param(p, 0),
            ),
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
    route('flows', {
        get: (db) =>
            db.flows.getAll(),
    }),
    route('flows/:id', {
        get: (db, params) =>
            db.flows.getById(
                param(params, 0),
            ),
        put: (db, params, body) =>
            db.flows.put(
                param(params, 0),
                validateFlowEntity(
                    withoutId(body),
                ),
            ),
        delete: (db, params) =>
            db.flows.delete(
                param(params, 0),
            ),
    }),
    route('flow-versions', {
        get: (db) =>
            db.flowVersions.getAll(),
    }),
    route('flow-versions/:id', {
        get: (db, params) =>
            db.flowVersions.getById(
                param(params, 0),
            ),
        put: (db, params, body) =>
            db.flowVersions.put(
                param(params, 0),
                validateFlowVersionEntity(
                    withoutId(body),
                ),
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
    }),
    route('project-flows/:id', {
        put: (db, params, body) =>
            db.projectFlows.put(
                param(params, 0),
                validateProjectFlowEntity(
                    withoutId(body),
                ),
            ),
        delete: (db, params) =>
            db.projectFlows.delete(
                param(params, 0),
            ),
    }),
    route('work-orders', {
        get: (db) =>
            db.workOrders.getAll(),
    }),
    route('work-orders/:id', {
        get: (db, params) =>
            db.workOrders.getById(
                param(params, 0),
            ),
        put: (db, params, body) =>
            db.workOrders.put(
                param(params, 0),
                validateWorkOrderEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('flow-work-orders', {
        get: (db) =>
            db.flowWorkOrders.getAll(),
    }),
    route('flow-work-orders/:id', {
        put: (db, params, body) =>
            db.flowWorkOrders.put(
                param(params, 0),
                validateFlowWorkOrderEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('state-field-values', {
        get: (db) =>
            db.stateFieldValues
                .getAll(),
    }),
    route('state-field-values/:id', {
        put: (db, params, body) =>
            db.stateFieldValues.put(
                param(params, 0),
                validateStateFieldValueEntity(
                    withoutId(body),
                ),
            ),
        delete: (db, params) =>
            db.stateFieldValues.delete(
                param(params, 0),
            ),
    }),

    route('organization', {
        get: (db) => db.organization.get(),
        put: (db, _, payload) =>
            db.organization.put(
                validateOrganizationEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('current-worker', {
        get: (db) =>
            db.workers.getById('current'),
    }),

    route('workers/:id', {
        get: (db, p) =>
            db.workers.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.workers.put(
                param(p, 0),
                validateHumanWorkerEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('ideas/:id', {
        get: (db, p) =>
            db.ideas.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.ideas.put(
                param(p, 0),
                validateIdeaEntity(
                    withoutId(payload),
                ),
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
                validateProjectEntity(
                    withoutId(payload),
                ),
            ),
        delete: (db, p) =>
            db.projects.delete(param(p, 0)),
    }),
    route('activities/:id', {
        put: (db, p, payload) =>
            db.activities.put(
                param(p, 0),
                validateActivityEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('idea-submissions/:id', {
        put: (db, p, payload) =>
            db.ideaSubmissions.put(
                param(p, 0),
                validateIdeaSubmissionEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('activity-actors/:id', {
        put: (db, p, payload) =>
            db.activityActors.put(
                param(p, 0),
                validateActivityActorEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('objectives', {
        get: (db) => db.objectives.getAll(),
    }),
    route('objectives/:id', {
        get: (db, p) =>
            db.objectives.getById(
                param(p, 0),
            ),
        put: (db, p, body) =>
            db.objectives.put(
                param(p, 0),
                validateObjectiveEntity(
                    withoutId(body),
                ),
            ),
        delete: (db, p) =>
            db.objectives.delete(
                param(p, 0),
            ),
    }),
    route('objective-revisions', {
        get: (db) =>
            db.objectiveRevisions.getAll(),
    }),
    route('objective-revisions/:id', {
        put: (db, p, body) =>
            db.objectiveRevisions.put(
                param(p, 0),
                validateObjectiveRevisionEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('project-objective-baseline-scores', {
        get: (db) =>
            db.projectObjectiveBaselineScores.getAll(),
    }),
    route('project-objective-baseline-scores/:id', {
        put: (db, p, body) =>
            db.projectObjectiveBaselineScores.put(
                param(p, 0),
                validateBaselineScoreEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('project-objective-actual-scores', {
        get: (db) =>
            db.projectObjectiveActualScores.getAll(),
    }),
    route('project-objective-actual-scores/:id', {
        put: (db, p, body) =>
            db.projectObjectiveActualScores.put(
                param(p, 0),
                validateActualScoreEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('states', {
        get: (db) => db.states.getAll(),
    }),
    route('states/:id', {
        get: (db, p) =>
            db.states.getById(param(p, 0)),
        put: (db, p, body) =>
            db.states.put(
                param(p, 0),
                validateStateEntity(
                    withoutId(body),
                ),
            ),
    }),
    route('entity-states/:id', {
        get: (db, p) =>
            db.states.currentFor(param(p, 0)),
    }),
    route('entity-states/:id/history', {
        get: (db, p) =>
            db.states.allFor(param(p, 0)),
    }),

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
                await import('./mock-data.ts');
            await populateMockData(db);
        },
    }),
    route('snapshots/bootstrap', {
        post: async (db) => {
            const {
                populateBootstrapData,
            } = await import('./mock-data.ts');
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
                    HTTP_BAD_REQUEST,
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
    adapter: DbAdapter,
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
            { status: HTTP_NOT_FOUND },
        );
    }

    const { route: matched, params } = match;
    const method = request.method;

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
                        adapter,
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
                        adapter,
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
                    adapter,
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
                        adapter,
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
            error instanceof EntityNotFound
        ) {
            return Response.json(
                { error: error.message },
                { status: HTTP_NOT_FOUND },
            );
        }
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            { status: HTTP_INTERNAL_ERROR },
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
    adapter: DbAdapter,
    resource: string,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
            ),
        ),
    );
}

export async function PUT<T>(
    adapter: DbAdapter,
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
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
    adapter: DbAdapter,
    resource: string,
): Promise<void> {
    await unwrapResponse(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                { method: 'DELETE' },
            ),
        ),
    );
}

export async function POST<T>(
    adapter: DbAdapter,
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
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
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}
