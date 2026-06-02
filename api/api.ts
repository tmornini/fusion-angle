import type { DbAdapter } from './db.ts';
import {
    EntityNotFound,
    MissingTableError,
} from './db.ts';
import type {
    AIWorkerEntity,
    FlowEntity,
    FlowVersionEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    HumanWorkerEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    Objective,
    ObjectiveRevision,
    ProjectEntity,
    ProjectFlowEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    RecordEntity,
    RecordAttributeEntity,
    StateFieldValueEntity,
    WorkOrderEntity,
    WorkerEntity,
} from './types.ts';
import {
    validateOrganizationEntity,
    validateRecordMultiPutBody,
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

async function applyRecordMultiPut(
    db: DbAdapter,
    payload: Record<string, unknown>,
): Promise<void> {
    const body = validateRecordMultiPutBody(payload);
    const entries = body.attributes.map(attr => {
        const { id, ...fields } = attr;
        return { id, fields };
    });
    const removedIds =
        body.kind === 'edit'
            ? body.removedAttributeIds
            : [];
    await db.records.put(body.id, body.record);
    if (body.kind === 'create') {
        const worker =
            await db.workers.getById('current');
        await db.states.record(
            body.initialStateEventId,
            body.id,
            body.initialState,
            worker.id,
        );
    }
    if (entries.length > 0 || removedIds.length > 0) {
        await db.recordAttributes.putMany(
            entries, removedIds,
        );
    }
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
                withoutId(payload) as unknown as Omit<
                    AIWorkerEntity, 'id'
                >,
            ),
    }),
    route('human-workers', {
        get: (db) => db.humanWorkers.getAll(),
    }),
    route('human-workers/:id', {
        get: (db, p) =>
            db.humanWorkers.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.humanWorkers.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    HumanWorkerEntity, 'id'
                >,
            ),
    }),
    route('ideas', {
        get: (db) => db.ideas.getAll(),
    }),
    route('projects', {
        get: (db) => db.projects.getAll(),
    }),
    route('idea-submissions', {
        get: (db) =>
            db.ideaSubmissions.getAll(),
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
                withoutId(body) as unknown as Omit<
                    FlowEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    FlowVersionEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    ProjectFlowEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    WorkOrderEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    FlowWorkOrderEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    StateFieldValueEntity, 'id'
                >,
            ),
        delete: (db, params) =>
            db.stateFieldValues.delete(
                param(params, 0),
            ),
    }),
    route('records', {
        get: (db) => db.records.getAll(),
    }),
    route('records/:id', {
        get: (db, p) =>
            db.records.getById(param(p, 0)),
        put: (db, p, body) =>
            db.records.put(
                param(p, 0),
                withoutId(body) as unknown as Omit<
                    RecordEntity, 'id'
                >,
            ),
        delete: (db, p) =>
            db.records.delete(param(p, 0)),
    }),
    route('record-attributes', {
        get: (db) =>
            db.recordAttributes.getAll(),
    }),
    route('record-attributes/:id', {
        get: (db, p) =>
            db.recordAttributes.getById(
                param(p, 0),
            ),
        put: (db, p, body) =>
            db.recordAttributes.put(
                param(p, 0),
                withoutId(body) as unknown as Omit<
                    RecordAttributeEntity, 'id'
                >,
            ),
        delete: (db, p) =>
            db.recordAttributes.delete(
                param(p, 0),
            ),
    }),
    route('flow-records', {
        get: (db) =>
            db.flowRecords.getAll(),
    }),
    route('flow-records/:id', {
        get: (db, p) =>
            db.flowRecords.getById(
                param(p, 0),
            ),
        put: (db, p, body) =>
            db.flowRecords.put(
                param(p, 0),
                withoutId(body) as unknown as Omit<
                    FlowRecordEntity, 'id'
                >,
            ),
        delete: (db, p) =>
            db.flowRecords.delete(
                param(p, 0),
            ),
    }),
    route('records-multi-put', {
        post: async (db, _p, body) => {
            await applyRecordMultiPut(db, body);
        },
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
                withoutId(payload) as unknown as Omit<
                    WorkerEntity, 'id'
                >,
            ),
    }),
    route('ideas/:id', {
        get: (db, p) =>
            db.ideas.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.ideas.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    IdeaEntity, 'id'
                >,
            ),
    }),
    route('projects/:id', {
        get: (db, p) =>
            db.projects.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.projects.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    ProjectEntity, 'id'
                >,
            ),
    }),
    route('idea-submissions/:id', {
        put: (db, p, payload) =>
            db.ideaSubmissions.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    IdeaSubmissionEntity, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    Objective, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    ObjectiveRevision, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    ProjectObjectiveBaselineScore, 'id'
                >,
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
                withoutId(body) as unknown as Omit<
                    ProjectObjectiveActualScore, 'id'
                >,
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

    // Parse the request body when the method
    // has one. Malformed JSON is a client
    // error (400), not a server fault — it
    // must not flow into the domain-boundary
    // try below.
    let body: Record<string, unknown> | undefined;
    if (method === 'PUT' || method === 'POST') {
        try {
            body = (await request.json()) as Record<
                string,
                unknown
            >;
        } catch {
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
                const result =
                    await matched.put(
                        adapter,
                        params,
                        body!,
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
                const result =
                    await matched.post(
                        adapter,
                        params,
                        body!,
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
    await adapter.simulateLatency();
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
    await adapter.simulateLatency();
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
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}
