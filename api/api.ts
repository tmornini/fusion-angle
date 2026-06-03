import type { DbAdapter } from './db.ts';
import {
    EntityNotFound,
    MissingTableError,
} from './db.ts';
import type {
    AIMemberEntity,
    FlowEntity,
    FlowVersionEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    HumanMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
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
    MemberEntity,
} from './types.ts';
import {
    validateOrganizationEntity,
    validateRecordMultiPutBody,
    validateStateEntity,
} from './validators.ts';
import {
    verifyAccessToken,
    ANONYMOUS_ID,
    revokedBeforeSeconds,
} from './access-token.ts';

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
const HTTP_UNAUTHORIZED = 401;

// Authenticate in-tree requests at the one chokepoint. The
// gate runs AFTER matchRoute (which already 404'd anything
// OUTSIDE our URL tree — honest: no resource, nothing to
// authenticate to) and BEFORE the handler — so an
// unauthenticated caller never reaches an instance lookup,
// and resource-instance existence is never disclosed to it.
// A 401 states only "no valid credentials," never that a
// resource exists. The snapshot/bootstrap plane is EXEMPT
// from the Bearer gate because it is infrastructure BELOW
// the auth tier (it installs the datastore before any
// identity can exist). Exempt-from-the-gate is NOT the same
// as unauthenticated — it is a single audited surface; any
// addition here is security-sensitive.
const BEARER_EXEMPT_ROUTES: ReadonlySet<string> =
    new Set([
        'snapshots/schema',
        'snapshots/mock-data',
        'snapshots/bootstrap',
        'snapshots/import',
    ]);

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
        const member =
            await db.members.getById('current');
        await db.states.record(
            body.initialStateEventId,
            body.id,
            body.initialState,
            member.id,
        );
    }
    if (entries.length > 0 || removedIds.length > 0) {
        await db.recordAttributes.putMany(
            entries, removedIds,
        );
    }
}


const routes: Route[] = [
    route('members', {
        get: (db) => db.members.getAll(),
    }),
    route('ai-members', {
        get: (db) => db.aiMembers.getAll(),
    }),
    route('ai-members/:id', {
        get: (db, p) =>
            db.aiMembers.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.aiMembers.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    AIMemberEntity, 'id'
                >,
            ),
    }),
    route('human-members', {
        get: (db) => db.humanMembers.getAll(),
    }),
    route('human-members/:id', {
        get: (db, p) =>
            db.humanMembers.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.humanMembers.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    HumanMemberEntity, 'id'
                >,
            ),
    }),
    route('identities', {
        get: (db) => db.identities.getAll(),
    }),
    route('identities/:id', {
        get: (db, p) =>
            db.identities.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identities.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityEntity, 'id'>,
            ),
    }),
    route('identity-pii', {
        get: (db) => db.identityPii.getAll(),
    }),
    route('identity-pii/:id', {
        get: (db, p) =>
            db.identityPii.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identityPii.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityPiiEntity, 'id'>,
            ),
        delete: (db, p) =>
            db.identityPii.delete(param(p, 0)),
    }),
    route('identity-credentials', {
        get: (db) => db.identityCredentials.getAll(),
    }),
    route('identity-credentials/:id', {
        get: (db, p) =>
            db.identityCredentials.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.identityCredentials.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<
                        IdentityCredentialEntity, 'id'
                    >,
            ),
    }),
    route('identity-token-revocations', {
        get: (db) =>
            db.identityTokenRevocations.getAll(),
    }),
    route('identity-token-revocations/:id', {
        get: (db, p) =>
            db.identityTokenRevocations.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.identityTokenRevocations.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<
                        IdentityTokenRevocationEntity,
                        'id'
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
    route('current-member', {
        get: (db) =>
            db.members.getById('current'),
    }),

    route('members/:id', {
        get: (db, p) =>
            db.members.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.members.put(
                param(p, 0),
                withoutId(payload) as unknown as Omit<
                    MemberEntity, 'id'
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

async function authenticateRequest(
    adapter: DbAdapter,
    request: Request,
): Promise<string | null> {
    const header =
        request.headers.get('authorization');
    if (header === null
        || !header.startsWith('Bearer ')) {
        return 'missing bearer token';
    }
    const token = header.slice('Bearer '.length);
    const now = Math.floor(Date.now() / 1000);
    const result = verifyAccessToken(token, now);
    if (!result.valid) {
        return result.reason;
    }
    if (result.claims.sub === ANONYMOUS_ID) {
        return 'anonymous principal not authenticated';
    }
    const rows =
        await adapter.identityTokenRevocations.getAll();
    const revokedBefore = revokedBeforeSeconds(
        rows, result.claims.sub,
    );
    if (revokedBefore !== null
        && result.claims.iat < revokedBefore) {
        return 'token revoked';
    }
    return null;
}

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

    const routePattern = matched.segments.join('/');
    if (!BEARER_EXEMPT_ROUTES.has(routePattern)) {
        const authFailure =
            await authenticateRequest(adapter, request);
        if (authFailure !== null) {
            return Response.json(
                { error: authFailure },
                { status: HTTP_UNAUTHORIZED },
            );
        }
    }

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
    adapter: DbAdapter,
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
    adapter: DbAdapter,
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
    adapter: DbAdapter,
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
