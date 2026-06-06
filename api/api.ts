import type { DbAdapter } from './db.ts';
import {
    EntityNotFound,
    MissingTableError,
    TABLE_NAMES,
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
    RoleGrantEntity,
    MembershipEntity,
    IdentityTokenEntity,
    ClientEntity,
    IdentityProviderEntity,
    AuthorizationCodeEntity,
    StateFieldValueEntity,
    WorkOrderEntity,
    MemberEntity,
} from './types.ts';
import { nowUtc, type Id } from './types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    validateOrganizationEntity,
    validateRecordMultiPutBody,
    validateStateEntity,
} from './validators.ts';
import {
    verifyAccessToken,
    principalFromToken,
    ANONYMOUS_ID,
    type Principal,
} from './access-token.ts';
import { orgScopedAdapter } from './db-org-scoped.ts';
import {
    ownerOrgOfEntity,
} from './store-parent-scoped.ts';
import {
    currentRolesForInOrg,
    currentDefaultOrgFor,
    isPermitted,
} from './authorization.ts';
import {
    postToken,
    postAuthorize,
    exchangeBearerForOrg,
    tokenRevocationReason,
    subjectOrgs,
    identityDefaultOrg,
} from './authentication.ts';

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

// A 401 from the Bearer gate, raised as a distinct type so the
// web layer can tell "credentials are dead — try to refresh"
// apart from every other failure. Extends Error (unlike
// ApiError) so catch sites matching `instanceof Error` still
// see it; `reason` carries the gate's message verbatim.
export class UnauthorizedError extends Error {
    readonly reason: string;

