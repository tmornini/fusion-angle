import type {
    DbAdapter,
} from './db.ts';
import type {
    FlowGraphDelta,
    FlowCreateBody,
} from './validators.ts';
import type {
    Id,
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
    validateMemberEntity,
    validateFlowCreateBody,
    validateFlowDocumentBody,
    validateFlowVersionEntity,
    validateFlowVersionPublishBody,
    validateFlowWorkOrderEntity,
    validateFlowUndoBody,
    validateIdeaConversionBody,
    validateIdeaDocumentBody,
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
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateOrganizationEntity,
    validateProjectDocumentBody,
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
    pickString,
    pickBoolean,
    pickNumber,
} from './validators.ts';
import {
    appendMessagePair,
    canonicalUriPrefix,
    formWritePair,
    headPairIdAt,
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
    reduceCreateGraphDelta,
} from './flow-graph-relations.ts';
import {
    storedGraphField,
} from './types.ts';
import {
    deriveIdeaSubmissions,
    ideaEntityOf,
} from './derive-ideas.ts';
import { projectEntityOf } from './derive-projects.ts';
import { flowEntityOf } from './derive-flows.ts';
import { deriveProjectFlows } from './derive-project-flows.ts';
import {
    param,
    requireOrganization,
    withoutId,
    documentCollectionGetHandler,
    documentCollectionRoute,
    documentEntityRoute,
    documentWriteResponseSpec,
    registerDocumentFamilyWiring,
    type DocumentFamilyWiring,
} from './document-family.ts';
// Re-exported: param/requireOrganization/withoutId moved to
// document-family.ts (see the import above and its own
// comment), but api.ts and existing tests still import them
// FROM here — this keeps that surface stable rather than
// touching every external call site for an internal move.
export { param, requireOrganization, withoutId };

// The ideas/projects wiring rows — the ONE copy, built HERE
// beside the ops/validators/entity-mappers they reference (all
// local bindings, so no cycle), then handed to
// registerDocumentFamilyWiring so document-family.ts's own
// table (api.ts's gate consult, and every documentEntityRoute/
// documentCollectionRoute/documentWriteResponseSpec call below)
// sees the SAME row rather than a hand-maintained duplicate.
// This import is a ONE-WAY dependency, not a cycle:
// param/requireOrganization/withoutId now live IN
// document-family.ts (moved there — see its own comment) rather
// than being re-imported from here, so document-family.ts has NO
// runtime import of routes.ts left (only the type-only Route/
// GetHandler/PutHandler/WriteResponseSpec import, erased by
// --strip-types) — document-family.ts is therefore always fully
// evaluated before ANY of this module's own top-level code runs,
// regardless of which of the two a future entry point happens to
// reach first, so registerDocumentFamilyWiring below is safe to
// call at module scope. (An earlier attempt that left
// param/requireOrganization/withoutId here, calling
// registerDocumentFamilyWiring across a genuine two-way value
// cycle, reproduced the exact TDZ ReferenceError the ORIGINAL
// lazy design existed to avoid — order-dependent on which module
// an entry point reached first; see the fix report.)
//
// Decision 7 state-in-entity (Phase 2/3): the PUT body is the
// FULL document — the entity's own fields plus the state trio —
// validated once at the gate (documentWriteResponseSpec, via
// validateDocument). The op DECOMPOSES it: the old-plane row and
// the states event write land separately, in the SAME
// transaction, so the row stays byte-identical to today. Genesis
// is head-presence-defined — a fresh id's PUT simply finds no
// head, so it authors like any other transition.
//
// MEMBER_ID CAVEAT: sameEvent (store-state.ts) compares member_id
// too, so a state-UNCHANGED edit (the resent trio matches the
// current head byte-for-byte) must replay the STORED head
// event's member_id — never the editing actor — or a different
// member plainly editing a field after someone else's transition
// would 409 (LedgerImmutabilityError). A genuinely fabricated
// trio still fails sameEvent on state/at and 409s, exactly as a
// bare states/:id resend would.
const IDEAS_WIRING: DocumentFamilyWiring = {
    family: 'ideas',
    validateDocument: validateIdeaDocumentBody,
    documentOp: postIdeaDocumentOp,
    entityOf: ideaEntityOf,
};
const PROJECTS_WIRING: DocumentFamilyWiring = {
    family: 'projects',
    validateDocument: validateProjectDocumentBody,
    documentOp: postProjectDocumentOp,
    entityOf: projectEntityOf,
};
// The flows wiring row — Task 3's flip commit, GET-wired at
// Task 8. entityOf is derive-flows.ts's OWN flowEntityOf, not a
// routes.ts-local mapper: it returns FlowWithGraph (the entity
// plus the document's own `graph` field), the shape both
// documentGetHandler (flows/:id) and documentCollectionRoute
// (flows) now serve verbatim — no flows-special branch inside
// either generic constructor. ideas/projects' own entityOf
// mappers return their bare entity shape (no such extra field),
// so this is the ONE per-family divergence document-family.ts's
// `entityOf: (document, organization) => unknown` slot already
// tolerates by design, not a widened interface.
const FLOWS_WIRING: DocumentFamilyWiring = {
    family: 'flows',
    validateDocument: validateFlowDocumentBody,
    documentOp: postFlowDocumentOp,
    entityOf: flowEntityOf,
};
registerDocumentFamilyWiring(IDEAS_WIRING);
registerDocumentFamilyWiring(PROJECTS_WIRING);
registerDocumentFamilyWiring(FLOWS_WIRING);

