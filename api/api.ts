import type {
    DbAdapter,
    EntityStore,
    EntityValidator,
} from './db.ts';
import { extractErrorMessage } from './error-helpers.ts';
import {
    EntityNotFound,
    MissingTableError,
    TABLE_NAMES,
    keyed,
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
    OrganizationEntity,
} from './types.ts';
import {
    nowUtc,
    assertInvitationState,
    type Id,
    type InvitationState,
} from './types.ts';
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
import { latestByKey } from './ledger-reduction.ts';
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

// Any non-401 non-ok response, raised with its HTTP status so the
// web layer can branch on the status (e.g. 404 -> a clean "not
// found" message) instead of string-matching server prose.
// Extends Error (like UnauthorizedError) so catch sites matching
// `instanceof Error` still see it; `status` carries the HTTP code.
export class RequestError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'RequestError';
        this.status = status;
    }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

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

// The `/noun/:id` resource over a standard EntityStore. The
// verbs a resource exposes are data; each maps to its one fixed
// store op (get→getById, put→put∘withoutId, delete→delete). The
// optional putValidate / getTransform are wired ONCE here at
// instantiation — Dependency Inversion, not a per-request branch
// — so the returned Route's handlers are fixed closures reused
// for the life of the process. The states log keeps its own
// explicit routes (StateStore, append-only, custom readers).
interface IdRouteConfig<T extends { id: string }> {
    noun: string;
    store: (db: DbAdapter) => EntityStore<T>;
    verbs: ReadonlyArray<'get' | 'put' | 'delete'>;
    putValidate?: EntityValidator<T>;
    getTransform?: (row: T) => unknown;
}

