import type {
    DbAdapter,
    EntityStore,
} from './db.ts';
import type {
    FlowGraphDelta,
} from './validators.ts';
import type {
    Id,
    AIMemberEntity,
    FlowEntity,
    FlowWithGraph,
    FlowVersionEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    HumanMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    ObjectiveEntity,
    ObjectiveRevisionEntity,
    ProjectEntity,
    ProjectFlowEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    RecordEntity,
    RecordAttributeEntity,
    RoleGrantEntity,
    MembershipEntity,
    IdentityTokenEntity,
    IdentityProviderEntity,
    StateFieldValueEntity,
    WorkOrderEntity,
    MemberEntity,
    OrganizationEntity,
} from './types.ts';
import {
    validateAIMemberCreateBody,
    validateAIMemberEditBody,
    validateHumanMemberCreateBody,
    validateHumanMemberEditBody,
    validateFlowCreateBody,
    validateFlowVersionPublishBody,
    validateFlowPutBody,
    validateFlowUndoBody,
    validateFlowRedoBody,
    validateIdeaCreateBody,
    validateIdeaConversionBody,
    validateIdentityCreateBody,
    validateObjectiveCreateBody,
    validateRecordWriteBody,
    validateStateBody,
    validateWorkOrderClaimBody,
    validateWorkOrderCreateBody,
    validateWorkOrderTransitionBody,
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
    deleteRecordAttributeSafe,
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
import {
    reassembleStoredGraph,
} from './flow-graph-relations.ts';
import {
    storedGraphField,
} from './types.ts';

// Every handler receives the verified caller's id (actor) as
// its final argument — the one place authorship is sourced.
// The gate resolves it from the token; handlers that author
// state events or identify the caller stamp it, and the rest
// (the makeIdRoute closures) simply ignore the extra arg.
type GetHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
) => Promise<unknown>;

type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
) => Promise<void>;

type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
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

