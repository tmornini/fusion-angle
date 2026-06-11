import type {
    DbAdapter,
    EntityStore,
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
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    validateRecordMultiPutBody,
    validateStateEntity,
    validateWorkOrderFlowGraphJson,
} from './validators.ts';
import {
    latestClaimEvent,
    isClaimEventExpired,
} from './work-order-claims.ts';
import {
    ATTRIBUTE_RESTRICT_TABLES,
    collectAttributeReferrers,
    hasReferrers,
    describeReferrers,
} from './record-attribute-refs.ts';
import {
    postToken,
    postAuthorize,
    rotateRefreshJti,
    revokeTokenChain,
} from './authentication.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_CONFLICT,
} from './http-errors.ts';

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

export interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}

export function route(
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

export function param(
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
// optional getTransform is wired ONCE here at instantiation —
// Dependency Inversion, not a per-request branch — so the
// returned Route's handlers are fixed closures reused for the
// life of the process. Validation runs in the store, which is
// constructed with its entity validator — the route trusts it.
// The states log keeps its own explicit routes (StateStore,
// append-only, custom readers).
interface IdRouteConfig<T extends { id: string }> {
    noun: string;
    store: (db: DbAdapter) => EntityStore<T>;
    verbs: ReadonlyArray<'get' | 'put' | 'delete'>;
    getTransform?: (row: T) => unknown;
}

function makeIdRoute<T extends { id: string }>(
    config: IdRouteConfig<T>,
): Route {
    const { store, getTransform } = config;
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
                withoutId(body) as unknown as Omit<T, 'id'>,
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
    // Removed attributes are RESTRICTED inside the same tx:
    // a referenced attribute 409s and the whole batch rolls
    // back (api/record-attribute-refs.ts).
    await db.transaction(
        [...new Set([
            'records', 'record_attributes', 'states',
            'members', ...ATTRIBUTE_RESTRICT_TABLES,
        ])],
        async (view) => {
            await view.records.put(body.id, body.record);
            if (body.kind === 'create') {
                const member =
                    await view.members.getById('current');
                await view.states.postEvent(
                    body.initialStateEventId,
                    body.id,
                    body.initialState,
                    member.id,
                );
            }
            if (removedIds.length > 0) {
                const referrers =
                    await collectAttributeReferrers(
                        view, removedIds,
                    );
                for (const [id, refs] of referrers) {
                    if (hasReferrers(refs)) {
                        throw new ApiError(
                            describeReferrers(id, refs),
                            HTTP_CONFLICT,
                        );
                    }
                }
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

export const routes: Route[] = [
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
    // Rotate a refresh jti. The ledger read, the rotation
    // plan, and its appends ride ONE transaction
    // (rotateRefreshJti — the same body the refresh grant
    // runs), so two concurrent rotations of one chain
    // cannot both observe the live jti (the lost-rotation
    // TOCTOU). A live jti returns its successor; a
    // known-but-not-live jti is reuse — the whole chain's
    // revocation has already landed atomically — then 409.
    route('identity-tokens/:jti/rotation', {
        post: async (db, p) => {
            const presented = param(p, 0);
            const outcome = await rotateRefreshJti(
                db, presented,
            );
            if (outcome.kind === 'rotate') {
                return { jti: outcome.newJti };
            }
            throw new ApiError(
                'refresh token is not live (reuse): '
                    + presented,
                HTTP_CONFLICT,
            );
        },
    }),
    // Revoke the whole chain a jti belongs to (log out one
    // session). Read and appends ride one transaction; an
    // unknown jti is an idempotent no-op.
    route('identity-tokens/:jti/revocation', {
        post: async (db, p) => {
            await revokeTokenChain(db, param(p, 0));
        },
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
    // Claim a work order. The read of the prior claim and
    // the append of the new claim events ride ONE
    // transaction, so two concurrent claims cannot both
    // observe "no live claim" (the duplicate-claim TOCTOU).
    // A live claim by another member is a 409; by the
    // caller, an idempotent no-op. A claim aged past the
    // flow's lockTimeout is superseded: 'claim_expired'
    // (naming the prior claimant) and the new 'claimed'
    // land atomically.
    route('work-orders/:id/claim', {
        post: (db, p) =>
            db.transaction(
                ['work_orders', 'states', 'members'],
                async (view) => {
                    const workOrderId = param(p, 0);
                    const wo = await view.workOrders
                        .getById(workOrderId);
                    const graph =
                        validateWorkOrderFlowGraphJson(
                            wo.flow_graph,
                            'work_orders.flow_graph',
                        );
                    const member = await view.members
                        .getById('current');
                    const events = await view.states
                        .getAllFor(workOrderId);
                    const prior = latestClaimEvent(
                        events, workOrderId,
                    );
                    const priorLive = prior !== null
                        && prior.state === 'claimed'
                        && !isClaimEventExpired(
                            prior, graph.lockTimeout,
                        );
                    if (priorLive) {
                        if (
                            prior.member_id === member.id
                        ) {
                            return;
                        }
                        throw new ApiError(
                            'work order is already'
                                + ' claimed',
                            HTTP_CONFLICT,
                        );
                    }
                    if (
                        prior !== null
                        && prior.state === 'claimed'
                    ) {
                        await view.states.postEvent(
                            generateCryptoSafeBase62(),
                            workOrderId,
                            'claim_expired',
                            prior.member_id,
                        );
                    }
                    await view.states.postEvent(
                        generateCryptoSafeBase62(),
                        workOrderId,
                        'claimed',
                        member.id,
                    );
                },
            ),
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
    route('record-attributes/:id', {
        get: (db, p) =>
            db.recordAttributes.getById(param(p, 0)),
        put: (db, p, body) =>
            db.recordAttributes.put(
                param(p, 0),
                withoutId(body) as unknown as
                    Omit<RecordAttributeEntity, 'id'>,
            ),
        // DELETE is RESTRICT, not cascade: an attribute
        // still named by state_field_values rows or bound
        // in a flow / work-order graph refuses to die (409
        // naming the referrers) — destroying it would
        // orphan immutable event payloads. The referrer
        // check and the splice ride ONE transaction, so no
        // writer can slip a new reference between them.
        delete: (db, p) => {
            const id = param(p, 0);
            return db.transaction(
                [...new Set([
                    'record_attributes',
                    ...ATTRIBUTE_RESTRICT_TABLES,
                ])],
                async (view) => {
                    const referrers =
                        await collectAttributeReferrers(
                            view, [id],
                        );
                    const refs = referrers.get(id)!;
                    if (hasReferrers(refs)) {
                        throw new ApiError(
                            describeReferrers(id, refs),
                            HTTP_CONFLICT,
                        );
                    }
                    await view.recordAttributes
                        .delete(id);
                },
            );
        },
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

    route('organizations', {
        get: (db) => db.organizations.getAll(),
    }),
    makeIdRoute<OrganizationEntity>({
        noun: 'organizations',
        store: db => db.organizations,
        verbs: ['get', 'put'],
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
            db.states.getCurrentFor(param(p, 0)),
    }),
    route('entity-states/:id/history', {
        get: (db, p) =>
            db.states.getAllFor(param(p, 0)),
    }),

    route('snapshots/schema', {
        get: async (db) =>
            (await db.hasSchema())
                ? db.getSnapshot()
                : null,
        delete: (db) => db.deleteSchema(),
        post: (db) => db.postSchemaCreation(),
    }),
    // DEMO-ONLY: these seed routes return SeededCredentials —
    // freshly-minted plaintext sign-ins surfaced in-band, once.
    // Only PBKDF2 hashes are stored; the in-band plaintext
    // return is deleted at the server tier.
    route('snapshots/mock-data', {
        post: async (db) => {
            const { postMockDataLoad } =
                await import('./mock-data.ts');
            return postMockDataLoad(db);
        },
    }),
    route('snapshots/bootstrap', {
        post: async (db) => {
            const {
                postBootstrap,
            } = await import('./mock-data.ts');
            return postBootstrap(db);
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
            return db.putSnapshot(
                payload.json,
            );
        },
    }),
];

export function matchRoute(
    table: readonly Route[],
    pathSegments: string[],
): { route: Route; params: string[] } | null {
    for (
        const routeDefinition of table
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
