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
    validateAIMemberEntity,
    validateHumanMemberCreateBody,
    validateHumanMemberEditBody,
    validateFlowCreateBody,
    validateFlowEntity,
    validateFlowVersionPublishBody,
    validateFlowWorkOrderEntity,
    validateFlowPutBody,
    validateFlowUndoBody,
    validateFlowRedoBody,
    validateIdeaCreateBody,
    validateIdeaConversionBody,
    validateIdeaEntity,
    validateIdeaSubmissionEntity,
    validateIdentityCreateBody,
    validateIdentityEntity,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateIdentityProviderEntity,
    validateIdentityTokenEntity,
    validateIdentityTokenRevocationEntity,
    validateMembershipEntity,
    validateObjectiveCreateBody,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateOrganizationEntity,
    validateProjectEntity,
    validateProjectFlowEntity,
    validateFlowRecordEntity,
    validateRecordAttributeEntity,
    validateRecordEntity,
    validateRecordWriteBody,
    validateRoleGrantEntity,
    validateStateBody,
    validateStateFieldValueEntity,
    validateWorkOrderClaimBody,
    validateWorkOrderCreateBody,
    validateWorkOrderEntity,
    validateWorkOrderTransitionBody,
    validateWorkOrderFlowGraphJson,
} from './validators.ts';
import {
    appendMessagePair,
    pairResponseBody,
} from './message-pair.ts';
import type { MessagePair } from './message-pair.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
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

// PutHandler, PostHandler, and DeleteHandler carry a trailing
// pair: it is undefined for bearer-exempt and not-yet-wired
// writes (TypeScript cannot prove bearerExempt was false inside
// the gate's one shared dispatch switch), and defined for a
// route named in message-pair.ts's PAIR_WIRED_ROUTE_PATTERNS.
// A wired handler's LAST in-tx act is appending it (absence
// there is a wiring bug — crash loud); an unwired handler
// ignores the extra argument (TypeScript permits a closure
// with fewer declared parameters than its assigned type).
type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    pair: MessagePair | undefined,
) => Promise<void>;

type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
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