function makeIdRoute<T extends { id: string }>(
    config: IdRouteConfig<T>,
): Route {
    const { store, putValidate, getTransform } = config;
    const handlers: {
        get?: GetHandler;
        put?: PutHandler;
        delete?: DeleteHandler;
    } = {};
    if (config.verbs.includes('get')) {
        handlers.get = getTransform === undefined
            ? (db, p) => store(db).getById(param(p, 0))
            : async (db, p) =>
                getTransform(
                    await store(db).getById(param(p, 0)),
                );
    }
    if (config.verbs.includes('put')) {
        handlers.put = (db, p, body) =>
            store(db).put(
                param(p, 0),
                putValidate === undefined
                    ? withoutId(body) as unknown as Omit<T, 'id'>
                    : putValidate(withoutId(body)),
            );
    }
    if (config.verbs.includes('delete')) {
        handlers.delete = (db, p) =>
            store(db).delete(param(p, 0));
    }
    return route(`${config.noun}/:id`, handlers);
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
    const segments = resource.split('/').filter(Boolean);
    const first = segments[0];
    if (first === undefined) {
        throw new ApiError(
            'commit op resource is empty.',
            HTTP_BAD_REQUEST,
        );
    }
    // identities/:id/pii is the PII facet of an identity's
    // subtree — it lands in identity_pii, not identities.
    const table =
        first === 'identities' && segments[2] === 'pii'
            ? 'identity_pii'
            : COMMIT_RESOURCE_TABLE[first]
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
    makeIdRoute<AIMemberEntity>({
        noun: 'ai-members',
        store: db => db.aiMembers,
        verbs: ['get', 'put'],
    }),
    route('human-members', {
        get: (db) => db.humanMembers.getAll(),
    }),
    makeIdRoute<HumanMemberEntity>({
        noun: 'human-members',
        store: db => db.humanMembers,
        verbs: ['get', 'put'],
    }),
    route('identities', {
        get: (db) => db.identities.getAll(),
    }),
    makeIdRoute<IdentityEntity>({
        noun: 'identities',
        store: db => db.identities,
        verbs: ['get', 'put'],
    }),
    // PII is a facet of the identity's own subtree: GET is
    // self-only, PUT/DELETE self-or-admin (enforced in the
    // request gate, mirroring /identities/:id/default-org). The
    // identity-pii COLLECTION below (admin roster) is separate.
    route('identities/:id/pii', {
        get: (db, p) => db.identityPii.getById(param(p, 0)),
        put: (db, p, body) => db.identityPii.put(
            param(p, 0),
            withoutId(body) as unknown as
                Omit<IdentityPiiEntity, 'id'>,
        ),
        delete: (db, p) => db.identityPii.delete(param(p, 0)),
    }),
    route('identity-pii', {
        get: (db) => db.identityPii.getAll(),
    }),
    route('identity-credentials', {
        get: async (db) =>
            (await db.identityCredentials.getAll())
                .map(withoutSecret),
    }),
    makeIdRoute<IdentityCredentialEntity>({
        noun: 'identity-credentials',
        store: db => db.identityCredentials,
        verbs: ['get', 'put'],
        getTransform: withoutSecret,
    }),
    route('identity-token-revocations', {
        get: (db) =>
            db.identityTokenRevocations.getAll(),
    }),
    makeIdRoute<IdentityTokenRevocationEntity>({
        noun: 'identity-token-revocations',
        store: db => db.identityTokenRevocations,
        verbs: ['get', 'put'],
    }),
    route('role-grants', {
        get: (db) => db.roleGrants.getAll(),
    }),
    makeIdRoute<RoleGrantEntity>({
        noun: 'role-grants',
        store: db => db.roleGrants,
        verbs: ['get', 'put'],
    }),
    route('identity-tokens', {
        get: (db) => db.identityTokens.getAll(),
    }),
    makeIdRoute<IdentityTokenEntity>({
        noun: 'identity-tokens',
        store: db => db.identityTokens,
        verbs: ['get', 'put'],
    }),
    route('clients', {
        get: (db) => db.clients.getAll(),
    }),
    makeIdRoute<ClientEntity>({
        noun: 'clients',
        store: db => db.clients,
        verbs: ['get', 'put', 'delete'],
    }),
    route('identity-providers', {
        get: (db) => db.identityProviders.getAll(),
    }),
    makeIdRoute<IdentityProviderEntity>({
        noun: 'identity-providers',
        store: db => db.identityProviders,
        verbs: ['get', 'put'],
    }),
    route('authorization-codes', {
        get: (db) => db.authorizationCodes.getAll(),
    }),
    makeIdRoute<AuthorizationCodeEntity>({
        noun: 'authorization-codes',
        store: db => db.authorizationCodes,
        verbs: ['get', 'put'],
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
    makeIdRoute<FlowEntity>({
        noun: 'flows',
        store: db => db.flows,
        verbs: ['get', 'put'],
    }),
    route('flow-versions', {
        get: (db) =>
            db.flowVersions.getAll(),
    }),
    makeIdRoute<FlowVersionEntity>({
        noun: 'flow-versions',
        store: db => db.flowVersions,
        verbs: ['get', 'put', 'delete'],
    }),
    route('project-flows', {
        get: (db) =>
            db.projectFlows
                .getAll(),
    }),
    makeIdRoute<ProjectFlowEntity>({
        noun: 'project-flows',
        store: db => db.projectFlows,
        verbs: ['put', 'delete'],
    }),
    route('work-orders', {
        get: (db) =>
            db.workOrders.getAll(),
    }),
    makeIdRoute<WorkOrderEntity>({
        noun: 'work-orders',
        store: db => db.workOrders,
        verbs: ['get', 'put'],
    }),
    route('flow-work-orders', {
        get: (db) =>
            db.flowWorkOrders.getAll(),
    }),
    makeIdRoute<FlowWorkOrderEntity>({
        noun: 'flow-work-orders',
        store: db => db.flowWorkOrders,
        verbs: ['put'],
    }),
    route('state-field-values', {
        get: (db) =>
            db.stateFieldValues
                .getAll(),
    }),
    makeIdRoute<StateFieldValueEntity>({
        noun: 'state-field-values',
        store: db => db.stateFieldValues,
        verbs: ['put', 'delete'],
    }),
    route('records', {
        get: (db) => db.records.getAll(),
    }),
    makeIdRoute<RecordEntity>({
        noun: 'records',
        store: db => db.records,
        verbs: ['get', 'put', 'delete'],
    }),
    route('record-attributes', {
        get: (db) =>
            db.recordAttributes.getAll(),
    }),
    makeIdRoute<RecordAttributeEntity>({
        noun: 'record-attributes',
        store: db => db.recordAttributes,
        verbs: ['get', 'put', 'delete'],
    }),
    route('flow-records', {
        get: (db) =>
            db.flowRecords.getAll(),
    }),
    makeIdRoute<FlowRecordEntity>({
        noun: 'flow-records',
        store: db => db.flowRecords,
        verbs: ['get', 'put', 'delete'],
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
    makeIdRoute<OrganizationEntity>({
        noun: 'organizations',
        store: db => db.organizations,
        verbs: ['get', 'put'],
        putValidate: validateOrganizationEntity,
    }),
    route('memberships', {
        get: (db) => db.memberships.getAll(),
    }),
    makeIdRoute<MembershipEntity>({
        noun: 'memberships',
        store: db => db.memberships,
        verbs: ['get', 'put', 'delete'],
    }),
    route('current-member', {
        get: (db) =>
            db.members.getById('current'),
    }),

    makeIdRoute<MemberEntity>({
        noun: 'members',
        store: db => db.members,
        verbs: ['get', 'put'],
    }),
    makeIdRoute<IdeaEntity>({
        noun: 'ideas',
        store: db => db.ideas,
        verbs: ['get', 'put'],
    }),
    makeIdRoute<ProjectEntity>({
        noun: 'projects',
        store: db => db.projects,
        verbs: ['get', 'put'],
    }),
    makeIdRoute<IdeaSubmissionEntity>({
        noun: 'idea-submissions',
        store: db => db.ideaSubmissions,
        verbs: ['put'],
    }),
    route('objectives', {
        get: (db) => db.objectives.getAll(),
    }),
    makeIdRoute<Objective>({
        noun: 'objectives',
        store: db => db.objectives,
        verbs: ['get', 'put'],
    }),
    route('objective-revisions', {
        get: (db) =>
            db.objectiveRevisions.getAll(),
    }),
    makeIdRoute<ObjectiveRevision>({
        noun: 'objective-revisions',
        store: db => db.objectiveRevisions,
        verbs: ['put'],
    }),
    route('project-objective-baseline-scores', {
        get: (db) =>
            db.projectObjectiveBaselineScores.getAll(),
    }),
    makeIdRoute<ProjectObjectiveBaselineScore>({
        noun: 'project-objective-baseline-scores',
        store: db => db.projectObjectiveBaselineScores,
        verbs: ['put'],
    }),
    route('project-objective-actual-scores', {
        get: (db) =>
            db.projectObjectiveActualScores.getAll(),
    }),
    makeIdRoute<ProjectObjectiveActualScore>({
        noun: 'project-objective-actual-scores',
        store: db => db.projectObjectiveActualScores,
        verbs: ['put'],
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
    // Roles are per-org, but a grant is keyed by identity:
    // read this principal's grants through the identity_id
    // index, then currentRolesForInOrg filters to the org —
    // identity is global, roles are per-org.
    const rows = await keyed(adapter.roleGrants)
        .getAllWhere('identity_id', principal.id);
    const roles = currentRolesForInOrg(
        rows, principal.id, org,
    );
    if (isPermitted(method, pathname, roles)) {
        return null;
    }
    return 'forbidden: ' + method + ' ' + pathname
        + ' requires a role this principal lacks';
}

// The PII facet of an identity's subtree. A member reads ONLY
// its own (GET self); writes are its own OR an admin's (member
// management). Mirrors the tree-ownership check of
// /identities/:id/default-org, widened to admin for writes.
async function authorizeIdentityPii(
    adapter: DbAdapter,
    principal: Principal,
    org: Id,
    method: string,
    targetId: string,
): Promise<string | null> {
    if (principal.id === targetId) {
        return null;
    }
    if (method === 'GET') {
        return 'forbidden: an identity may read only its'
            + ' own pii';
    }
    if (await callerIsOrgAdmin(adapter, principal.id, org)) {
        return null;
    }
    return "forbidden: writing another identity's pii"
        + ' requires an admin role';
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

// A JSON error response at one status — the shape every
// invitation guard returns on rejection.
function errorJson(message: string, status: number): Response {
    return Response.json({ error: message }, { status });
}

// The active org of the caller: the verified token claim, else
// the identity's resolved default. Null when the identity can
// reach no org — the same denial the main gate raises.
async function callerActiveOrg(
    adapter: DbAdapter,
    principal: Principal,
): Promise<Id | null> {
    return principal.organization
        ?? await identityDefaultOrg(adapter, principal.id);
}

async function callerIsOrgAdmin(
    adapter: DbAdapter,
    identityId: Id,
    org: Id,
): Promise<boolean> {
    const rows = await keyed(adapter.roleGrants)
        .getAllWhere('identity_id', identityId);
    return currentRolesForInOrg(rows, identityId, org)
        .includes('admin');
}

// An invitation's current state: the latest event on its id,
// resolved via latestByKey (the same derivation every entity's
// state uses) rather than states.currentFor, whose strict-`>`
// tiebreak keeps the FIRST event and would freeze a co-timestamped
// lifecycle at 'pending'. On a same-millisecond `at` tie the
// winner is backend-dependent (the memory tier preserves insertion
// order; IndexedDB's index.getAll returns primary-key order) — not
// an issue here, since each lifecycle transition is a distinct HTTP
// request milliseconds-to-seconds apart, so `at` ties do not occur
// in practice. Null when no event has been recorded.
async function currentInvitationState(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationState | null> {
    const events = await adapter.states.allFor(id);
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(id);
    return latest === undefined
        ? null
        : assertInvitationState(latest.state, 'invitation ' + id);
}

// The invitation surface: an identity/org-spanning workflow the
// org fence cannot host. The invitee reads and answers an
// invitation to an org they are NOT yet in, and acceptance
// writes the membership in the INVITATION's org — never the
// caller's active org, which the org-scoped store would stamp.
// So every op runs on the BASE adapter with an explicit guard,
// like identityDefaultOrgRequest: grant/revoke/sent require an
// admin role in the relevant org; accept/decline/read require
// the caller to BE the invitee. These never touch the
// admin-only ROUTE_POLICY, so a non-admin invitee can accept.
// GET /organizations enumerates the caller's OWN membership
// orgs — identity-scoped like /invitations, so it gates on
// authentication, not a role. enumerateMyOrgs self-fences to
// the caller's memberships, so a roleless member sees only
// their own orgs and can boot the shell.
async function organizationsEnumerationRequest(
    adapter: DbAdapter,
    request: Request,
): Promise<Response> {
    const authResult =
        await authenticateRequest(adapter, request);
    if (typeof authResult === 'string') {
        return errorJson(authResult, HTTP_UNAUTHORIZED);
    }
    return enumerateMyOrgs(adapter, authResult);
}

async function invitationsRequest(
    adapter: DbAdapter,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const authResult =
        await authenticateRequest(adapter, request);
    if (typeof authResult === 'string') {
        return errorJson(authResult, HTTP_UNAUTHORIZED);
    }
    const principal = authResult;
    const method = request.method;
    if (segments.length === 1) {
        if (method === 'GET') {
            return invitationsForInvitee(adapter, principal);
        }
        if (method === 'POST') {
            return grantInvitation(adapter, request, principal);
        }
    }
    if (segments.length === 2 && segments[1] === 'sent') {
        if (method === 'GET') {
            return sentInvitations(adapter, principal);
        }
    }
    if (segments.length === 3 && method === 'POST') {
        const id = segments[1]!;
        const op = segments[2]!;
        if (op === 'acceptance') {
            return acceptInvitation(adapter, principal, id);
        }
        if (op === 'decline') {
            return declineInvitation(adapter, principal, id);
        }
        if (op === 'revocation') {
            return revokeInvitation(adapter, principal, id);
        }
    }
    return errorJson(
        'Not found: /' + segments.join('/'), HTTP_NOT_FOUND,
    );
}

// The caller's own invitations, each enriched with the org name
// and the inviter's name for display. The first event is the
// grant (its actor is the inviter); the last event is the
// current state. The whole result is the caller's own — never
// another identity's.
async function invitationsForInvitee(
    adapter: DbAdapter,
    principal: Principal,
): Promise<Response> {
    const mine = (await adapter.invitations.getAll())
        .filter(inv => inv.identity_id === principal.id);
    const orgName = new Map(
        (await adapter.organizations.getAll())
            .map(o => [o.id, o.name]));
    const personName = new Map(
        (await adapter.identityPii.getAll())
            .map(p => [p.id, p.name]));
    const out = [];
    for (const inv of mine) {
        const events = await adapter.states.allFor(inv.id);
        const latest = latestByKey(events, ev => ev.entity_id)
            .get(inv.id);
        if (latest === undefined) continue;
        // The inviter is the actor of the grant ('pending') event —
        // found by state, not position, so a same-`at` tie cannot
        // misattribute it. An absent name (erased PII) stays empty;
        // the presenter then omits the "Invited by" line.
        const grant = events.find(ev => ev.state === 'pending');
        out.push({
            id: inv.id,
            organization_id: inv.organization_id,
            organization_name:
                orgName.get(inv.organization_id) ?? '',
            identity_id: inv.identity_id,
            invited_by_name: grant
                ? personName.get(grant.member_id) ?? ''
                : '',
            at: inv.at,
            state: assertInvitationState(
                latest.state, 'invitation ' + inv.id),
        });
    }
    return Response.json(out);
}

// The active org's outstanding (pending) invitations, for an
// admin. The invitee email rides along because the admin
// supplied it at grant time — need-to-know, not a PII leak.
async function sentInvitations(
    adapter: DbAdapter,
    principal: Principal,
): Promise<Response> {
    const org = await callerActiveOrg(adapter, principal);
    if (org === null) {
        return errorJson(
            'forbidden: identity has no organization',
            HTTP_FORBIDDEN);
    }
    if (!await callerIsOrgAdmin(adapter, principal.id, org)) {
        return errorJson(
            'forbidden: listing sent invitations requires'
            + ' an admin role', HTTP_FORBIDDEN);
    }
    const orgInvites = (await adapter.invitations.getAll())
        .filter(inv => inv.organization_id === org);
    const email = new Map(
        (await adapter.identityPii.getAll())
            .map(p => [p.id, p.email]));
    const out = [];
    for (const inv of orgInvites) {
        const state = await currentInvitationState(
            adapter, inv.id);
        if (state !== 'pending') continue;
        out.push({
            id: inv.id,
            organization_id: org,
            identity_id: inv.identity_id,
            invitee_email: email.get(inv.identity_id) ?? '',
            at: inv.at,
            state: 'pending',
        });
    }
    return Response.json(out);
}

// Grant: an admin invites an EXISTING identity by email. The
// org is the admin's verified active org. Idempotent on an
// outstanding pending invite for the (org, identity) pair.
// New-identity creation and email delivery are deferred.
async function grantInvitation(
    adapter: DbAdapter,
    request: Request,
    principal: Principal,
): Promise<Response> {
    const org = await callerActiveOrg(adapter, principal);
    if (org === null) {
        return errorJson(
            'forbidden: identity has no organization',
            HTTP_FORBIDDEN);
    }
    if (!await callerIsOrgAdmin(adapter, principal.id, org)) {
        return errorJson(
            'forbidden: granting an invitation requires an'
            + ' admin role', HTTP_FORBIDDEN);
    }
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<
            string, unknown
        >;
    } catch {
        return errorJson('Invalid JSON body', HTTP_BAD_REQUEST);
    }
    const email = typeof body.email === 'string'
        ? body.email : '';
    if (email === '') {
        return errorJson(
            'an "email" is required', HTTP_BAD_REQUEST);
    }
    // DEMO-TIER POSTURE: a missing email 404s and an already-member
    // 409s, so an org admin can tell whether an email maps to an
    // existing identity (even one in another org). This is a conscious
    // tradeoff — the admin needs to know the invite landed, and the
    // plan defers new-identity creation — of the same demo grade as the
    // client-shipped HMAC key. A server tier would resolve emails
    // without reflecting existence through the status code.
    const match = (await adapter.identityPii.getAll())
        .find(p => p.email === email);
    if (match === undefined) {
        return errorJson(
            'no identity with that email', HTTP_NOT_FOUND);
    }
    const identityId = match.id;
    const id = generateCryptoSafeBase62();
    const eventId = generateCryptoSafeBase62();
    const at = nowUtc();
    // The member/pending checks and the write run in ONE transaction so
    // two concurrent grants cannot both pass the check and each append a
    // pending invitation (Commandment VII). The tx RETURNS its outcome
    // (a closure-mutated outer var would not narrow), mapped below.
    const result = await adapter.transaction(
        ['invitations', 'states', 'memberships'],
        async (view): Promise<GrantOutcome> => {
            const member = (await view.memberships.getAll())
                .some(m => m.identity_id === identityId
                    && m.organization_id === org);
            if (member) return { kind: 'member' };
            const existing = await pendingInvitationFor(
                view, org, identityId);
            if (existing !== null) {
                return {
                    kind: 'existing',
                    id: existing.id, at: existing.at,
                };
            }
            await view.invitations.put(id, {
                organization_id: org,
                identity_id: identityId,
                at,
            });
            await view.states.record(
                eventId, id, 'pending', principal.id);
            return { kind: 'created' };
        },
    );
    if (result.kind === 'member') {
        return errorJson(
            'that identity is already a member of this'
            + ' organization', HTTP_CONFLICT);
    }
    if (result.kind === 'existing') {
        return Response.json({
            id: result.id, organization_id: org,
            identity_id: identityId, at: result.at,
            state: 'pending',
        });
    }
    return Response.json({
        id, organization_id: org, identity_id: identityId,
        at, state: 'pending',
    });
}

type GrantOutcome =
    | { kind: 'member' }
    | { kind: 'existing'; id: Id; at: string }
    | { kind: 'created' };

// The org's outstanding pending invitation for an identity, or
// null. The grant idempotency check.
async function pendingInvitationFor(
    adapter: DbAdapter,
    org: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const candidates = (await adapter.invitations.getAll())
        .filter(inv => inv.organization_id === org
            && inv.identity_id === identityId);
    for (const inv of candidates) {
        const state = await currentInvitationState(
            adapter, inv.id);
        if (state === 'pending') {
            return { id: inv.id, at: inv.at };
        }
    }
    return null;
}

// Accept: the invitee turns a pending invitation into a real
// membership in the INVITATION's org, in one atomic batch with
// the 'accepted' event. Idempotent: a re-accept is a no-op; a
// non-pending invitation is a conflict.
async function acceptInvitation(
    adapter: DbAdapter,
    principal: Principal,
    id: Id,
): Promise<Response> {
    const inv = await loadInvitation(adapter, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (inv.identity_id !== principal.id) {
        return errorJson(
            'forbidden: only the invitee may accept',
            HTTP_FORBIDDEN);
    }
    const membershipId = generateCryptoSafeBase62();
    const eventId = generateCryptoSafeBase62();
    const at = nowUtc();
    // The pending check rides INSIDE the write transaction so a
    // concurrent revoke/decline cannot slip between the check and the
    // membership write — a revoke must actually stop access (Commandment
    // X / II). Mirrors grantAuthorizationCode's in-tx state gate.
    let conflict = false;
    await adapter.transaction(
        ['memberships', 'states'],
        async (view) => {
            const state = await currentInvitationState(view, id);
            if (state === 'accepted') return;   // idempotent no-op
            if (state !== 'pending') { conflict = true; return; }
            const already = (await view.memberships.getAll())
                .some(m => m.identity_id === principal.id
                    && m.organization_id
                        === inv.organization_id);
            if (!already) {
                await view.memberships.put(membershipId, {
                    organization_id: inv.organization_id,
                    identity_id: principal.id,
                    at,
                });
            }
            await view.states.record(
                eventId, id, 'accepted', principal.id);
        },
    );
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    return new Response(null, { status: 204 });
}

// Decline: the invitee appends 'declined'. No membership is
// written. Idempotent on an already-declined invitation.
async function declineInvitation(
    adapter: DbAdapter,
    principal: Principal,
    id: Id,
): Promise<Response> {
    const inv = await loadInvitation(adapter, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (inv.identity_id !== principal.id) {
        return errorJson(
            'forbidden: only the invitee may decline',
            HTTP_FORBIDDEN);
    }
    const eventId = generateCryptoSafeBase62();
    let conflict = false;
    await adapter.transaction(['states'], async (view) => {
        const state = await currentInvitationState(view, id);
        if (state === 'declined') return;   // idempotent no-op
        if (state !== 'pending') { conflict = true; return; }
        await view.states.record(
            eventId, id, 'declined', principal.id);
    });
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    return new Response(null, { status: 204 });
}

// Revoke: an admin of the invitation's org cancels a pending
// invite by appending 'revoked'. The invitation row persists as
// audit (mirrors postRoleRevocation). Idempotent on an
// already-revoked invitation.
async function revokeInvitation(
    adapter: DbAdapter,
    principal: Principal,
    id: Id,
): Promise<Response> {
    const inv = await loadInvitation(adapter, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (!await callerIsOrgAdmin(
        adapter, principal.id, inv.organization_id)) {
        return errorJson(
            'forbidden: revoking an invitation requires an'
            + ' admin role', HTTP_FORBIDDEN);
    }
    const eventId = generateCryptoSafeBase62();
    let conflict = false;
    await adapter.transaction(['states'], async (view) => {
        const state = await currentInvitationState(view, id);
        if (state === 'revoked') return;   // idempotent no-op
        if (state !== 'pending') { conflict = true; return; }
        await view.states.record(
            eventId, id, 'revoked', principal.id);
    });
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    return new Response(null, { status: 204 });
}

// Read one invitation by id from the base store, or null when
// absent — the 404 the invitation routes raise.
async function loadInvitation(
    adapter: DbAdapter,
    id: Id,
): Promise<{ id: Id; organization_id: Id;
    identity_id: Id; at: string } | null> {
    try {
        return await adapter.invitations.getById(id);
    } catch (e) {
        if (e instanceof EntityNotFound) return null;
        throw e;
    }
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
    // The invitation surface is identity/org-spanning, so it
    // runs on the BASE adapter with explicit guards rather than
    // the org-scoped route table — see invitationsRequest.
    if (pathSegments[0] === 'invitations') {
        return invitationsRequest(
            adapter, request, pathSegments,
        );
    }
    // Enumerating one's own orgs is identity-scoped, not
    // org-owned: it runs above the admin gate so a roleless
    // member can boot. Only the bare GET — PUT (create) and
    // /organizations/:id keep the org-scoped route handling.
    if (pathSegments[0] === 'organizations'
        && pathSegments.length === 1
        && request.method === 'GET') {
        return organizationsEnumerationRequest(adapter, request);
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
        const authzFailure =
            routePattern === 'identities/:id/pii'
                ? await authorizeIdentityPii(
                    adapter, authResult, org,
                    method, param(params, 0))
                : await authorizeRequest(
                    adapter, authResult, org,
                    method, pathname);
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
            // Reach the keyed membership read kept off the
            // EntityStore contract, so the owner resolves
            // through the identity_id index, not a scan.
            const memberships = keyed(adapter.memberships);
            const owner = await ownerOrgOfEntity(
                [
                    adapter.ideas, adapter.projects,
                    adapter.flows, adapter.records,
                    adapter.objectives, adapter.workOrders,
                    adapter.invitations,
                ],
                memberships, org, param(params, 0),
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
            { error: extractErrorMessage(error) },
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
    throw new RequestError(
        `${error} (${response.url})`,
        response.status,
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