    constructor(reason: string) {
        super(reason);
        this.name = 'UnauthorizedError';
        this.reason = reason;
    }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

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
        'authentication/token',
        'authentication/authorize',
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

// Project the opaque `secret` out of a credential before it
// crosses the API boundary — reads expose existence and
// lifecycle, never the hash. Makes true the non-leakage
// covenant in types.ts and SCHEMA.md SP-1.
function withoutSecret(
    cred: IdentityCredentialEntity,
): Omit<IdentityCredentialEntity, 'secret'> {
    const { secret: _secret, ...rest } = cred;
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
    // The record, its initial state event, and its
    // attributes commit as one transaction — a mid-write
    // failure (e.g. a missing current member) rolls the
    // whole thing back rather than orphaning the record.
    await db.transaction(
        ['records', 'record_attributes', 'states', 'members'],
        async (view) => {
            await view.records.put(body.id, body.record);
            if (body.kind === 'create') {
                const member =
                    await view.members.getById('current');
                await view.states.record(
                    body.initialStateEventId,
                    body.id,
                    body.initialState,
                    member.id,
                );
            }
            if (
                entries.length > 0
                || removedIds.length > 0
            ) {
                await view.recordAttributes.putMany(
                    entries, removedIds,
                );
            }
        },
    );
}


// One unit of a batched commit: a put (full-state upsert)
// or a delete, addressed by resource path. Validated at the
// gate, then dispatched to the same per-resource handler the
// HTTP router uses, bound to the open transaction view.
export type CommitOp =
    | {
        method: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        method: 'delete';
        resource: string;
    };

function validateCommitOp(
    raw: unknown,
    index: number,
): CommitOp {
    const label = 'commit op[' + index + ']';
    if (
        typeof raw !== 'object'
        || raw === null
        || Array.isArray(raw)
    ) {
        throw new ApiError(
            label + ' must be an object.',
            HTTP_BAD_REQUEST,
        );
    }
    const op = raw as Record<string, unknown>;
    const resource = op['resource'];
    if (typeof resource !== 'string' || resource === '') {
        throw new ApiError(
            label + ' needs a non-empty "resource".',
            HTTP_BAD_REQUEST,
        );
    }
    if (op['method'] === 'put') {
        const body = op['body'];
        if (
            typeof body !== 'object'
            || body === null
            || Array.isArray(body)
        ) {
            throw new ApiError(
                label + ' put needs an object "body".',
                HTTP_BAD_REQUEST,
            );
        }
        return {
            method: 'put',
            resource,
            body: body as Record<string, unknown>,
        };
    }
    if (op['method'] === 'delete') {
        return { method: 'delete', resource };
    }
    throw new ApiError(
        label + ' method must be "put" or "delete".',
        HTTP_BAD_REQUEST,
    );
}

function validateCommitBody(
    payload: Record<string, unknown>,
): CommitOp[] {
    const ops = payload['ops'];
    if (!Array.isArray(ops)) {
        throw new ApiError(
            'commit body needs an "ops" array.',
            HTTP_BAD_REQUEST,
        );
    }
    return ops.map(validateCommitOp);
}

const COMMIT_TABLES: ReadonlySet<string> =
    new Set(TABLE_NAMES);

// Resources whose collection name is not their table; every
// other resource maps first-segment hyphen→underscore. The
// map is closed and enumerated — no reflection.
const COMMIT_RESOURCE_TABLE: Record<string, string> = {
    'current-member': 'members',
};

function tableForCommitResource(resource: string): string {
    const first =
        resource.split('/').filter(Boolean)[0];
    if (first === undefined) {
        throw new ApiError(
            'commit op resource is empty.',
            HTTP_BAD_REQUEST,
        );
    }
    const table =
        COMMIT_RESOURCE_TABLE[first]
        ?? first.replace(/-/g, '_');
    if (!COMMIT_TABLES.has(table)) {
        throw new ApiError(
            'commit op resource "' + resource
            + '" maps to no table.',
            HTTP_BAD_REQUEST,
        );
    }
    return table;
}

// The transaction scope for a batch. Always includes
// 'states': every org-scoped put reads it (the fence's
// #assertWritable getById scans the tombstone log), so it
// must be in scope.
export function unionTablesFor(
    ops: readonly CommitOp[],
): string[] {
    const tables = new Set<string>(['states']);
    for (const op of ops) {
        tables.add(tableForCommitResource(op.resource));
    }
    return [...tables];
}

async function dispatchOpInTx(
    view: DbAdapter,
    op: CommitOp,
): Promise<void> {
    const segments =
        op.resource.split('/').filter(Boolean);
    const match = matchRoute(segments);
    if (match === null) {
        throw new ApiError(
            'commit op resource not found: '
            + op.resource,
            HTTP_NOT_FOUND,
        );
    }
    const { route: matched, params } = match;
    if (op.method === 'put') {
        if (matched.put === undefined) {
            throw new ApiError(
                'commit op put not allowed on '
                + op.resource,
                HTTP_BAD_REQUEST,
            );
        }
        await matched.put(view, params, op.body);
    } else {
        if (matched.delete === undefined) {
            throw new ApiError(
                'commit op delete not allowed on '
                + op.resource,
                HTTP_BAD_REQUEST,
            );
        }
        await matched.delete(view, params);
    }
}

// The batch route's body handler. One authenticated request;
// `effective` is already org-scoped, and its transaction
// re-scopes the view — so each op dispatches without re-auth
// or re-latency. Real rollback: any op throwing discards the
// whole batch.
async function applyCommit(
    effective: DbAdapter,
    payload: Record<string, unknown>,
): Promise<void> {
    const ops = validateCommitBody(payload);
    const tables = unionTablesFor(ops);
    await effective.transaction(tables, async (view) => {
        for (const op of ops) {
            await dispatchOpInTx(view, op);
        }
    });
}

const routes: Route[] = [
    route('members', {
        // Members are derived from the membership ledger off
        // `effective`: the org-scoped memberships name the
        // org's members; the members directory itself is
        // global (no org column). The join IS the org fence —
        // it re-scopes on an org switch with no denormalized
        // column to keep in sync. The system member rides
        // along unconditionally — it has no membership but
        // authors events in every org, so author resolution
        // (getMemberMap) must still find it; the human/ai
        // roster filters it out by type.
        get: async (db) => {
            const memberships =
                await db.memberships.getAll();
            const ids = new Set(
                memberships.map(m => m.identity_id));
            const all = await db.members.getAll();
            return all.filter(
                m => ids.has(m.id) || m.type === 'system');
        },
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
        get: async (db) =>
            (await db.identityCredentials.getAll())
                .map(withoutSecret),
    }),
    route('identity-credentials/:id', {
        get: async (db, p) =>
            withoutSecret(
                await db.identityCredentials.getById(
                    param(p, 0))),
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
    route('role-grants', {
        get: (db) => db.roleGrants.getAll(),
    }),
    route('role-grants/:id', {
        get: (db, p) =>
            db.roleGrants.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.roleGrants.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<RoleGrantEntity, 'id'>,
            ),
    }),
    route('identity-tokens', {
        get: (db) => db.identityTokens.getAll(),
    }),
    route('identity-tokens/:id', {
        get: (db, p) =>
            db.identityTokens.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identityTokens.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityTokenEntity, 'id'>,
            ),
    }),
    route('clients', {
        get: (db) => db.clients.getAll(),
    }),
    route('clients/:id', {
        get: (db, p) =>
            db.clients.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.clients.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<ClientEntity, 'id'>,
            ),
        delete: (db, p) =>
            db.clients.delete(param(p, 0)),
    }),
    route('identity-providers', {
        get: (db) => db.identityProviders.getAll(),
    }),
    route('identity-providers/:id', {
        get: (db, p) =>
            db.identityProviders.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identityProviders.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityProviderEntity, 'id'>,
            ),
    }),
    route('authorization-codes', {
        get: (db) => db.authorizationCodes.getAll(),
    }),
    route('authorization-codes/:id', {
        get: (db, p) =>
            db.authorizationCodes.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.authorizationCodes.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<AuthorizationCodeEntity, 'id'>,
            ),
    }),
    route('authentication/token', {
        post: async (db, _p, body) => {
            const result = await postToken(db, body);
            if (!result.ok) {
                throw new ApiError(
                    result.error, result.status,
                );
            }
            return result.response;
        },
    }),
    route('authentication/authorize', {
        post: async (db, _p, body) => {
            const result = await postAuthorize(db, body);
            if (!result.ok) {
                throw new ApiError(
                    result.error, result.status,
                );
            }
            return result.response;
        },
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
    route('commit', {
        post: async (db, _p, body) => {
            await applyCommit(db, body);
        },
    }),

    route('organizations', {
        get: (db) => db.organizations.getAll(),
    }),
    route('organizations/:id', {
        get: (db, p) =>
            db.organizations.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.organizations.put(
                param(p, 0),
                validateOrganizationEntity(
                    withoutId(payload),
                ),
            ),
    }),
    route('memberships', {
        get: (db) => db.memberships.getAll(),
    }),
    route('memberships/:id', {
        get: (db, p) =>
            db.memberships.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.memberships.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<MembershipEntity, 'id'>,
            ),
        delete: (db, p) =>
            db.memberships.delete(param(p, 0)),
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
    // DEMO-ONLY: these seed routes return SeededCredentials —
    // freshly-minted plaintext sign-ins surfaced in-band, once.
    // Only PBKDF2 hashes are stored; the in-band plaintext
    // return is deleted at the server tier.
    route('snapshots/mock-data', {
        post: async (db) => {
            const { populateMockData } =
                await import('./mock-data.ts');
            return populateMockData(db);
        },
    }),
    route('snapshots/bootstrap', {
        post: async (db) => {
            const {
                populateBootstrapData,
            } = await import('./mock-data.ts');
            return populateBootstrapData(db);
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
): Promise<Principal | string> {
    const header =
        request.headers.get('authorization');
    if (header === null
        || !header.startsWith('Bearer ')) {
        return 'missing bearer token';
    }
    const token = header.slice('Bearer '.length);
    const now = Math.floor(Date.now() / 1000);
    const result = await verifyAccessToken(token, now);
    if (!result.valid) {
        return result.reason;
    }
    if (result.claims.sub === ANONYMOUS_ID) {
        return 'anonymous principal not authenticated';
    }
    const revoked = await tokenRevocationReason(
        adapter, result.claims.sub,
        result.claims.iat, result.claims.jti,
    );
    if (revoked !== null) {
        return revoked;
    }
    return principalFromToken(token);
}

async function authorizeRequest(
    adapter: DbAdapter,
    principal: Principal,
    org: Id,
    method: string,
    pathname: string,
): Promise<string | null> {
    const rows = await adapter.roleGrants.getAll();
    // Roles are per-org. The caller resolves the org once and
    // passes it here; authz filters the global role_grants
    // ledger to it — identity is global, roles are per-org.
    const roles = currentRolesForInOrg(
        rows, principal.id, org,
    );
    if (isPermitted(method, pathname, roles)) {
        return null;
    }
    return 'forbidden: ' + method + ' ' + pathname
        + ' requires a role this principal lacks';
}

// Facade rewrite: exchange the caller's bearer for a token
// scoped to segments[1], then re-enter the gate against the
// flat resource path (segments[2:]). A non-member's exchange
// is a 403 — the tenant fence — and mints nothing.
async function facadeRequest(
    adapter: DbAdapter,
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
    const exchanged = await exchangeBearerForOrg(
        adapter, bearer, segments[1]!,
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
    const hasBody = request.method === 'PUT'
        || request.method === 'POST';
    const flatRequest = new Request(flatUrl.toString(), {
        method: request.method,
        headers,
        ...(hasBody
            ? { body: await request.text() } : {}),
    });
    return handleRequest(adapter, flatRequest);
}

// GET /organizations — the caller's reachable orgs, derived
// fresh from the membership ledger (never the token claim, so
// it cannot be stale). The authoritative source the embedded
// `orgs` claim is a snapshot of.
async function enumerateMyOrgs(
    adapter: DbAdapter,
    principal: Principal,
): Promise<Response> {
    const mine = await callerOrgIds(adapter, principal);
    const orgs = await adapter.organizations.getAll();
    return Response.json(
        orgs.filter(o => mine.has(o.id)),
    );
}

// The orgs a caller can reach, derived FRESH from the
// membership ledger (never the token claim, so it cannot be
// stale). Shared by GET /organizations (above) and the
// organizations/:id read fence in handleRequest.
async function callerOrgIds(
    adapter: DbAdapter,
    principal: Principal,
): Promise<Set<Id>> {
    const memberships = await adapter.memberships.getAll();
    return new Set(
        memberships
            .filter(m => m.identity_id === principal.id)
            .map(m => m.organization_id),
    );
}

// PUT/GET /identities/:id/default-org — the read/write face of
// the identity_default_orgs ledger. Authorized by tree ownership
// (caller === :id), not the admin role policy: an identity owns
// its own subtree. PUT appends a NEW event only when the org
// changes (an idempotent repeat writes nothing), and only if the
// org is one of the identity's memberships (no dangling default).
async function identityDefaultOrgRequest(
    adapter: DbAdapter,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const authResult =
        await authenticateRequest(adapter, request);
    if (typeof authResult === 'string') {
        return Response.json(
            { error: authResult },
            { status: HTTP_UNAUTHORIZED },
        );
    }
    const identityId = segments[1]!;
    if (authResult.id !== identityId) {
        return Response.json(
            {
                error: 'forbidden: an identity may act only'
                    + ' within its own tree',
            },
            { status: HTTP_FORBIDDEN },
        );
    }
    if (request.method === 'GET') {
        return Response.json({
            organization_id:
                await identityDefaultOrg(adapter, identityId),
        });
    }
    if (request.method === 'PUT') {
        let body: Record<string, unknown>;
        try {
            body = (await request.json()) as Record<
                string, unknown
            >;
        } catch {
            return Response.json(
                { error: 'Invalid JSON body' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const org = typeof body.organization_id === 'string'
            ? body.organization_id
            : '';
        const memberOrgs =
            await subjectOrgs(adapter, identityId);
        if (!memberOrgs.includes(org)) {
            return Response.json(
                {
                    error: 'forbidden: org is not one of the'
                        + " identity's memberships",
                },
                { status: HTTP_FORBIDDEN },
            );
        }
        const rows =
            await adapter.identityDefaultOrgs.getAll();
        if (currentDefaultOrgFor(rows, identityId) === org) {
            return new Response(null, { status: 204 });
        }
        await adapter.identityDefaultOrgs.put(
            generateCryptoSafeBase62(), {
                identity_id: identityId,
                organization_id: org,
                at: nowUtc(),
            });
        return new Response(null, { status: 204 });
    }
    return Response.json(
        {
            error: 'Method ' + request.method
                + ' not allowed',
        },
        { status: 405 },
    );
}

export async function handleRequest(
    adapter: DbAdapter,
    request: Request,
): Promise<Response> {
    const { pathname } = new URL(request.url);
    const pathSegments = pathname
        .split('/')
        .filter(Boolean);
    // Facade: /organizations/:org/:entity[/:id] — exchange the
    // caller's bearer for an org-scoped token and re-enter the
    // gate against the flat resource path, so the existing
    // handler is fenced automatically. Org rides the one
    // verified token, never the path.
    if (pathSegments[0] === 'organizations'
        && pathSegments.length >= 3) {
        return facadeRequest(adapter, request, pathSegments);
    }
    if (pathSegments[0] === 'identities'
        && pathSegments.length === 3
        && pathSegments[2] === 'default-org') {
        return identityDefaultOrgRequest(
            adapter, request, pathSegments,
        );
    }
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
    // Every authenticated request runs org-scoped. The org is
    // resolved ONCE here — the verified token claim, else the
    // identity's default (its set choice, else primary
    // membership) — and shared by authz and the scoped adapter.
    // A flat token whose identity resolves to no org is DENIED:
    // there is no global default to fall back on. Org-owned
    // stores fence to the org; the global identity/auth spine
    // passes through.
    let effective: DbAdapter = adapter;
    if (!BEARER_EXEMPT_ROUTES.has(routePattern)) {
        const authResult =
            await authenticateRequest(adapter, request);
        if (typeof authResult === 'string') {
            return Response.json(
                { error: authResult },
                { status: HTTP_UNAUTHORIZED },
            );
        }
        const org = authResult.organization
            ?? await identityDefaultOrg(
                adapter, authResult.id,
            );
        if (org === null) {
            return Response.json(
                {
                    error: 'forbidden: identity has no'
                        + ' organization',
                },
                { status: HTTP_FORBIDDEN },
            );
        }
        const authzFailure = await authorizeRequest(
            adapter, authResult, org, method, pathname,
        );
        if (authzFailure !== null) {
            return Response.json(
                { error: authzFailure },
                { status: HTTP_FORBIDDEN },
            );
        }
        if (method === 'GET'
            && routePattern === 'organizations') {
            return enumerateMyOrgs(adapter, authResult);
        }
        // organizations/:id is global passthrough; fence READS
        // to the caller's memberships so a non-member id 404s
        // like any foreign row. PUT is not gated here — a new
        // org is created before its first membership exists.
        if (method === 'GET'
            && routePattern === 'organizations/:id'
            && !(await callerOrgIds(adapter, authResult))
                .has(param(params, 0))) {
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
            const owner = await ownerOrgOfEntity(
                [
                    adapter.ideas, adapter.projects,
                    adapter.flows, adapter.records,
                    adapter.objectives, adapter.workOrders,
                ],
                adapter.memberships, org, param(params, 0),
            );
            if (owner !== null && owner !== org) {
                return Response.json(
                    { error: 'Not found: ' + pathname },
                    { status: HTTP_NOT_FOUND },
                );
            }
        }
        effective = orgScopedAdapter(adapter, org);
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
                        effective,
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
                        effective,
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
                    effective,
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
                        effective,
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
    if (response.status === HTTP_UNAUTHORIZED) {
        throw new UnauthorizedError(error);
    }
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