// Record creation or edit, discriminated by payload.kind.
// Exported so the seed can drive record creation through
// the same gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write insertion
// seam. `pair` is optional so the seed's below-facade call
// (api/mock-data.ts, no gate, no pair) keeps compiling
// unchanged; the route always supplies one, since 'records'
// is pair-wired and never bearer-exempt.
export async function postRecordWriteOp(
    db: DbAdapter,
    payload: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
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
            'requests', 'responses',
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
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

// Idea creation: the idea row and its initial state event
// commit as ONE transaction — a mid-write failure rolls the
// whole thing back rather than orphaning the row. Exported so
// the seed can drive idea creation through the same gate the
// route uses (Decision 6's below-facade carve-out) — this is
// also Phase 1's dual-write insertion seam. `pair` is optional
// (not `MessagePair | undefined` positionally required) so the
// seed's below-facade call (api/mock-data.ts, no gate, no
// pair) keeps compiling unchanged; the route always supplies
// one, since 'ideas' is pair-wired and never bearer-exempt.
export async function postIdeaCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateIdeaCreateBody(body);
    return db.transaction(
        ['ideas', 'states', 'requests', 'responses'],
        async (view) => {
            await view.ideas.put(
                b.id,
                b.idea as unknown as Omit<IdeaEntity, 'id'>,
            );
            await view.states.postEvent(
                b.initialStateEventId,
                b.id,
                b.initialState,
                actor,
                b.initialStateAt,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

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
// deletions (a fresh flow tombstones nothing). Exported
// so the seed can drive flow creation through the same
// gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write
// insertion seam. `pair` is optional so the seed's below-
// facade call (api/mock-data.ts, no gate, no pair) keeps
// compiling unchanged; the route always supplies one,
// since 'flows' is pair-wired and never bearer-exempt.
export async function postFlowCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateFlowCreateBody(body);
    const delta = b.graphDelta;
    return db.transaction(
        [
            'flows', 'project_flows', 'states',
            'flow_nodes', 'flow_edges',
            'flow_node_members',
            'flow_node_attributes',
            'requests', 'responses',
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Objective creation: the objective row and its FIRST
// revision commit as ONE transaction — a mid-write
// failure rolls the whole thing back rather than
// orphaning a definitionless objective. The org-scoped
// store stamps organization_id from the verified token
// before validating the objective, so the body OMITS
// it. No state event is written (a fresh objective reads
// as active until a later archival event), so the
// handler needs no actor. Exported so the seed can drive
// objective creation through the same gate the route
// uses (Decision 6's below-facade carve-out) — this is
// also Phase 1's dual-write insertion seam. `pair` is
// optional so the seed's below-facade calls (api/mock-
// data.ts, no gate, no pair) keep compiling unchanged;
// the route always supplies one, since 'objectives' is
// pair-wired and never bearer-exempt.
export async function postObjectiveCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pair?: MessagePair,
): Promise<void> {
    const b = validateObjectiveCreateBody(body);
    return db.transaction(
        [
            'objectives', 'objective_revisions',
            'requests', 'responses',
        ],
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

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
// body. Exported so the seed can drive AI-member creation
// through the same gate the route uses (Decision 6's
// below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pair` is optional so the
// seed's below-facade calls (api/mock-data.ts, no gate,
// no pair) keep compiling unchanged; the route always
// supplies one, since 'ai-members' is pair-wired and
// never bearer-exempt.
export async function postAiMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateAIMemberCreateBody(body);
    return db.transaction(
        [
            'members', 'ai_members', 'states',
            'requests', 'responses',
        ],
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

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
// (actor), never the body. Exported so the seed can drive
// human-member creation through the same gate the route
// uses (Decision 6's below-facade carve-out) — this is
// also Phase 1's dual-write insertion seam. `pair` is
// optional so the seed's below-facade calls (api/mock-
// data.ts, no gate, no pair) keep compiling unchanged;
// the route always supplies one, since 'human-members' is
// pair-wired and never bearer-exempt.
export async function postHumanMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateHumanMemberCreateBody(body);
    return db.transaction(
        [
            'members', 'identities', 'identity_pii',
            'human_members', 'states',
            'requests', 'responses',
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

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
// mode so each names exactly the tables it writes.
// Exported so the seed can drive identity creation through
// the same gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write insertion
// seam. `pair` is optional so the seed's below-facade calls
// (api/mock-data.ts, no gate, no pair) keep compiling
// unchanged; the route always supplies one, since
// 'identities' is pair-wired and never bearer-exempt.
export async function postIdentityCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pair?: MessagePair,
): Promise<void> {
    const b = validateIdentityCreateBody(body);
    const tables = b.kind === 'person'
        ? ['identities', 'identity_pii', 'requests', 'responses']
        : [
            'identities', 'identity_credentials',
            'requests', 'responses',
        ];
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

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
// caller (actor), never the body. Exported so the seed can
// drive work-order creation through the same gate the
// route uses (Decision 6's below-facade carve-out) — this
// is also Phase 1's dual-write insertion seam. `pair` is
// optional so the seed's below-facade call (api/mock-data.ts,
// no gate, no pair) keeps compiling unchanged; the route
// always supplies one, since 'work-orders' is pair-wired and
// never bearer-exempt.
export async function postWorkOrderCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateWorkOrderCreateBody(body);
    return db.transaction(
        [
            'work_orders', 'flow_work_orders', 'states',
            'requests', 'responses',
        ],
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Claim a work order. The read of the prior claim and
// the append of the new claim events ride ONE
// transaction, so two concurrent claims cannot both
// observe "no live claim" (the duplicate-claim TOCTOU).
// A live claim by another member is a 409; by the
// caller, an idempotent no-op. A claim aged past the
// flow's lockTimeout is superseded: 'claim_expired'
// (naming the prior claimant) and the new 'claimed'
// land atomically. Exported so the seed can drive a
// work-order claim through the same gate the route uses
// — this is also Phase 1's dual-write insertion seam. `pair`
// is optional, mirroring postWorkOrderCreationOp; it is
// appended on EVERY exit path (the idempotent re-claim
// no-op included), since a wired route must never resolve a
// pair the transaction never stored (the gate crashes loud
// on that mismatch).
export async function postWorkOrderClaimOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        ['work_orders', 'states', 'requests', 'responses'],
        async (view) => {
            const b =
                validateWorkOrderClaimBody(body);
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
                    if (pair !== undefined) {
                        await appendMessagePair(
                            view, pair,
                        );
                    }
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Transition a work order along an edge. The web-app
// computes WHAT to write — the target node, the field-value
// rows, and whether a live claim must be implicitly released
// — exactly as POST /work-orders keeps its graph derivation
// client-side. This op writes them ATOMICALLY: the
// transition state event (entity_id = the work order, state =
// the target node), then each state_field_values row (the
// field inputs, re-validated by the store as they land), then
// the OPTIONAL 'claim_released' event. A mid-write failure
// rolls the whole thing back. Authorship of the transition
// event AND the release event is stamped from the verified
// caller (actor) — the same author the old commit batch
// produced, where both events flowed through PUT /states/:id.
// Exported so the seed can drive a work-order transition
// through the same gate the route uses — this is also
// Phase 1's dual-write insertion seam. `pair` is optional,
// mirroring postWorkOrderCreationOp.
export async function postWorkOrderTransitionOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateWorkOrderTransitionBody(body);
    return db.transaction(
        [
            'states', 'state_field_values',
            'requests', 'responses',
        ],
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
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// The pre-tx response body for each pair-wired write —
// computed through the SAME validator/stamp its own handler
// applies, so the gate's precomputed body is byte-identical to
// what the transaction actually writes (pinned by
// tests/api-shadow-ledger-ideas.test.ts: each 200 route's wire
// body deep-equals a direct domain read taken afterward). A
// pattern absent here, or present with no successBody, returns
// 204 with no body. Keyed by route pattern, not verb — but
// ONLY for the pattern's PUT or POST verb: a DELETE on a wired
// pattern never consults this map (the gate hardcodes 204 for
// every DELETE — see api/api.ts), so a pattern that carries
// both a PUT (200, its written row) and a DELETE (204) needs
// exactly one entry here, describing the PUT alone.
export interface WriteResponseSpec {
    readonly status: number;
    readonly successBody?: (
        params: string[],
        body: Record<string, unknown> | undefined,
        actor: Id,
        organization: Id | undefined,
    ) => unknown;
}

// Almost every wired pattern exposes exactly one non-DELETE
// verb, so a single WriteResponseSpec fully describes its
// success shape. 'ai-members/:id' is the first pattern to wire
// BOTH a PUT (the bare ai_members facet put, 200 + written row)
// and a POST (the composed members + ai_members edit, 204, no
// body) — their response shapes genuinely diverge, so that one
// entry supplies a spec per verb instead. Distinguished from a
// plain WriteResponseSpec by the absence of `status` at the top
// level (see isPerVerbWriteResponseSpec in api.ts).
export interface PerVerbWriteResponseSpec {
    readonly put?: WriteResponseSpec;
    readonly post?: WriteResponseSpec;
}

export const WRITE_RESPONSE_SPECS:
    Readonly<
        Record<string, WriteResponseSpec | PerVerbWriteResponseSpec>
    > = {
    'ideas': { status: 204 },
    'ideas/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateIdeaEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'ideas/:id/conversion': { status: 204 },
    'ideas/:id/submissions/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdeaSubmissionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'states/:id': {
        status: 200,
        successBody: (params, body, actor) => ({
            id: param(params, 0),
            ...validateStateBody(withoutId(body ?? {})),
            member_id: actor,
        }),
    },
    'projects/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateProjectEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'projects/:id/flows/:pfid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateProjectFlowEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'flows': { status: 204 },
    // The raw PUT body wraps the flow's own scalar fields
    // under `.flow` (FlowPutBody) — unlike ideas/:id, whose
    // body IS the flat entity — so the reconstruction reads
    // body.flow, not body itself.
    'flows/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateFlowEntity({
                ...(body?.['flow'] as
                    Record<string, unknown> ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'flows/:id/undo': { status: 204 },
    'flows/:id/redo': { status: 204 },
    'flows/:id/versions': { status: 204 },
    'work-orders': { status: 204 },
    'work-orders/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateWorkOrderEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'work-orders/:id/claim': { status: 204 },
    'work-orders/:id/transition': { status: 204 },
    'flows/:id/work-orders/:woid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowWorkOrderEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'records': { status: 204 },
    'records/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateRecordEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'record-attributes/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateRecordAttributeEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'flows/:id/records/:frid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowRecordEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'objectives': { status: 204 },
    'objectives/:id/revisions/:rid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateObjectiveRevisionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-baseline-scores/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateBaselineScoreEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-actual-scores/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateActualScoreEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'ai-members': { status: 204 },
    // Per-verb: PUT is the bare facet put (200 + written row);
    // POST is the composed edit (204, no body).
    'ai-members/:id': {
        put: {
            status: 200,
            successBody: (params, body) => ({
                id: param(params, 0),
                ...validateAIMemberEntity(
                    withoutId(body ?? {}),
                ),
            }),
        },
        post: { status: 204 },
    },
    'human-members': { status: 204 },
    'human-members/:id': { status: 204 },
    'identities': { status: 204 },
    'identities/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityEntity(withoutId(body ?? {})),
        }),
    },
    'identities/:id/pii': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityPiiEntity(withoutId(body ?? {})),
        }),
    },
    // The written row's `secret` rides the wire here — a
    // deliberate zero-change carry-over (see the route comment
    // above 'identities/:id/credentials/:cid' in the routes
    // array).
    'identities/:id/credentials/:cid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdentityCredentialEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'memberships/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateMembershipEntity(withoutId(body ?? {})),
        }),
    },
    'identity-tokens/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityTokenEntity(withoutId(body ?? {})),
        }),
    },
    'identity-token-revocations/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityTokenRevocationEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The gate PRE-MINTS the successor jti here — the ONE
    // mint site for a fresh write (this route is REPLAY_
    // EXEMPT_ROUTE_PATTERNS-wired, so a resend never bypasses
    // this resolver the way a document/event-append route's
    // idempotent replay would). The route handler reads this
    // exact value back off the formed pair (pairResponseBody)
    // rather than minting a second one.
    'identity-tokens/:jti/rotation': {
        status: 200,
        successBody: () => ({
            jti: generateCryptoSafeBase62(),
        }),
    },
    'identity-tokens/:jti/revocation': { status: 204 },
    'organizations/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateOrganizationEntity(withoutId(body ?? {})),
        }),
    },
    // role_grants rides the ORG-SCOPED store (unlike its GLOBAL-
    // plane siblings above), which auto-stamps organization_id
    // from the verified token — the wire body omits it (see
    // web-app/app/adapters/role-grants.ts). The gate has no
    // access to that scoped store, so it re-derives the same
    // stamp here, mirroring 'projects/:id' et al.
    'role-grants/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateRoleGrantEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'identity-providers/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityProviderEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'states/:id/field-values/:fvid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateStateFieldValueEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
};

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
        // Admin-only — POST /ai-members has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. See postAiMemberCreationOp for the
        // transaction shape.
        post: (db, _p, body, actor, pair) =>
            postAiMemberCreationOp(db, body, actor, pair),
    }),
    // Hand-written PUT (in place of a bare store put) and POST
    // so each can append its message pair in the same
    // transaction as its write — the pattern carries BOTH a
    // wired PUT (the bare ai_members facet put) and a wired
    // POST (the composed members + ai_members edit), the first
    // pattern in this codebase to need a PER-VERB
    // WriteResponseSpec entry (see message-pair.ts /
    // WRITE_RESPONSE_SPECS). GET reproduces the prior closure
    // byte-equivalently.
    route('ai-members/:id', {
        get: (db, p) => db.aiMembers.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['ai_members', 'requests', 'responses'],
                async (view) => {
                    const written = await view.aiMembers.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<AIMemberEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        // AI-member edit: the parent member row and the
        // ai_members detail row re-put as ONE transaction — NO
        // state event (an edit does not move the member's
        // lifecycle), so the handler needs no actor. The facet
        // stores re-validate their own bodies. Admin-only,
        // exactly as create — no member-tier POST entry exists.
        post: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            const b = validateAIMemberEditBody(body);
            return db.transaction(
                [
                    'members', 'ai_members',
                    'requests', 'responses',
                ],
                async (view) => {
                    await view.members.put(
                        id, { type: 'ai' },
                    );
                    await view.aiMembers.put(
                        id,
                        b.detail as unknown as
                            Omit<AIMemberEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    route('human-members', {
        get: (db) => db.humanMembers.getAll(),
        // Admin-only — POST /human-members has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. See postHumanMemberCreationOp for the
        // transaction shape.
        post: (db, _p, body, actor, pair) =>
            postHumanMemberCreationOp(db, body, actor, pair),
    }),
    route('human-members/:id', {
        get: (db, p) => db.humanMembers.getById(param(p, 0)),
        // Human-member edit: the four member facets re-put as ONE
        // transaction — NO state event (an edit does not move the
        // member's lifecycle), so the handler needs no actor. The
        // facet stores re-validate their own bodies. Admin-only,
        // exactly as create — no member-tier POST entry exists.
        post: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            const b = validateHumanMemberEditBody(body);
            return db.transaction(
                [
                    'members', 'identities', 'identity_pii',
                    'human_members',
                    'requests', 'responses',
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
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    route('identities', {
        get: (db) => db.identities.getAll(),
        // Admin-only — POST /identities has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. See postIdentityCreationOp for the
        // transaction shape.
        post: (db, _p, body, _actor, pair) =>
            postIdentityCreationOp(db, body, pair),
    }),
    // Hand-written in place of makeIdRoute<IdentityEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put}.
    route('identities/:id', {
        get: (db, p) => db.identities.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identities', 'requests', 'responses'],
                async (view) => {
                    const written = await view.identities.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<IdentityEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // PII is a facet of the identity's own subtree: GET is
    // self-only, PUT/DELETE self-or-admin (enforced in the
    // request gate, mirroring /identities/:id/default-org). The
    // identity-pii COLLECTION below (admin roster) is separate.
    // PUT/DELETE each append their message pair in the same
    // transaction as the write — the pattern's last segment
    // ('pii') is not a :param, so messageAddress yields uriId
    // '' (a singleton document at a collection-style address).
    route('identities/:id/pii', {
        get: (db, p) => db.identityPii.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identity_pii', 'requests', 'responses'],
                async (view) => {
                    const written = await view.identityPii.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<IdentityPiiEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identity_pii', 'requests', 'responses'],
                async (view) => {
                    await view.identityPii.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
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
    // fall to the root admin entries — NO MEMBER_VERBS entry. The
    // PUT wire response carries `secret` — a deliberate zero-
    // change carry-over from the un-wired behavior (see
    // WRITE_RESPONSE_SPECS's 'identities/:id/credentials/:cid'
    // entry, which reconstructs the FULL entity, unlike the GETs'
    // withoutSecret projection).
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
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'identity_credentials',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .identityCredentials.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    IdentityCredentialEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // Hand-written in place of makeIdRoute<
    // IdentityTokenRevocationEntity> so PUT can append its
    // message pair in the same transaction as the write — the
    // factory's fixed closures have no per-family pair
    // selector (see message-pair.ts). GET reproduces the
    // factory closure byte-equivalently; verbs stay {get,
    // put}. identity_token_revocations is a HistoryEntityStore
    // ledger row, so this is EVENT-APPEND: no head-read, no
    // Supersedes (message-pair.ts DOCUMENT_CLASS_ROUTE_
    // PATTERNS omits it on purpose).
    route('identity-token-revocations/:id', {
        get: (db, p) =>
            db.identityTokenRevocations.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                [
                    'identity_token_revocations',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .identityTokenRevocations.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    IdentityTokenRevocationEntity,
                                    'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    route('role-grants', {
        get: (db) => db.roleGrants.getAll(),
    }),
    // Hand-written in place of makeIdRoute<RoleGrantEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put}. role_grants is a HistoryEntityStore
    // ledger row (latest-wins per (organization_id,
    // identity_id, role)), so this is EVENT-APPEND: no
    // head-read, no Supersedes.
    route('role-grants/:id', {
        get: (db, p) => db.roleGrants.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['role_grants', 'requests', 'responses'],
                async (view) => {
                    const written = await view.roleGrants.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<RoleGrantEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    route('identity-tokens', {
        get: (db) => db.identityTokens.getAll(),
    }),
    // Hand-written in place of makeIdRoute<IdentityTokenEntity>
    // so PUT can append its message pair in the same
    // transaction as the write. identity_tokens is a
    // HistoryEntityStore ledger row, so this is EVENT-APPEND:
    // no head-read, no Supersedes.
    route('identity-tokens/:id', {
        get: (db, p) => db.identityTokens.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identity_tokens', 'requests', 'responses'],
                async (view) => {
                    const written = await view
                        .identityTokens.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<IdentityTokenEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // Rotate a refresh jti. The ledger read, the rotation
    // plan, and its appends ride ONE transaction
    // (rotateRefreshJti — the same body the refresh grant
    // runs), so two concurrent rotations of one chain
    // cannot both observe the live jti (the lost-rotation
    // TOCTOU). A live jti returns its successor; a
    // known-but-not-live jti is reuse — the whole chain's
    // revocation has already landed atomically — then 409.
    // Operation-addressed (uriId ''); REPLAY_EXEMPT_ROUTE_
    // PATTERNS-wired (message-pair.ts) — the gate never serves
    // a stored response for a byte-identical resend of this
    // route, so this handler always re-enters and re-checks
    // the reuse guard for real. The gate's successBody
    // resolver PRE-MINTS the successor jti so the pair IS the
    // response; this handler reads that SAME value back off
    // the pair (pairResponseBody) and threads it into
    // rotateRefreshJti, which appends the pair as the LAST act
    // of its own transaction — only on the 'rotate' branch, so
    // a 409 (reuse or unknown) stores no pair even though the
    // reuse branch still revokes the chain for real. When pair
    // is undefined (unreachable for this wired, fenced route)
    // a fresh jti is minted here instead — crash-free.
    route('identity-tokens/:jti/rotation', {
        post: async (db, p, _body, _actor, pair) => {
            const presented = param(p, 0);
            const newJti = pair === undefined
                ? generateCryptoSafeBase62()
                : (pairResponseBody(pair)?.['jti'] as
                    string | undefined)
                    ?? generateCryptoSafeBase62();
            const outcome = await rotateRefreshJti(
                db, presented, newJti, pair,
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
    // unknown jti is an idempotent no-op that still appends
    // its pair (revokeTokenChain guards both exit paths).
    route('identity-tokens/:jti/revocation', {
        post: async (db, p, _body, _actor, pair) => {
            await revokeTokenChain(db, param(p, 0), pair);
        },
    }),
    route('identity-providers', {
        get: (db) => db.identityProviders.getAll(),
    }),
    // Hand-written in place of makeIdRoute<
    // IdentityProviderEntity> so PUT can append its message
    // pair in the same transaction as the write — the
    // factory's fixed closures have no per-family pair
    // selector (see message-pair.ts). GET reproduces the
    // factory closure byte-equivalently; verbs stay {get,
    // put}. identity_providers is a HistoryEntityStore ledger
    // row (linked/unlinked events) and a GLOBAL-plane store (no
    // organization_id field at all), so this is EVENT-APPEND:
    // no head-read, no Supersedes.
    route('identity-providers/:id', {
        get: (db, p) => db.identityProviders.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identity_providers', 'requests', 'responses'],
                async (view) => {
                    const written = await view
                        .identityProviders.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<IdentityProviderEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // The grant closures retire into api.ts's dedicated
    // authentication POST arm (Task 3, C1 discharge): both
    // routes are bearerExempt and now form their own redacted
    // pair deep inside postToken/postAuthorize, pre-tx, since
    // only the grant can resolve the requester identity. The
    // bare registration survives so matchRoute still 404s an
    // unknown path and 405s a non-POST verb on either pattern.
    route('authentication/token', {}),
    route('authentication/authorize', {}),
    route('ideas', {
        get: (db) => db.ideas.getAll(),
        // The org-scoped store stamps organization_id from the
        // verified token before validating the idea, so the
        // body OMITS it. The initial event is authored by the
        // verified caller (actor), never the body. See
        // postIdeaCreationOp for the transaction shape.
        post: (db, _p, body, actor, pair) =>
            postIdeaCreationOp(db, body, actor, pair),
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
        post: (db, p, body, actor, pair) => {
            const ideaId = param(p, 0);
            const b = validateIdeaConversionBody(body);
            return db.transaction(
                [
                    'projects', 'ideas', 'states',
                    'project_objective_baseline_scores',
                    'requests', 'responses',
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
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
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
        put: (db, p, body, _actor, pair) => {
            const sid = param(p, 1);
            return db.transaction(
                ['idea_submissions', 'requests', 'responses'],
                async (view) => {
                    const written =
                        await view.ideaSubmissions.put(
                            sid,
                            withoutId(body) as unknown as
                                Omit<
                                    IdeaSubmissionEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
        // Member-tier POST — /flows carries POST in
        // MEMBER_VERBS. See postFlowCreationOp for the
        // transaction shape.
        post: (db, _p, body, actor, pair) =>
            postFlowCreationOp(db, body, actor, pair),
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
        put: (db, p, body, actor, pair) => {
            const id = param(p, 0);
            const b = validateFlowPutBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'requests', 'responses',
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
                    const written = await view.flows.put(
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
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
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
        post: (db, p, body, actor, pair) => {
            const id = param(p, 0);
            const b = validateFlowUndoBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'requests', 'responses',
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
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
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
        post: (db, p, body, actor, pair) => {
            const id = param(p, 0);
            const b = validateFlowRedoBody(body);
            const delta = b.graphDelta;
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'requests', 'responses',
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
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
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
        post: (db, _p, body, _actor, pair) => {
            const b = validateFlowVersionPublishBody(body);
            return db.transaction(
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    await view.flowVersions.put(
                        b.id,
                        b.version as unknown as
                            Omit<FlowVersionEntity, 'id'>,
                    );
                    for (const t of b.trimIds) {
                        await view.flowVersions.delete(t);
                    }
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
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
        put: (db, p, body, _actor, pair) => {
            const pfid = param(p, 1);
            return db.transaction(
                ['project_flows', 'requests', 'responses'],
                async (view) => {
                    const written = await view.projectFlows
                        .put(
                            pfid,
                            withoutId(body) as unknown as
                                Omit<ProjectFlowEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const pfid = param(p, 1);
            return db.transaction(
                ['project_flows', 'requests', 'responses'],
                async (view) => {
                    await view.projectFlows.delete(pfid);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    route('work-orders', {
        get: (db) =>
            db.workOrders.getAll(),
        // Member-tier POST — /work-orders carries POST in
        // MEMBER_VERBS (the claim sub-route is also a member
        // POST). See postWorkOrderCreationOp for the
        // transaction shape.
        post: (db, _p, body, actor, pair) =>
            postWorkOrderCreationOp(db, body, actor, pair),
    }),
    // Hand-written in place of makeIdRoute<WorkOrderEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put} — work-orders/:id has no DELETE today,
    // mirroring the projects/:id precedent.
    route('work-orders/:id', {
        get: (db, p) => db.workOrders.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['work_orders', 'requests', 'responses'],
                async (view) => {
                    const written = await view.workOrders.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<WorkOrderEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // See postWorkOrderClaimOp for the transaction shape.
    route('work-orders/:id/claim', {
        post: (db, p, body, actor, pair) =>
            postWorkOrderClaimOp(
                db, param(p, 0), body, actor, pair,
            ),
    }),
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS, and isPermitted matches on the segment
    // prefix, so the sub-route is member-permitted like
    // /claim. See postWorkOrderTransitionOp for the
    // transaction shape.
    route('work-orders/:id/transition', {
        post: (db, p, body, actor, pair) =>
            postWorkOrderTransitionOp(
                db, param(p, 0), body, actor, pair,
            ),
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
        put: (db, p, body, _actor, pair) => {
            const woid = param(p, 1);
            return db.transaction(
                ['flow_work_orders', 'requests', 'responses'],
                async (view) => {
                    const written = await view.flowWorkOrders
                        .put(
                            woid,
                            withoutId(body) as unknown as
                                Omit<FlowWorkOrderEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
    // PUT/DELETE each append their message pair in the same
    // transaction as the write (message-pair.ts). DOCUMENT-
    // class: state_field_values is a plain, revisitable row
    // (unlike its parent states log), so a repeat PUT records
    // Supersedes and a DELETE tombstones it. The leaf nests
    // under its parent STATE EVENT (param 0), fenced by the
    // multi-hop resolver (api/store-parent-scoped.ts) exactly
    // as the bare store call was — this is a transaction wrap
    // plus pair append, not a behavior change.
    route('states/:id/field-values/:fvid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'state_field_values',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .stateFieldValues.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    StateFieldValueEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'state_field_values',
                    'requests', 'responses',
                ],
                async (view) => {
                    await view.stateFieldValues.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    route('records', {
        get: (db) => db.records.getAll(),
        post: (db, _p, body, actor, pair) =>
            postRecordWriteOp(db, body, actor, pair),
    }),
    // Hand-written in place of makeIdRoute<RecordEntity> so
    // PUT and DELETE can each append their message pair in
    // the same transaction as the write — the factory's fixed
    // closures have no per-family pair selector (see
    // message-pair.ts). GET reproduces the factory closure
    // byte-equivalently; verbs stay {get, put, delete}.
    route('records/:id', {
        get: (db, p) => db.records.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['records', 'requests', 'responses'],
                async (view) => {
                    const written = await view.records.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<RecordEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['records', 'requests', 'responses'],
                async (view) => {
                    await view.records.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    route('record-attributes', {
        get: (db) =>
            db.recordAttributes.getAll(),
    }),
    route('record-attributes/:id', {
        get: (db, p) =>
            db.recordAttributes.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                [
                    'record_attributes',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .recordAttributes.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    RecordAttributeEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        // DELETE is RESTRICT, not cascade: an attribute
        // still named by state_field_values rows or bound
        // in a flow / work-order graph refuses to die (409
        // naming the referrers) — destroying it would
        // orphan immutable event payloads. The referrer
        // check and the splice ride ONE transaction, so no
        // writer can slip a new reference between them; the
        // pair appends inside that SAME transaction, as the
        // last act after the safe delete succeeds.
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                [...new Set([
                    'record_attributes',
                    ...ATTRIBUTE_RESTRICT_TABLES,
                    'requests', 'responses',
                ])],
                async (view) => {
                    await deleteRecordAttributeSafe(view, id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
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
        put: (db, p, body, _actor, pair) => {
            const frid = param(p, 1);
            return db.transaction(
                ['flow_records', 'requests', 'responses'],
                async (view) => {
                    const written = await view.flowRecords
                        .put(
                            frid,
                            withoutId(body) as unknown as
                                Omit<FlowRecordEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const frid = param(p, 1);
            return db.transaction(
                ['flow_records', 'requests', 'responses'],
                async (view) => {
                    await view.flowRecords.delete(frid);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),

    route('organizations', {
        get: (db) => db.organizations.getAll(),
    }),
    // Hand-written in place of makeIdRoute<OrganizationEntity>
    // so PUT can append its message pair in the same
    // transaction as the write — the factory's fixed closures
    // have no per-family pair selector (see message-pair.ts).
    // GET reproduces the factory closure byte-equivalently;
    // verbs stay {get, put}. organizations is a plain
    // EntityStore (mutable), so this is DOCUMENT-class: a
    // repeat PUT records Supersedes. GLOBAL plane — no
    // organization_id stamp (this table IS the tenant root).
    route('organizations/:id', {
        get: (db, p) => db.organizations.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['organizations', 'requests', 'responses'],
                async (view) => {
                    const written = await view.organizations
                        .put(
                            id,
                            withoutId(body) as unknown as
                                Omit<OrganizationEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    route('memberships', {
        get: (db) => db.memberships.getAll(),
    }),
    // Hand-written in place of makeIdRoute<MembershipEntity> so
    // PUT and DELETE can each append their message pair in the
    // same transaction as the write — the factory's fixed
    // closures have no per-family pair selector (see
    // message-pair.ts). GET reproduces the factory closure
    // byte-equivalently; verbs stay {get, put, delete}.
    route('memberships/:id', {
        get: (db, p) => db.memberships.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['memberships', 'requests', 'responses'],
                async (view) => {
                    const written = await view.memberships.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<MembershipEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['memberships', 'requests', 'responses'],
                async (view) => {
                    await view.memberships.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
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
    // Hand-written in place of makeIdRoute<IdeaEntity> so PUT
    // can append its message pair in the same transaction as
    // the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put} — ideas/:id has no DELETE today, and
    // this scaffolding does not add one (Phase 2 Task 3 amends
    // this same entry; the registry eventually absorbs it).
    route('ideas/:id', {
        get: (db, p) => db.ideas.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['ideas', 'requests', 'responses'],
                async (view) => {
                    const written = await view.ideas.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<IdeaEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // Hand-written in place of makeIdRoute<ProjectEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put} — projects/:id has no DELETE today,
    // mirroring the ideas/:id precedent.
    route('projects/:id', {
        get: (db, p) => db.projects.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['projects', 'requests', 'responses'],
                async (view) => {
                    const written = await view.projects.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<ProjectEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    route('objectives', {
        get: (db) => db.objectives.getAll(),
        // See postObjectiveCreationOp for the transaction
        // shape.
        post: (db, _p, body, _actor, pair) =>
            postObjectiveCreationOp(db, body, pair),
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
    // Hand-written in place of a bare store put so PUT can
    // append its message pair in the same transaction as the
    // write (see message-pair.ts).
    route('objectives/:id/revisions/:rid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'objective_revisions',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .objectiveRevisions.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    ObjectiveRevisionEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
    // Hand-written in place of a bare store put so PUT can
    // append its message pair in the same transaction as the
    // write (see message-pair.ts).
    route('projects/:id/objective-baseline-scores/:sid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'project_objective_baseline_scores',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .projectObjectiveBaselineScores.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    ProjectObjectiveBaselineScoreEntity,
                                    'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
    // Hand-written in place of a bare store put so PUT can
    // append its message pair in the same transaction as the
    // write (see message-pair.ts).
    route('projects/:id/objective-actual-scores/:sid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'project_objective_actual_scores',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .projectObjectiveActualScores.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    ProjectObjectiveActualScoreEntity,
                                    'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
        put: (db, p, body, actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['states', 'requests', 'responses'],
                async (view) => {
                    const written = await view.states.put(
                        id,
                        {
                            ...validateStateBody(
                                withoutId(body),
                            ),
                            member_id: actor,
                        },
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