// Every handler receives the verified caller's id (actor) as
// its final argument — the one place authorship is sourced.
// The gate resolves it from the token; handlers that author
// state events or identify the caller stamp it, and the rest
// (the makeIdRoute closures) simply ignore the extra arg. A GET
// handler also receives the fence organization — the verified
// token claim the gate resolved, never the path — undefined for
// a bearer-exempt or global route; a ledger-derived, org-owned
// read requires it (see requireOrganization) while every other
// GET handler ignores the extra trailing arg, the same
// fewer-parameter-closure precedent actor already established.
// Exported so api/document-family.ts's generic constructors
// declare their return types with the SAME handler vocabulary
// routes.ts itself uses, rather than a structurally-duplicated
// alias.
export type GetHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    organization: Id | undefined,
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
export type PutHandler = (
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

// PostHandler alone also carries a trailing fence
// organization, mirroring GetHandler's rationale above: the
// verified token claim the gate resolved, never the path.
// Undefined for a bearer-exempt or global route. Only the
// conversion handler consults it today (to form the created
// project's OWN document-address pair beside the operation
// pair above); every other POST handler ignores the extra
// trailing arg, the same fewer-parameter-closure precedent
// `pair` already established.
type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
    organization: Id | undefined,
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

// Idea document write (Decision 7): ONE shape serves create,
// edit, and transition — genesis is head-presence-defined (a
// fresh id's PUT simply finds no head, so the ternary below
// falls to `actor`, authoring the birth like any other
// transition). The idea row and its trio's state event commit
// as ONE transaction — a mid-write failure rolls the whole
// thing back rather than leaving a half-written document.
// validateIdeaDocumentBody's typed `entity` never carries
// organization_id (the org-scoped store stamps it from the
// verified token for the LIVE, fenced route, overwriting
// whatever it finds regardless); the seed's below-facade call
// (api/mock-data.ts, no gate, no scoping wrapper) drives a RAW
// store that has no such stamp, so it embeds organization_id in
// the raw body and this op reads it straight back to merge it
// in — inert for the fenced route (overwritten either way),
// load-bearing for the seed. Exported so the seed can drive
// idea creation through the same op the route uses (Decision
// 6's below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'ideas/:id' is pair-wired and never
// bearer-exempt.
export async function postIdeaDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<IdeaEntity> {
    const doc = validateIdeaDocumentBody(withoutId(body));
    const organizationId = body['organization_id'];
    return db.transaction(
        ['ideas', 'states', 'requests', 'responses'],
        async (view) => {
            const head = await view.states.getCurrentFor(id);
            const memberId = (
                head !== null
                && head.id === doc.state_event_id
                && head.state === doc.state
                && head.at === doc.state_at
            ) ? head.member_id : actor;
            const written = await view.ideas.put(
                id,
                {
                    ...doc.entity,
                    ...(typeof organizationId === 'string'
                        ? { organization_id: organizationId }
                        : {}),
                } as unknown as Omit<IdeaEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                memberId, doc.state_at,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Project document write (Decision 7): ONE shape serves
// create, edit, and transition — genesis is head-presence-
// defined (a fresh id's PUT simply finds no head, so the
// ternary below falls to `actor`, authoring the birth like any
// other transition). The project row and its trio's state
// event commit as ONE transaction — a mid-write failure rolls
// the whole thing back rather than leaving a half-written
// document. validateProjectDocumentBody's typed `entity` never
// carries organization_id (the org-scoped store stamps it from
// the verified token for the LIVE, fenced route, overwriting
// whatever it finds regardless); the seed's below-facade call
// (api/mock-data.ts, no gate, no scoping wrapper) drives a RAW
// store that has no such stamp, so it embeds organization_id in
// the raw body and this op reads it straight back to merge it
// in — inert for the fenced route (overwritten either way),
// load-bearing for the seed. Exported so the seed can drive
// project creation through the same op the route uses (Decision
// 6's below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'projects/:id' is pair-wired and never
// bearer-exempt.
export async function postProjectDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<ProjectEntity> {
    const doc = validateProjectDocumentBody(withoutId(body));
    const organizationId = body['organization_id'];
    return db.transaction(
        ['projects', 'states', 'requests', 'responses'],
        async (view) => {
            const head = await view.states.getCurrentFor(id);
            const memberId = (
                head !== null
                && head.id === doc.state_event_id
                && head.state === doc.state
                && head.at === doc.state_at
            ) ? head.member_id : actor;
            const written = await view.projects.put(
                id,
                {
                    ...doc.entity,
                    ...(typeof organizationId === 'string'
                        ? { organization_id: organizationId }
                        : {}),
                } as unknown as Omit<ProjectEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                memberId, doc.state_at,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Idea submission write: a genesis-only document address (an
// idea is submitted once per sid; no edit/transition case
// exists for this family) — the idea_submissions row and its
// message pair commit as ONE transaction. Exported so the seed
// can drive submission creation through the same op the route
// uses (Decision 6's below-facade carve-out), exactly as
// postIdeaDocumentOp does for ideas themselves. `pair` is
// optional so a future below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'ideas/:id/submissions/:sid' is pair-wired and never
// bearer-exempt.
export async function postIdeaSubmissionOp(
    db: DbAdapter,
    sid: Id,
    body: Record<string, unknown>,
    pair?: MessagePair,
): Promise<IdeaSubmissionEntity> {
    return db.transaction(
        ['idea_submissions', 'requests', 'responses'],
        async (view) => {
            const written = await view.ideaSubmissions.put(
                sid,
                withoutId(body) as unknown as
                    Omit<IdeaSubmissionEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// The create's synthesized document body (Task 5): the SAME
// shape a live genesis PUT /flows/:id would carry — the flow's
// own five fields, the initial-state trio, the reduced graph
// (via reduceCreateGraphDelta, the ONE shared reduction the
// live route and the seed both call — never two hand-rolled
// constructions), and the two transitional decomposition
// sidecars (graphDelta verbatim; revivals empty — a fresh flow
// revives nothing). Exported so the seed's pass-1 pair
// body-builder (api/mock-data/seed-message-pairs.ts) calls this
// SAME function rather than reconstructing the document by
// hand. Entity fields are picked directly (mirroring
// flowEntityOf below) rather than spread from `b.flow` verbatim
// — the seed's own `b.flow` also carries a tolerated
// organization_id (validateFlowDocumentBody's optional extra)
// that must never leak into the byte-compared document, so both
// callers converge on the identical five-key shape regardless.
export function flowCreateDocumentBody(
    b: FlowCreateBody,
): Record<string, unknown> {
    return {
        name: pickString(b.flow, 'name'),
        is_locked: pickBoolean(b.flow, 'is_locked'),
        is_auto_layout: pickBoolean(b.flow, 'is_auto_layout'),
        is_auto_fit: pickBoolean(b.flow, 'is_auto_fit'),
        lock_timeout: pickNumber(b.flow, 'lock_timeout'),
        state: b.initialState,
        state_at: b.initialStateAt,
        state_event_id: b.initialStateEventId,
        graph: storedGraphField(
            reduceCreateGraphDelta(b.graphDelta),
        ),
        graphDelta: b.graphDelta,
        revivals: [],
    };
}

// The three pairs a live POST /flows forms (Task 5): the gate's
// own operation pair (204, at the flows/:id address per Task 1's
// createdEntityUriId override — POST 'flows' and PUT 'flows/:id'
// collapse onto the SAME (uriPrefix, uriId), see derive-
// documents.ts's DOCUMENT_METHODS filter for why the two never
// collide as documents), plus the document and join pairs the
// route pre-forms below. All three share ONE requestAt (the
// create's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePair's nowUtc() is monotonic), so the
// document pair — appended after the operation pair — becomes
// the address's head.
export interface FlowCreationPairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly join: MessagePair;
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
// insertion seam. `pairs` is optional so the seed's below-
// facade call (api/mock-data.ts, no gate, no pairs) keeps
// compiling unchanged; the route always supplies the
// triple, since 'flows' is pair-wired and never
// bearer-exempt. The route (not this op) forms all three
// pairs pre-tx — see route('flows', ...) below — since
// forming the document/join pairs needs the fence
// organization and the flows/:id + projects/:id/flows/:pfid
// response specs, both route-table concerns.
export async function postFlowCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pairs?: FlowCreationPairs,
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
            // Three pairs or none (Atomicity): the operation
            // pair (the gate's own), the synthesized document
            // pair, and the synthesized join pair — appended in
            // that order, LAST, so the document pair's response
            // `at` strictly follows the operation pair's.
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                await appendMessagePair(view, pairs.join);
            }
        },
    );
}

// Flow document write (Decision 7, the LOCKED class — Task 3):
// the flow row, its trio's state event, the graph delta to the
// four relation tables, and any revivals commit as ONE
// transaction — a mid-write failure rolls the whole thing back
// rather than leaving a half-written document. UNLIKE
// postIdeaDocumentOp/postProjectDocumentOp, this op carries NO
// member_id ternary: flows mint a FRESH trio on every PUT
// (design decision 2) — nothing here ever resends a STORED
// trio verbatim, since the C6 client retry loop mints a new
// state_event_id/state_at on every attempt (the E6 split).
// A byte-identical resend is caught by the gate's pre-tx
// idempotency fast path (never reaching this op at all); a
// same-id, genuinely different-content collision still 409s
// via LedgerImmutabilityError — today's covenant, unchanged.
// version-publish (a flow_versions row) is NOT part of this op
// (Decision 3) — it rides its own POST /flows/:id/versions
// transaction. `graphDelta`/`revivals` are TRANSITIONAL
// decomposition-only sidecars — the old-plane relation writer
// alone consumes them; no derivation reads either one, and
// both retire at Phase Final. `graph` is the client-authored
// post-save working snapshot, carried verbatim (no transform)
// — this op never touches it beyond passing validation; a
// future derivation (Task 7) re-normalizes nodes[]/edges[] from
// the relation tables, not from this field. The org-scoped
// flows store stamps organization_id from the verified token
// and re-validates through validateFlowEntity, so the entity
// body OMITS it; the below-facade seed path (Task 6, no
// scoping wrapper) embeds it in the raw body and this op reads
// it straight back to merge it in — inert for the fenced route
// (overwritten either way), load-bearing for the seed. Exported
// so the seed can drive flow genesis through the same op the
// route uses (Decision 6's below-facade carve-out). `pair` is
// optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'flows/:id' is pair-wired and never bearer-exempt.
export async function postFlowDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<FlowEntity> {
    const doc = validateFlowDocumentBody(withoutId(body));
    const organizationId = body['organization_id'];
    const delta = doc.graphDelta;
    return db.transaction(
        [
            'flows', 'states',
            'flow_nodes', 'flow_edges',
            'flow_node_members',
            'flow_node_attributes',
            'requests', 'responses',
        ],
        async (view) => {
            const written = await view.flows.put(
                id,
                {
                    ...doc.entity,
                    ...(typeof organizationId === 'string'
                        ? { organization_id: organizationId }
                        : {}),
                } as unknown as Omit<FlowEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                actor, doc.state_at,
            );
            await writeFlowGraphDelta(view, delta, actor);
            for (const r of doc.revivals) {
                await view.states.postEvent(
                    r.eventId, r.entityId,
                    'restored', actor, r.at,
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
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
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody: it validates the
    // full wire document (entity + trio) through the wiring's
    // OWN validator and discards the trio — the same GET/PUT
    // symmetry Decision 7's wire-parity rule holds for reads.
    'ideas/:id': documentWriteResponseSpec(IDEAS_WIRING),
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
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale.
    'projects/:id': documentWriteResponseSpec(PROJECTS_WIRING),
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
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. flows/:id is the
    // FIRST locked-class entry (Task 3): the response shape is
    // unchanged either way (RESPONSE-BYTE PARITY, verified at
    // plan time) — only the gate's pre-dispatch four-outcome
    // table (api.ts) differs for a locked family, never this
    // successBody.
    'flows/:id': documentWriteResponseSpec(FLOWS_WIRING),
    'flows/:id/undo': { status: 204 },
    'flows/:id/versions': { status: 204 },
    'flows/:id/versions/:vid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowVersionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
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
    'objectives/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateObjectiveEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
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
    'members/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateMemberEntity(withoutId(body ?? {})),
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
    // Create retired into the SAME document PUT ideas/:id
    // already serves (Decision 7, Phase 2 Task 3, R1): genesis
    // is head-presence-defined, so there is no longer a
    // separate create verb here — POST now 405s exactly like
    // any other method-absent route. GET is FLIPPED (Phase 2
    // Task 5): the list derives from the message ledger rather
    // than the old ideas table. Absorbed (Phase 4 Task 2) into
    // the generic documentCollectionRoute — wire-identical to
    // the hand-written deriveIdeas dispatch it replaces.
    documentCollectionRoute(IDEAS_WIRING),
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
    //
    // Phase 3 Task 4: the operation pair above lives at the
    // ideas-family OPERATION address (uri_id '') — a projects-
    // prefix scan finds no pair for a conversion-born project
    // without a SECOND pair at the project's OWN document
    // address. Synthesized below, BYTE-INDISTINGUISHABLE from a
    // live PUT /projects/:id's pair at that same address (same
    // response spec, same head-read), so derivation needs no
    // conversion special case. Formed PRE-TX — crypto and the
    // head-read stay outside db.transaction, the IndexedDB
    // auto-commit constraint — then appended as the tx's LAST
    // act, beside the operation pair. Formed ONLY when the gate
    // supplied both a pair and a fence organization; a below-
    // facade caller with neither (none exists for conversion
    // today) skips both appends, preserving dual-write
    // discipline. The idea's OWN 'promoted' transition still
    // appends no ideas/:id document pair — a known, separately
    // tracked deferral (work-orders/Phase Final) that cannot
    // confuse this derivation: 'promoted' is not 'deleted'.
    route('ideas/:id/conversion', {
        post: async (
            db, p, body, actor, pair, organization,
        ) => {
            const ideaId = param(p, 0);
            const b = validateIdeaConversionBody(body);
            // The document a live PUT /projects/:id would
            // carry: the entity's own fields plus the lifecycle
            // trio this conversion assigns. Validated pre-tx —
            // a malformed project body now 400s here instead of
            // at the in-tx store re-validation; same observable,
            // earlier.
            const projectDocument = {
                ...b.project,
                state: b.projectState,
                state_at: b.projectStateAt,
                state_event_id: b.projectStateEventId,
            };
            validateProjectDocumentBody(projectDocument);
            let projectPair: MessagePair | undefined;
            if (
                pair !== undefined
                && organization !== undefined
            ) {
                const spec =
                    WRITE_RESPONSE_SPECS['projects/:id'];
                if (spec === undefined || !('status' in spec)) {
                    throw new Error(
                        'no per-write response spec for'
                        + ' projects/:id',
                    );
                }
                const projectHeadPairId = await headPairIdAt(
                    db,
                    canonicalUriPrefix(
                        organization, '/projects/',
                    ),
                    b.projectId,
                );
                projectPair = await formWritePair({
                    method: 'PUT',
                    pathname: '/projects/' + b.projectId,
                    routePattern: 'projects/:id',
                    routeSegments: ['projects', ':id'],
                    pathSegments: ['projects', b.projectId],
                    headerFields: [],
                    body: projectDocument,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    responseStatus: 200,
                    responseBody: spec.successBody?.(
                        [b.projectId], projectDocument, actor,
                        organization,
                    ),
                    headPairId: projectHeadPairId,
                });
            }
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
                    if (projectPair !== undefined) {
                        await appendMessagePair(
                            view, projectPair,
                        );
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Phase 3 Task 6): the list derives from
    // the message ledger rather than the old projects table.
    // Absorbed (Phase 4 Task 2) into the generic
    // documentCollectionRoute — wire-identical to the
    // hand-written deriveProjects dispatch it replaces.
    documentCollectionRoute(PROJECTS_WIRING),
    // Idea submissions nest under their parent idea: the idea id
    // is param 0, so the SERVER filters the collection to that
    // idea (the org fence still rides the facade re-entry). GET
    // is FLIPPED (Phase 2 Task 5): the collection derives from
    // the message ledger at this idea's submissions address
    // rather than the old idea_submissions table. The leaf id is
    // param 1; only PUT is exposed on ideas/:id/submissions/:sid,
    // exactly as the flat makeIdRoute carried it.
    route('ideas/:id/submissions', {
        get: (db, p, _actor, organization) =>
            deriveIdeaSubmissions(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('ideas/:id/submissions/:sid', {
        put: (db, p, body, _actor, pair) =>
            postIdeaSubmissionOp(db, param(p, 1), body, pair),
    }),
    route('flows', {
        // GET is FLIPPED (Phase 4 Task 8): the list derives from
        // the message ledger rather than the old flows table plus
        // its relation tables. Rides the generic
        // documentCollectionRoute — wire-identical to the
        // hand-written deriveFlows dispatch it replaces (the
        // wiring's own entityOf, derive-flows.ts's flowEntityOf,
        // carries the `graph` field, so the list needs no
        // flows-special reassembly step). POST stays this
        // hand-written create — unlike ideas/projects, flows never
        // folded genesis into the document PUT (Decision 6), so a
        // separate create verb remains here.
        get: documentCollectionGetHandler(FLOWS_WIRING),
        // Member-tier POST — /flows carries POST in
        // MEMBER_VERBS. Forms the document + join pairs pre-tx
        // (Task 5) beside the gate's own operation pair — the
        // SAME shape a live genesis PUT /flows/:id and a live
        // PUT /projects/:id/flows/:pfid would each carry — ONLY
        // when the gate supplied both a pair and a fence
        // organization (the Phase 3 condition verbatim); a
        // below-facade caller (api/mock-data.ts, no gate) skips
        // all three, preserving dual-write discipline. See
        // postFlowCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: FlowCreationPairs | undefined;
            if (pair !== undefined && organization !== undefined) {
                const b = validateFlowCreateBody(body);
                const documentBody = flowCreateDocumentBody(b);
                validateFlowDocumentBody(documentBody);
                const documentSpec =
                    WRITE_RESPONSE_SPECS['flows/:id'];
                if (
                    documentSpec === undefined
                    || !('status' in documentSpec)
                ) {
                    throw new Error(
                        'no per-write response spec for'
                        + ' flows/:id',
                    );
                }
                const documentHeadPairId = await headPairIdAt(
                    db,
                    canonicalUriPrefix(organization, '/flows/'),
                    b.id,
                );
                const document = await formWritePair({
                    method: 'PUT',
                    pathname: '/flows/' + b.id,
                    routePattern: 'flows/:id',
                    routeSegments: ['flows', ':id'],
                    pathSegments: ['flows', b.id],
                    headerFields: [],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    responseStatus: documentSpec.status,
                    responseBody: documentSpec.successBody?.(
                        [b.id], documentBody, actor, organization,
                    ),
                    headPairId: documentHeadPairId,
                });
                // The live :pfid PUT's request shape, verified by
                // content: validateProjectFlowEntity accepts
                // EXACTLY project_id/flow_id/at
                // (api/validators.ts) — the same three keys
                // b.projectFlow already carries, so it doubles as
                // the join pair's body verbatim.
                validateProjectFlowEntity(b.projectFlow);
                const projectId = pickString(
                    b.projectFlow, 'project_id',
                );
                const joinSpec = WRITE_RESPONSE_SPECS[
                    'projects/:id/flows/:pfid'
                ];
                if (
                    joinSpec === undefined
                    || !('status' in joinSpec)
                ) {
                    throw new Error(
                        'no per-write response spec for'
                        + ' projects/:id/flows/:pfid',
                    );
                }
                const join = await formWritePair({
                    method: 'PUT',
                    pathname: '/projects/' + projectId
                        + '/flows/' + b.projectFlowId,
                    routePattern: 'projects/:id/flows/:pfid',
                    routeSegments: [
                        'projects', ':id', 'flows', ':pfid',
                    ],
                    pathSegments: [
                        'projects', projectId,
                        'flows', b.projectFlowId,
                    ],
                    headerFields: [],
                    body: b.projectFlow,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    responseStatus: joinSpec.status,
                    responseBody: joinSpec.successBody?.(
                        [projectId, b.projectFlowId],
                        b.projectFlow, actor, organization,
                    ),
                    // Genesis-undefined: a flow's create-time
                    // join is always fresh (design decision — no
                    // duplicate-create carve-out at this address
                    // through this task).
                    headPairId: undefined,
                });
                pairs = { operation: pair, document, join };
            }
            return postFlowCreationOp(db, body, actor, pairs);
        },
    }),
    // flows/:id is the FIRST locked-class route (Task 3). GET is
    // FLIPPED (Phase 4 Task 8): absorbed into the generic
    // documentEntityRoute — the SAME wiring row PUT already rides
    // (Task 3), so this replaces the hand-written old-plane
    // reassembly with documentGetHandler(FLOWS_WIRING), wire-
    // identical to it (derive-flows.ts's flowEntityOf carries the
    // `graph` field the entity route's generic shape needs, so no
    // flows-special branch lives inside documentGetHandler
    // itself). After this commit NO hand-written document-family
    // route object remains for any registered family (ideas,
    // projects, flows) — the third-family obligation's discharge.
    // The gate's four-outcome table (api.ts, keyed off
    // familyRegistration('flows').concurrency === 'locked')
    // resolves genesis/412/follows entirely BEFORE dispatch;
    // documentPutHandler carries no concurrency branch of its
    // own — it dispatches straight to postFlowDocumentOp, which
    // DECOMPOSES the document (flow row PUT, state event, graph
    // delta, revivals) in one transaction. version-publish (a
    // flow_versions row) no longer rides this PUT at all
    // (Decision 3) — it is POST /flows/:id/versions's own
    // transaction now (postFlowVersion, called separately by the
    // client before the save). Member-tier PUT —
    // MEMBER_VERBS['/flows'] includes 'PUT'.
    documentEntityRoute(FLOWS_WIRING),
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
    // Member-tier POST via the /flows segment prefix. Task 5: the
    // op ALSO synthesizes its own document pair pre-tx, from the
    // body alone (no reads beyond the pre-tx head lookup) — the
    // flows family is LOCKED, so this document write takes the
    // FOLLOWS slot (never supersedes; the op holds no echo of its
    // own — design decision 5). On a follows collision (a save
    // raced this undo for the SAME head) the whole transaction
    // aborts via the responses.follows unique index →
    // UniqueConstraintError → the gate's existing 412 mapping
    // (api.ts) — performUndo (web-app) absorbs that with a
    // jittered retry, rebuilding against a FRESH baseline.
    route('flows/:id/undo', {
        post: async (
            db, p, body, actor, pair, organization,
        ) => {
            const id = param(p, 0);
            const b = validateFlowUndoBody(body);
            const delta = b.graphDelta;
            let documentPair: MessagePair | undefined;
            if (pair !== undefined && organization !== undefined) {
                const documentBody = {
                    name: pickString(b.flow, 'name'),
                    is_locked: pickBoolean(b.flow, 'is_locked'),
                    is_auto_layout:
                        pickBoolean(b.flow, 'is_auto_layout'),
                    is_auto_fit: pickBoolean(b.flow, 'is_auto_fit'),
                    lock_timeout: pickNumber(b.flow, 'lock_timeout'),
                    state: 'updated',
                    state_at: b.at,
                    state_event_id: b.eventId,
                    graph: b.graph,
                    graphDelta: b.graphDelta,
                    revivals: b.revivals,
                };
                validateFlowDocumentBody(documentBody);
                const prefix = canonicalUriPrefix(
                    organization, '/flows/',
                );
                const head = await headPairIdAt(db, prefix, id);
                const spec = WRITE_RESPONSE_SPECS['flows/:id'];
                if (spec === undefined || !('status' in spec)) {
                    throw new Error(
                        'no per-write response spec for'
                        + ' flows/:id',
                    );
                }
                documentPair = await formWritePair({
                    method: 'PUT',
                    pathname: '/flows/' + id,
                    routePattern: 'flows/:id',
                    routeSegments: ['flows', ':id'],
                    pathSegments: ['flows', id],
                    headerFields: [],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    responseStatus: spec.status,
                    responseBody: spec.successBody?.(
                        [id], documentBody, actor, organization,
                    ),
                    headPairId: undefined,
                    ...(head === undefined
                        ? {} : { follows: head }),
                });
            }
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
                    if (documentPair !== undefined) {
                        await appendMessagePair(view, documentPair);
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
    // PUT/DELETE each append their message pair in the same
    // transaction as the write (message-pair.ts). DOCUMENT-
    // class: a version row is a plain, revisitable row — a
    // repeat PUT records Supersedes and a DELETE tombstones it,
    // exactly like flow_work_orders/state_field_values above.
    // The cap-trim machinery (flows.ts's save/undo/redo/publish
    // ops) calls `flowVersions.delete` directly, inside ITS OWN
    // transaction, for versions past the retention cap — that
    // physical splice is untouched and stores no pair; only a
    // request through THIS route (a client-addressed DELETE of
    // one named version) appends one. The leaf nests under its
    // parent flow (param 0); `vid` is param 1.
    route('flows/:id/versions/:vid', {
        get: (db, p) => db.flowVersions.getById(param(p, 1)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    const written = await view.flowVersions
                        .put(
                            id,
                            withoutId(body) as unknown as
                                Omit<FlowVersionEntity, 'id'>,
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
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    await view.flowVersions.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // Project↔flow joins nest under their parent project: the
    // project id is param 0, so the SERVER filters the collection
    // to that project (the org fence still rides the facade
    // re-entry). The leaf id is param 1; PUT and DELETE are
    // exposed exactly as the flat makeIdRoute carried them. GET is
    // FLIPPED (Phase 4 Task 8): the join list derives from the
    // message ledger at this project's flows address rather than
    // the old project_flows table — deriveProjectFlows is a
    // bespoke derivation (not a DocumentFamilyWiring family; a
    // join row carries no lifecycle trio of its own), so this
    // calls it directly rather than through a generic constructor.
    route('projects/:id/flows', {
        get: (db, p, _actor, organization) =>
            deriveProjectFlows(
                db, requireOrganization(organization),
                param(p, 0),
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

    // Hand-written in place of makeIdRoute<MemberEntity> so PUT
    // can append its message pair in the same transaction as
    // the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put} — members/:id has no DELETE today,
    // mirroring the identities/:id precedent. Global plane: no
    // organization stamping (the members directory row carries
    // no organization_id).
    route('members/:id', {
        get: (db, p) => db.members.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['members', 'requests', 'responses'],
                async (view) => {
                    const written = await view.members.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<MemberEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — GET dispatches to the derived
    // entity, PUT to postIdeaDocumentOp, wire-identical to the
    // hand-written {get, put} pair it replaces. The Decision-7/
    // MEMBER_ID-CAVEAT prose that lived here moved to the
    // IDEAS_WIRING block above.
    documentEntityRoute(IDEAS_WIRING),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — see the ideas/:id entry above for
    // the shared rationale; the Decision-7/MEMBER_ID-CAVEAT
    // prose moved to the PROJECTS_WIRING block above.
    documentEntityRoute(PROJECTS_WIRING),
    route('objectives', {
        get: (db) => db.objectives.getAll(),
        // See postObjectiveCreationOp for the transaction
        // shape.
        post: (db, _p, body, _actor, pair) =>
            postObjectiveCreationOp(db, body, pair),
    }),
    // Hand-written in place of makeIdRoute<ObjectiveEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). GET
    // reproduces the factory closure byte-equivalently; verbs
    // stay {get, put} — objectives/:id has no DELETE today,
    // mirroring the projects/:id precedent.
    route('objectives/:id', {
        get: (db, p) => db.objectives.getById(param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['objectives', 'requests', 'responses'],
                async (view) => {
                    const written = await view.objectives.put(
                        id,
                        withoutId(body) as unknown as
                            Omit<ObjectiveEntity, 'id'>,
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
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