async function applyRecordWrite(
    db: DbAdapter,
    payload: Record<string, unknown>,
    actor: Id,
): Promise<void> {
    const body = validateRecordWriteBody(payload);
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
    // failure rolls the whole thing back rather than
    // orphaning the record. The initial state event is
    // authored by the verified caller (actor), never a
    // client-supplied member. Removed attributes are
    // RESTRICTED inside the same tx: a referenced attribute
    // 409s and the whole batch rolls back
    // (api/record-attribute-refs.ts).
    await db.transaction(
        [...new Set([
            'records', 'record_attributes', 'states',
            ...ATTRIBUTE_RESTRICT_TABLES,
        ])],
        async (view) => {
            await view.records.put(body.id, body.record);
            if (body.kind === 'create') {
                await view.states.postEvent(
                    body.initialStateEventId,
                    body.id,
                    body.initialState,
                    actor,
                    body.initialStateAt,
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

// Write a FlowGraphDelta to the four relation tables inside an
// ALREADY-OPEN transaction view: node/edge upserts, append-only
// member/attribute events, and node/edge deletion events
// (authored by actor, never the body). The one delta-write
// voice — POST /flows (create), PUT /flows/:id (save), and
// undo/redo all route through it (create passes an empty
// deletions array). The view's table set must already include
// flow_nodes, flow_edges, flow_node_members,
// flow_node_attributes, and states.
async function writeFlowGraphDelta(
    view: DbAdapter,
    delta: FlowGraphDelta,
    actor: Id,
): Promise<void> {
    for (const n of delta.nodes) {
        const {
            id, flow_id, name, position_x, position_y,
            is_create, is_archive, task_instructions, at,
        } = n;
        await view.flowNodes.put(id, {
            flow_id, name, position_x, position_y,
            is_create, is_archive, task_instructions, at,
        });
    }
    for (const e of delta.edges) {
        const {
            id, flow_id, name, from_node_id, to_node_id, at,
        } = e;
        await view.flowEdges.put(id, {
            flow_id, name, from_node_id, to_node_id, at,
        });
    }
    for (const m of delta.memberEvents) {
        const {
            id, flow_node_id, member_id, action, at,
        } = m;
        await view.flowNodeMembers.put(id, {
            flow_node_id, member_id, action, at,
        });
    }
    for (const a of delta.attributeEvents) {
        const {
            id, flow_node_id, attribute_id, mode,
            is_required, action, at,
        } = a;
        await view.flowNodeAttributes.put(id, {
            flow_node_id, attribute_id, mode,
            is_required, action, at,
        });
    }
    for (const d of delta.deletions) {
        await view.states.postEvent(
            d.eventId, d.entityId, 'deleted', actor, d.at,
        );
    }
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
        // AI-member creation: the parent member row, the
        // ai_members detail row, and the initial state event
        // commit as ONE transaction — a mid-write failure rolls
        // the whole thing back rather than orphaning a half-built
        // member. Each facet store re-validates its own body as
        // the composing puts land. The parent member type is a
        // server-supplied fact the handler pins; members and
        // ai_members are GLOBAL passthrough stores, so the facet
        // puts go straight to their stores. The initial event is
        // authored by the verified caller (actor), never the
        // body. Admin-only — POST /ai-members has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY.
        post: (db, _p, body, actor) => {
            const b = validateAIMemberCreateBody(body);
            return db.transaction(
                ['members', 'ai_members', 'states'],
                async (view) => {
                    await view.members.put(
                        b.id, { type: 'ai' },
                    );
                    await view.aiMembers.put(
                        b.id,
                        b.detail as unknown as
                            Omit<AIMemberEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.initialStateEventId,
                        b.id,
                        b.initialState,
                        actor,
                        b.initialStateAt,
                    );
                },
            );
        },
    }),
    route('ai-members/:id', {
        get: (db, p) => db.aiMembers.getById(param(p, 0)),
        put: (db, p, body) =>
            db.aiMembers.put(
                param(p, 0),
                withoutId(body) as unknown as
                    Omit<AIMemberEntity, 'id'>,
            ),
        // AI-member edit: the parent member row and the
        // ai_members detail row re-put as ONE transaction — NO
        // state event (an edit does not move the member's
        // lifecycle), so the handler needs no actor. The facet
        // stores re-validate their own bodies. Admin-only,
        // exactly as create — no member-tier POST entry exists.
        post: (db, p, body) => {
            const id = param(p, 0);
            const b = validateAIMemberEditBody(body);
            return db.transaction(
                ['members', 'ai_members'],
                async (view) => {
                    await view.members.put(
                        id, { type: 'ai' },
                    );
                    await view.aiMembers.put(
                        id,
                        b.detail as unknown as
                            Omit<AIMemberEntity, 'id'>,
                    );
                },
            );
        },
    }),
    route('human-members', {
        get: (db) => db.humanMembers.getAll(),
        // Human-member creation: the parent member row, the
        // identity, the PII row, the detail row, and the initial
        // state event commit as ONE transaction — a mid-write
        // failure rolls the whole thing back rather than
        // orphaning a half-built member. Each facet store
        // re-validates its own body as the composing puts land.
        // The parent member type and the identity kind are
        // server-supplied facts the handler pins; PII/identity
        // are GLOBAL passthrough stores, identity_pii is parent-
        // scoped, so the facet puts go straight to their stores.
        // The initial event is authored by the verified caller
        // (actor), never the body. Admin-only — POST /human-
        // members has no member-tier entry, so it falls to the
        // root admin tier in ROUTE_POLICY.
        post: (db, _p, body, actor) => {
            const b = validateHumanMemberCreateBody(body);
            return db.transaction(
                [
                    'members', 'identities', 'identity_pii',
                    'human_members', 'states',
                ],
                async (view) => {
                    await view.members.put(
                        b.id, { type: 'human' },
                    );
                    await view.identities.put(
                        b.id, { kind: 'person' },
                    );
                    await view.identityPii.put(
                        b.id,
                        b.pii as unknown as
                            Omit<IdentityPiiEntity, 'id'>,
                    );
                    await view.humanMembers.put(
                        b.id,
                        b.detail as unknown as
                            Omit<HumanMemberEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.initialStateEventId,
                        b.id,
                        b.initialState,
                        actor,
                        b.initialStateAt,
                    );
                },
            );
        },
    }),
    route('human-members/:id', {
        get: (db, p) => db.humanMembers.getById(param(p, 0)),
        // Human-member edit: the four member facets re-put as ONE
        // transaction — NO state event (an edit does not move the
        // member's lifecycle), so the handler needs no actor. The
        // facet stores re-validate their own bodies. Admin-only,
        // exactly as create — no member-tier POST entry exists.
        post: (db, p, body) => {
            const id = param(p, 0);
            const b = validateHumanMemberEditBody(body);
            return db.transaction(
                [
                    'members', 'identities', 'identity_pii',
                    'human_members',
                ],
                async (view) => {
                    await view.members.put(
                        id, { type: 'human' },
                    );
                    await view.identities.put(
                        id, { kind: 'person' },
                    );
                    await view.identityPii.put(
                        id,
                        b.pii as unknown as
                            Omit<IdentityPiiEntity, 'id'>,
                    );
                    await view.humanMembers.put(
                        id,
                        b.detail as unknown as
                            Omit<HumanMemberEntity, 'id'>,
                    );
                },
            );
        },
    }),
    route('identities', {
        get: (db) => db.identities.getAll(),
        // Identity creation: the identity row and EITHER its PII
        // row (person) OR its client_secret credential row
        // (service) commit as ONE transaction — a mid-write
        // failure rolls the whole thing back rather than orphaning
        // a kindless identity. The identity kind is the server-
        // supplied fact the handler pins; identities/identity_pii/
        // identity_credentials are GLOBAL/parent-scoped stores (no
        // org stamp), so the facet puts go straight to their
        // stores, each re-validating its own body as the composing
        // put lands. The credential's secret is hashed client-side
        // — the route touches no crypto. NO state event (an
        // identity carries no lifecycle event at creation), so the
        // handler needs no actor. The tx table set branches per
        // mode so each names exactly the tables it writes. Admin-
        // only — POST /identities has no member-tier entry, so it
        // falls to the root admin tier in ROUTE_POLICY.
        post: (db, _p, body) => {
            const b = validateIdentityCreateBody(body);
            const tables = b.kind === 'person'
                ? ['identities', 'identity_pii']
                : ['identities', 'identity_credentials'];
            return db.transaction(
                tables,
                async (view) => {
                    await view.identities.put(
                        b.id, { kind: b.kind },
                    );
                    if (b.kind === 'person') {
                        await view.identityPii.put(
                            b.id,
                            b.pii as unknown as
                                Omit<IdentityPiiEntity, 'id'>,
                        );
                    } else {
                        const { id: credId, ...fields } =
                            b.credential as {
                                id: string;
                            } & Record<string, unknown>;
                        await view.identityCredentials.put(
                            credId,
                            fields as unknown as
                                Omit<
                                    IdentityCredentialEntity, 'id'
                                >,
                        );
                    }
                },
            );
        },
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
    // Credentials nest under their parent identity: the identity
    // id is param 0, so the SERVER filters the collection to that
    // identity by its identity_id FK (the org fence still rides
    // the facade re-entry — viaMembership derives visibility from
    // the co-membership ledger). Both the collection and the leaf
    // GET project the opaque `secret` out (withoutSecret) so the
    // hash never crosses the boundary. The leaf id is param 1; GET
    // and PUT are exposed exactly as the flat makeIdRoute carried
    // them. ADMIN-ONLY: /identities is not member-tier, so these
    // fall to the root admin entries — NO MEMBER_VERBS entry.
    route('identities/:id/credentials', {
        get: async (db, p) =>
            (await db.identityCredentials.getAllWhere(
                'identity_id', param(p, 0),
            )).map(withoutSecret),
    }),
    route('identities/:id/credentials/:cid', {
        get: async (db, p) =>
            withoutSecret(
                await db.identityCredentials.getById(
                    param(p, 1),
                ),
            ),
        put: (db, p, body) =>
            db.identityCredentials.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<IdentityCredentialEntity, 'id'>,
            ),
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
    route('identity-providers', {
        get: (db) => db.identityProviders.getAll(),
    }),
    makeIdRoute<IdentityProviderEntity>({
        noun: 'identity-providers',
        store: db => db.identityProviders,
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
        // Idea creation: the idea row and its initial state
        // event commit as ONE transaction — a mid-write failure
        // rolls the whole thing back rather than orphaning the
        // row. The org-scoped store stamps organization_id from
        // the verified token before validating the idea, so the
        // body OMITS it. The initial event is authored by the
        // verified caller (actor), never the body.
        post: (db, _p, body, actor) => {
            const b = validateIdeaCreateBody(body);
            return db.transaction(
                ['ideas', 'states'],
                async (view) => {
                    await view.ideas.put(
                        b.id,
                        b.idea as unknown as
                            Omit<IdeaEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.initialStateEventId,
                        b.id,
                        b.initialState,
                        actor,
                        b.initialStateAt,
                    );
                },
            );
        },
    }),
    // Convert an idea to a project (promotion): the LONE
    // cross-aggregate write. A new projects row, the promoted
    // ideas row, TWO state events (the idea's 'promoted' and the
    // new project's initial), and N project_objective_baseline_
    // scores rows commit as ONE transaction — a mid-write failure
    // rolls the whole thing back rather than landing a project
    // without its baselines (or an idea promoted without its
    // project). The idea is the route param. The org-scoped
    // projects store stamps organization_id from the verified
    // token and re-validates through validateProjectEntity, so
    // the project body OMITS it; the ideas store re-validates the
    // promoted idea, and the baseline store each row, as the
    // composing puts land. Both events are authored by the
    // verified caller (actor), never the body. Composed IN THE
    // SAME ORDER the old commit batch used (project, idea, idea
    // event, project event, baselines). Member-tier POST —
    // isPermitted matches /ideas on the segment prefix, so
    // /ideas/:id/conversion is member-permitted.
    route('ideas/:id/conversion', {
        post: (db, p, body, actor) => {
            const ideaId = param(p, 0);
            const b = validateIdeaConversionBody(body);
            return db.transaction(
                [
                    'projects', 'ideas', 'states',
                    'project_objective_baseline_scores',
                ],
                async (view) => {
                    await view.projects.put(
                        b.projectId,
                        b.project as unknown as
                            Omit<ProjectEntity, 'id'>,
                    );
                    await view.ideas.put(
                        ideaId,
                        b.idea as unknown as
                            Omit<IdeaEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.ideaStateEventId,
                        ideaId,
                        b.ideaState,
                        actor,
                        b.ideaStateAt,
                    );
                    await view.states.postEvent(
                        b.projectStateEventId,
                        b.projectId,
                        b.projectState,
                        actor,
                        b.projectStateAt,
                    );
                    for (const baseline of b.baselines) {
                        await view.projectObjectiveBaselineScores
                            .put(
                                baseline.id,
                                baseline.fields as unknown as
                                    Omit<
                                        ProjectObjectiveBaselineScoreEntity,
                                        'id'
                                    >,
                            );
                    }
                },
            );
        },
    }),
    route('projects', {
        get: (db) => db.projects.getAll(),
    }),
    // Idea submissions nest under their parent idea: the idea id
    // is param 0, so the SERVER filters the collection to that
    // idea (the org fence still rides the facade re-entry). The
    // leaf id is param 1; only PUT is exposed, exactly as the flat
    // makeIdRoute carried it.
    route('ideas/:id/submissions', {
        get: (db, p) =>
            db.ideaSubmissions.getAllWhere('idea_id', param(p, 0)),
    }),
    route('ideas/:id/submissions/:sid', {
        put: (db, p, body) =>
            db.ideaSubmissions.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<IdeaSubmissionEntity, 'id'>,
            ),
    }),
    route('flows', {
        // Reassemble each flow's graph from the four relation
        // tables inside one consistent read transaction —
        // mirroring GET /flows/:id so the list and the single
        // GET derive identically (one reassembly voice). The
        // stored blob is never consulted. PERF: this adds
        // per-flow relation reads to the list path; acceptable
        // at demo scale and unmeasured — do not optimize before
        // measuring (Commandment XI). IndexedDB auto-commit:
        // only row ops are awaited inside the tx body;
        // reassembleStoredGraph + storedGraphField are sync
        // compute called AFTER the awaited reads.
        get: async (db) => {
            return db.transaction(
                [
                    'flows',
                    'flow_nodes',
                    'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'states',
                ],
                async (view) => {
                    const flows =
                        await view.flows.getAll();
                    const result: FlowWithGraph[] = [];
                    for (const flow of flows) {
                        const nodes =
                            await view.flowNodes
                                .getAllWhere(
                                    'flow_id', flow.id,
                                );
                        const edges =
                            await view.flowEdges
                                .getAllWhere(
                                    'flow_id', flow.id,
                                );
                        const members:
                            FlowNodeMemberEntity[] = [];
                        const attrs:
                            FlowNodeAttributeEntity[] = [];
                        for (const node of nodes) {
                            const nm =
                                await view.flowNodeMembers
                                    .getAllWhere(
                                        'flow_node_id',
                                        node.id,
                                    );
                            const na =
                                await view
                                    .flowNodeAttributes
                                    .getAllWhere(
                                        'flow_node_id',
                                        node.id,
                                    );
                            members.push(...nm);
                            attrs.push(...na);
                        }
                        // SYNC compute — no await past here.
                        const graph =
                            reassembleStoredGraph(
                                nodes, edges,
                                members, attrs,
                            );
                        result.push({
                            ...flow,
                            graph: storedGraphField(graph),
                        });
                    }
                    return result;
                },
            );
        },
        // Flow creation: the flows row, its project_flows join
        // row, the initial 'active' state event, and the four
        // relation table rows from graphDelta commit as ONE
        // transaction — a mid-write failure rolls the whole
        // thing back rather than orphaning a half-built flow.
        // The org-scoped flows store stamps organization_id from
        // the verified token and re-validates through
        // validateFlowEntity, so the flow body OMITS it; the
        // join row is re-validated by the project_flows store.
        // The initial event is authored by the verified caller
        // (actor), never the body. graphDelta is pre-validated
        // at the HTTP gate (validateFlowCreateBody); the route
        // writes its rows through writeFlowGraphDelta — the same
        // helper PUT/undo/redo use. The create delta carries no
        // deletions (a fresh flow tombstones nothing).
        // Member-tier POST — /flows carries POST in MEMBER_VERBS.
        post: (db, _p, body, actor) => {
            const b = validateFlowCreateBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'project_flows', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                ],
                async (view) => {
                    await view.flows.put(
                        b.id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.projectFlows.put(
                        b.projectFlowId,
                        b.projectFlow as unknown as
                            Omit<ProjectFlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.initialStateEventId,
                        b.id,
                        b.initialState,
                        actor,
                        b.initialStateAt,
                    );
                    // The delta's deletions are empty on create
                    // (a fresh flow tombstones nothing), so the
                    // helper writes only the seeding upserts and
                    // member/attribute events.
                    await writeFlowGraphDelta(
                        view, delta, actor,
                    );
                },
            );
        },
    }),
    // Write a flow: an OPTIONAL version snapshot (the new
    // flow_versions row PUT plus the named over-cap trim
    // DELETEs), THEN the flow row PUT, THEN the 'updated' state
    // event, THEN the graph delta to the four relation tables —
    // all as ONE transaction. A mid-write failure rolls the
    // whole thing back. Covers both the plain write (none — no
    // flow_versions touch) and the versioned write. The
    // org-scoped flows store stamps organization_id from the
    // verified token and re-validates through validateFlowEntity,
    // so the flow body OMITS it; flow_versions is parent-scoped
    // and re-validates the snapshot through
    // validateFlowVersionEntity. The event is authored by the
    // verified caller (actor), never the body. The eventId and
    // at are client-minted: a byte-identical replay lands as a
    // ledger no-op via postEvent. graphDelta is pre-validated at
    // the HTTP gate (validateFlowPutBody); the route writes its
    // upsert rows, append-only member/attribute events, and the
    // node/edge deletion events (authored by actor, never the
    // body). The flow row carries no graph blob — the relations
    // are the sole graph truth, reassembled on read.
    // Member-tier PUT — MEMBER_VERBS['/flows'] includes 'PUT'.
    route('flows/:id', {
        // Reassemble the graph from the four relation tables
        // inside a consistent read transaction — the stored
        // blob is overridden by the live relation-derived graph
        // so freeze, work-order creation, stats, hazard, export,
        // and mermaid all derive from relations for free.
        // IndexedDB auto-commit: only row ops are awaited inside
        // the tx body; reassembleStoredGraph + storedGraphField
        // are sync compute called AFTER the awaited reads.
        get: async (db, p) => {
            const id = param(p, 0);
            return db.transaction(
                [
                    'flows',
                    'flow_nodes',
                    'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'states',
                ],
                async (view) => {
                    const flow =
                        await view.flows.getById(id);
                    const nodes =
                        await view.flowNodes
                            .getAllWhere('flow_id', id);
                    const edges =
                        await view.flowEdges
                            .getAllWhere('flow_id', id);
                    const members:
                        FlowNodeMemberEntity[] = [];
                    const attrs:
                        FlowNodeAttributeEntity[] = [];
                    for (const node of nodes) {
                        const nm =
                            await view.flowNodeMembers
                                .getAllWhere(
                                    'flow_node_id',
                                    node.id,
                                );
                        const na =
                            await view.flowNodeAttributes
                                .getAllWhere(
                                    'flow_node_id',
                                    node.id,
                                );
                        members.push(...nm);
                        attrs.push(...na);
                    }
                    // SYNC compute — no await past this point.
                    // Reassemble unconditionally: the relation
                    // tables are the read source of record. The
                    // stored blob is never consulted here.
                    const graph = reassembleStoredGraph(
                        nodes, edges, members, attrs,
                    );
                    return {
                        ...flow,
                        graph: storedGraphField(graph),
                    };
                },
            );
        },
        put: (db, p, body, actor) => {
            const id = param(p, 0);
            const b = validateFlowPutBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                ],
                async (view) => {
                    if (b.history.kind === 'snapshot') {
                        const snap = b.history.version;
                        await view.flowVersions.put(
                            snap.id,
                            snap.version as unknown as
                                Omit<FlowVersionEntity, 'id'>,
                        );
                        for (const t of snap.trimIds) {
                            await view.flowVersions.delete(t);
                        }
                    }
                    await view.flows.put(
                        id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.eventId, id, 'updated', actor,
                        b.at,
                    );
                    await writeFlowGraphDelta(
                        view, delta, actor,
                    );
                },
            );
        },
    }),
    // Undo a flow edit: the flow row PUT, the 'updated' state
    // event, the DELETE of the consumed version, the graph delta
    // to the four relation tables, and the revivals — all as ONE
    // transaction. The flow can never land reverted while the
    // version row survives unconsumed. The org-scoped flows store
    // stamps organization_id and re-validates the flow body (so
    // it OMITS it); the event is authored by the verified caller
    // (actor). graphDelta lands the target graph in relations
    // exactly as PUT /flows/:id does; the revivals THEN post
    // 'restored' events (authored by actor) that supersede the
    // tombstones of the nodes/edges the target re-introduces, so
    // a node the user deleted reappears in reads on undo.
    // Member-tier POST via the /flows segment prefix.
    route('flows/:id/undo', {
        post: (db, p, body, actor) => {
            const id = param(p, 0);
            const b = validateFlowUndoBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                ],
                async (view) => {
                    await view.flows.put(
                        id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.eventId, id, 'updated', actor,
                        b.at,
                    );
                    await view.flowVersions.delete(
                        b.consumedVersionId,
                    );
                    await writeFlowGraphDelta(
                        view, delta, actor,
                    );
                    for (const r of b.revivals) {
                        await view.states.postEvent(
                            r.eventId, r.entityId,
                            'restored', actor, r.at,
                        );
                    }
                },
            );
        },
    }),
    // Redo a flow edit: a REQUIRED version snapshot (the new
    // flow_versions row PUT plus the named over-cap trim
    // DELETEs), THEN the flow row PUT, THEN the 'updated' state
    // event, THEN the graph delta to the four relation tables,
    // THEN the revivals — all as ONE transaction. The current
    // state can never land archived as a version while the redo
    // graph is lost. The org-scoped flows store stamps
    // organization_id and re-validates the flow body (so it OMITS
    // it); flow_versions re-validates the snapshot; the event is
    // authored by the verified caller (actor). graphDelta lands
    // the redo target graph in relations; the revivals THEN post
    // 'restored' events that supersede the tombstones of the
    // nodes/edges the redo target re-introduces. Member-tier POST
    // via the /flows segment prefix.
    route('flows/:id/redo', {
        post: (db, p, body, actor) => {
            const id = param(p, 0);
            const b = validateFlowRedoBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                ],
                async (view) => {
                    await view.flowVersions.put(
                        b.version.id,
                        b.version.version as unknown as
                            Omit<FlowVersionEntity, 'id'>,
                    );
                    for (const t of b.version.trimIds) {
                        await view.flowVersions.delete(t);
                    }
                    await view.flows.put(
                        id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.eventId, id, 'updated', actor,
                        b.at,
                    );
                    await writeFlowGraphDelta(
                        view, delta, actor,
                    );
                    for (const r of b.revivals) {
                        await view.states.postEvent(
                            r.eventId, r.entityId,
                            'restored', actor, r.at,
                        );
                    }
                },
            );
        },
    }),
    // Flow versions nest under their parent flow: the flow id is
    // param 0, so the SERVER filters the collection to that flow
    // (the org fence still rides the facade re-entry). The leaf
    // id is param 1.
    route('flows/:id/versions', {
        get: (db, p) =>
            db.flowVersions.getAllWhere('flow_id', param(p, 0)),
        // Publish a flow version: the new snapshot row is put and
        // the named over-cap versions are deleted as ONE
        // transaction — a mid-write failure rolls the whole thing
        // back rather than landing the snapshot with the trim
        // half-applied (or vice versa). The web-app computes WHICH
        // versions to trim (its own cap-retention derivation), so
        // the route writes the put + the named deletes exactly.
        // flow_versions is parent-scoped — its org derives from the
        // flow at read time and writes delegate — and re-validates
        // the snapshot through validateFlowVersionEntity as the put
        // lands. NO state event is written, so the handler needs no
        // actor. The body already carries flow_id; the flow id is
        // param 0. Member-tier POST — /flows/:id/versions carries
        // POST in MEMBER_VERBS.
        post: (db, _p, body) => {
            const b = validateFlowVersionPublishBody(body);
            return db.transaction(
                ['flow_versions'],
                async (view) => {
                    await view.flowVersions.put(
                        b.id,
                        b.version as unknown as
                            Omit<FlowVersionEntity, 'id'>,
                    );
                    for (const t of b.trimIds) {
                        await view.flowVersions.delete(t);
                    }
                },
            );
        },
    }),
    route('flows/:id/versions/:vid', {
        get: (db, p) => db.flowVersions.getById(param(p, 1)),
        put: (db, p, body) =>
            db.flowVersions.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<FlowVersionEntity, 'id'>,
            ),
        delete: (db, p) => db.flowVersions.delete(param(p, 1)),
    }),
    // Project↔flow joins nest under their parent project: the
    // project id is param 0, so the SERVER filters the collection
    // to that project (the org fence still rides the facade
    // re-entry). The leaf id is param 1; PUT and DELETE are
    // exposed exactly as the flat makeIdRoute carried them.
    route('projects/:id/flows', {
        get: (db, p) =>
            db.projectFlows.getAllWhere(
                'project_id', param(p, 0),
            ),
    }),
    route('projects/:id/flows/:pfid', {
        put: (db, p, body) =>
            db.projectFlows.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<ProjectFlowEntity, 'id'>,
            ),
        delete: (db, p) => db.projectFlows.delete(param(p, 1)),
    }),
    route('work-orders', {
        get: (db) =>
            db.workOrders.getAll(),
        // Work-order creation: the work_orders row, its
        // flow_work_orders join row, and THREE initial state
        // events (the start transition, the post-start
        // transition, and the creation-time 'claimed') commit as
        // ONE transaction — a mid-write failure rolls the whole
        // thing back rather than orphaning a half-built work
        // order. The org-scoped work_orders store stamps
        // organization_id from the verified token and re-validates
        // through validateWorkOrderEntity, so the work-order body
        // OMITS it; the join row derives org from its flow and is
        // re-validated by the flow_work_orders store. The three
        // events are applied IN ORDER and authored by the verified
        // caller (actor), never the body. Member-tier POST —
        // /work-orders carries POST in MEMBER_VERBS (the claim
        // sub-route is also a member POST).
        post: (db, _p, body, actor) => {
            const b = validateWorkOrderCreateBody(body);
            return db.transaction(
                ['work_orders', 'flow_work_orders', 'states'],
                async (view) => {
                    await view.workOrders.put(
                        b.id,
                        b.workOrder as unknown as
                            Omit<WorkOrderEntity, 'id'>,
                    );
                    await view.flowWorkOrders.put(
                        b.flowWorkOrderId,
                        b.flowWorkOrder as unknown as
                            Omit<FlowWorkOrderEntity, 'id'>,
                    );
                    for (let i = 0; i < 3; i++) {
                        await view.states.postEvent(
                            b.stateEventIds[i]!,
                            b.id,
                            b.states[i]!,
                            actor,
                            b.stateEventAts[i]!,
                        );
                    }
                },
            );
        },
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
        post: (db, p, body, actor) =>
            db.transaction(
                ['work_orders', 'states'],
                async (view) => {
                    const b =
                        validateWorkOrderClaimBody(body);
                    const workOrderId = param(p, 0);
                    const wo = await view.workOrders
                        .getById(workOrderId);
                    const graph =
                        validateWorkOrderFlowGraphJson(
                            wo.flow_graph,
                            'work_orders.flow_graph',
                        );
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
                        if (prior.member_id === actor) {
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
                            b.expireEventId, workOrderId,
                            'claim_expired',
                            prior.member_id, b.expireAt,
                        );
                    }
                    await view.states.postEvent(
                        b.claimEventId, workOrderId,
                        'claimed', actor, b.claimAt,
                    );
                },
            ),
    }),
    // Transition a work order along an edge. The web-app
    // computes WHAT to write — the target node, the field-value
    // rows, and whether a live claim must be implicitly released
    // — exactly as POST /work-orders keeps its graph derivation
    // client-side. This route writes them ATOMICALLY: the
    // transition state event (entity_id = the work order, state =
    // the target node), then each state_field_values row (the
    // field inputs, re-validated by the store as they land), then
    // the OPTIONAL 'claim_released' event. A mid-write failure
    // rolls the whole thing back. Authorship of the transition
    // event AND the release event is stamped from the verified
    // caller (actor) — the same author the old commit batch
    // produced, where both events flowed through PUT /states/:id.
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS, and isPermitted matches on the segment
    // prefix, so the sub-route is member-permitted like /claim.
    route('work-orders/:id/transition', {
        post: (db, p, body, actor) => {
            const workOrderId = param(p, 0);
            const b = validateWorkOrderTransitionBody(body);
            return db.transaction(
                ['states', 'state_field_values'],
                async (view) => {
                    await view.states.postEvent(
                        b.transitionEventId,
                        workOrderId,
                        b.targetState,
                        actor,
                        b.transitionAt,
                    );
                    for (const row of b.fieldValues) {
                        await view.stateFieldValues.put(
                            row.id,
                            row.fields as unknown as
                                Omit<StateFieldValueEntity, 'id'>,
                        );
                    }
                    if (b.release !== null) {
                        await view.states.postEvent(
                            b.release.id,
                            workOrderId,
                            b.release.state,
                            actor,
                            b.release.at,
                        );
                    }
                },
            );
        },
    }),
    // Flow work-order joins nest under their parent flow: the
    // flow id is param 0, so the SERVER filters the collection to
    // that flow. The leaf id is param 1; only PUT is exposed (the
    // flat route never carried GET/DELETE on the leaf).
    route('flows/:id/work-orders', {
        get: (db, p) =>
            db.flowWorkOrders.getAllWhere('flow_id', param(p, 0)),
    }),
    route('flows/:id/work-orders/:woid', {
        put: (db, p, body) =>
            db.flowWorkOrders.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<FlowWorkOrderEntity, 'id'>,
            ),
    }),
    // Field values nest under their parent STATE EVENT: the
    // state event id is param 0, so the SERVER filters the
    // collection to that event by its state_event_id FK (the org
    // fence still rides the facade re-entry — the multi-hop
    // resolver derives the owning org from the event's entity).
    // The leaf id is param 1; PUT and DELETE are exposed exactly
    // as the flat makeIdRoute carried them.
    route('states/:id/field-values', {
        get: (db, p) =>
            db.stateFieldValues.getAllWhere(
                'state_event_id', param(p, 0),
            ),
    }),
    route('states/:id/field-values/:fvid', {
        put: (db, p, body) =>
            db.stateFieldValues.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<StateFieldValueEntity, 'id'>,
            ),
        delete: (db, p) =>
            db.stateFieldValues.delete(param(p, 1)),
    }),
    route('records', {
        get: (db) => db.records.getAll(),
        post: (db, _p, body, actor) =>
            applyRecordWrite(db, body, actor),
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
                (view) =>
                    deleteRecordAttributeSafe(view, id),
            );
        },
    }),
    // Flow↔record bindings nest under their parent flow: the flow
    // id is param 0, so the SERVER filters the collection to that
    // flow. The leaf id is param 1.
    route('flows/:id/records', {
        get: (db, p) =>
            db.flowRecords.getAllWhere('flow_id', param(p, 0)),
    }),
    route('flows/:id/records/:frid', {
        get: (db, p) => db.flowRecords.getById(param(p, 1)),
        put: (db, p, body) =>
            db.flowRecords.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<FlowRecordEntity, 'id'>,
            ),
        delete: (db, p) => db.flowRecords.delete(param(p, 1)),
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
        get: (db, _p, actor) =>
            db.members.getById(actor),
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
    route('objectives', {
        get: (db) => db.objectives.getAll(),
        // Objective creation: the objective row and its FIRST
        // revision commit as ONE transaction — a mid-write
        // failure rolls the whole thing back rather than
        // orphaning a definitionless objective. The org-scoped
        // store stamps organization_id from the verified token
        // before validating the objective, so the body OMITS
        // it. No state event is written (a fresh objective reads
        // as active until a later archival event), so the
        // handler needs no actor.
        post: (db, _p, body) => {
            const b = validateObjectiveCreateBody(body);
            return db.transaction(
                ['objectives', 'objective_revisions'],
                async (view) => {
                    await view.objectives.put(
                        b.id,
                        b.objective as unknown as
                            Omit<ObjectiveEntity, 'id'>,
                    );
                    await view.objectiveRevisions.put(
                        b.revisionId,
                        b.revision as unknown as
                            Omit<ObjectiveRevisionEntity, 'id'>,
                    );
                },
            );
        },
    }),
    makeIdRoute<ObjectiveEntity>({
        noun: 'objectives',
        store: db => db.objectives,
        verbs: ['get', 'put'],
    }),
    // Objective revisions nest under their parent objective: the
    // objective id is param 0, so the SERVER filters the
    // collection to that objective (the org fence still rides the
    // facade re-entry). The leaf id is param 1; only PUT is
    // exposed, exactly as the flat makeIdRoute carried it.
    route('objectives/:id/revisions', {
        get: (db, p) =>
            db.objectiveRevisions.getAllWhere(
                'objective_id', param(p, 0),
            ),
    }),
    route('objectives/:id/revisions/:rid', {
        put: (db, p, body) =>
            db.objectiveRevisions.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<ObjectiveRevisionEntity, 'id'>,
            ),
    }),
    // Objective baseline scores nest under their parent project:
    // the project id is param 0, so the SERVER filters the
    // collection to that project (the org fence still rides the
    // facade re-entry). The leaf id is param 1; only PUT is
    // exposed, exactly as the flat makeIdRoute carried it.
    route('projects/:id/objective-baseline-scores', {
        get: (db, p) =>
            db.projectObjectiveBaselineScores.getAllWhere(
                'project_id', param(p, 0),
            ),
    }),
    route('projects/:id/objective-baseline-scores/:sid', {
        put: (db, p, body) =>
            db.projectObjectiveBaselineScores.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<ProjectObjectiveBaselineScoreEntity, 'id'>,
            ),
    }),
    // Objective actual scores nest under their parent project,
    // identically: project id is param 0 (server filter), leaf id
    // is param 1, PUT only.
    route('projects/:id/objective-actual-scores', {
        get: (db, p) =>
            db.projectObjectiveActualScores.getAllWhere(
                'project_id', param(p, 0),
            ),
    }),
    route('projects/:id/objective-actual-scores/:sid', {
        put: (db, p, body) =>
            db.projectObjectiveActualScores.put(
                param(p, 1),
                withoutId(body) as unknown as
                    Omit<ProjectObjectiveActualScoreEntity, 'id'>,
            ),
    }),
    route('states', {
        get: (db) => db.states.getAll(),
    }),
    route('states/:id', {
        get: (db, p) =>
            db.states.getById(param(p, 0)),
        // The author is the verified caller (actor), stamped
        // over any client-supplied member_id — the ledger
        // records who acted, not who the body claims.
        put: (db, p, body, actor) =>
            db.states.put(
                param(p, 0),
                {
                    ...validateStateBody(
                        withoutId(body),
                    ),
                    member_id: actor,
                },
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
