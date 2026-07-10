import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id, FlowWithGraph, StateEntity,
    FlowNodeAttributeEntity, FlowNodeMemberEntity,
} from './types.ts';
import {
    pickString, pickNumber, pickBoolean, pickJsonObjectField,
    validateFlowNodeAttributeEntity,
    validateFlowNodeMemberEntity,
} from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import { normalizedStoredGraphField } from
    './flow-graph-relations.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';

// Flows' own reshaping of the generic message-plane reduction
// (derive-documents.ts): the async fetching (one prefix scan per
// derivation, per family address) plus the entity/lifecycle
// knowledge only this family has. Read-only and additive — no
// route, adapter, or seed row reads any of this yet (Task 8
// wires the route); tests/drift-flows.test.ts is the proof of
// equality against the old plane. Structurally mirrors
// derive-ideas.ts/derive-projects.ts (same private helper
// shapes, renamed for flows) through the shared Task 2 helpers;
// the graph re-sort (normalizedStoredGraphField, flow-graph-
// relations.ts) is the ONE flows-novel piece a flat document
// family never needed.
//
// THREE HEAD notions coexist over a flow's message-plane rows
// and must never be conflated (IV Logic):
//   - The LOCK head: the latest pair at the address by envelope
//     (at, id), ANY method — headPairIdAt's own reduction
//     (message-pair.ts), serving Supersedes/Follows provenance
//     for the locked class. A DAG under races; provenance-only,
//     never consulted here.
//   - The DOCUMENT head: the latest PUT/DELETE pair by envelope
//     (at, id) — documentPairsAt/deriveDocumentsAt's own
//     reduction (derive-documents.ts). THIS is what `graph`
//     tracks below: the client-authored working snapshot the
//     most recently successful PUT actually carried, never the
//     lifecycle-current pair's own snapshot when the two
//     diverge.
//   - The LIFECYCLE-current event: the (state_at,
//     state_event_id) reduction over EVERY document pair's own
//     trio — never arrival order, never the envelope `at`s
//     (currentDocumentState, derive-documents.ts). Decides
//     visibility (a 'deleted' current state excludes/404s)
//     independently of which pair is the document head.
// Under artificial clock skew (a stale state_at arriving in a
// LATER pair) the lifecycle winner can differ from the document
// head — tests/derive-flows.test.ts's genesis-wins-under-skew
// case proves `graph` still tracks the DOCUMENT head even when
// genesis (not the skewed pair) wins the lifecycle reduction.

const FLOWS_TABLE = 'flows';

function flowsUriPrefix(organization: Id): string {
    return canonicalUriPrefix(organization, '/flows/');
}

// The derived entity: the head document's body minus the
// lifecycle trio (state/state_at/state_event_id, simply never
// copied across) plus organization_id stamped from the
// derivation's OWN organization parameter — never the body's own
// value (mirrors ideaEntityOf/projectEntityOf). `graph` is the
// head body's own graph field, re-emitted through the ONE
// shared normalizer — derivation reads ONLY the document's own
// fields, never the graphDelta/revivals sidecars (Internal
// Defense: tests/drift-flows.test.ts's sidecar-insensitivity
// case proves this, not just asserts it). `pairCount` is this
// flow's OWN document-pair count (Phase 14 Task 8) — the cheap
// hasUndoHistory approximation; deriveFlow/deriveFlows (below)
// supply it, since both already group pairs per flow for their
// own lifecycle walk (no second pass here). OPTIONAL only so
// this function keeps satisfying DocumentFamilyWiring's fixed
// 2-arg `entityOf` contract in FLOWS_WIRING (api/routes.ts) —
// dead in practice, since both live flows GET routes are
// hand-written and call deriveFlow/deriveFlows directly (never
// the generic document-family GET path flows used before this
// task), never omitting the count.
export function flowEntityOf(
    document: DerivedDocument,
    organization: Id,
    pairCount?: number,
): FlowWithGraph {
    const body = document.body;
    return {
        id: document.uriId,
        organization_id: organization,
        name: pickString(body, 'name'),
        is_locked: pickBoolean(body, 'is_locked'),
        is_auto_layout: pickBoolean(body, 'is_auto_layout'),
        is_auto_fit: pickBoolean(body, 'is_auto_fit'),
        lock_timeout: pickNumber(body, 'lock_timeout'),
        graph: normalizedStoredGraphField(
            pickJsonObjectField(body, 'graph'),
        ),
        hasUndoHistory: (pairCount ?? 0) > 1,
    };
}

async function fetchFlowPairs(
    db: DbAdapter,
    prefix: string,
): Promise<{
    readonly documents: Map<string, DerivedDocument>;
    readonly pairs: readonly DocumentPair[];
}> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return {
        documents: deriveDocumentsAt(requests, responses, prefix),
        pairs: documentPairsAt(requests, responses, prefix),
    };
}

// id-lex ordered (the IndexedDB reference), deleted-filtered —
// the head lifecycle state 'deleted' excludes a flow exactly as
// EntityStore's states-log tombstone filter does today
// (dead-in-practice for flows today — no live route ever PUTs a
// 'deleted' state trio — but the drift check exercises it via a
// live document PUT, mechanism-parity with the old plane).
export async function deriveFlows(
    db: DbAdapter,
    organization: Id,
): Promise<FlowWithGraph[]> {
    const prefix = flowsUriPrefix(organization);
    const { documents, pairs } = await fetchFlowPairs(db, prefix);
    const pairsByFlowId = new Map<Id, DocumentPair[]>();
    for (const pair of pairs) {
        const list = pairsByFlowId.get(pair.uriId);
        if (list === undefined) {
            pairsByFlowId.set(pair.uriId, [pair]);
        } else {
            list.push(pair);
        }
    }
    const flows: FlowWithGraph[] = [];
    for (const [flowId, document] of documents) {
        const history = stateHistoryFrom(
            documentLifecycleEvents(
                pairsByFlowId.get(flowId) ?? [],
            ),
            flowId,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            continue;
        }
        flows.push(flowEntityOf(
            document, organization,
            pairsByFlowId.get(flowId)?.length ?? 0,
        ));
    }
    return flows.sort(byIdAscending);
}

export async function deriveFlow(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<FlowWithGraph> {
    const prefix = flowsUriPrefix(organization);
    const { documents, pairs } = await fetchFlowPairs(db, prefix);
    const document = documents.get(flowId);
    if (document === undefined) {
        throw new EntityNotFoundError(FLOWS_TABLE, flowId);
    }
    const ownPairs = pairs.filter(
        (pair) => pair.uriId === flowId,
    );
    const history = stateHistoryFrom(
        documentLifecycleEvents(ownPairs),
        flowId,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw new EntityNotFoundError(FLOWS_TABLE, flowId);
    }
    return flowEntityOf(document, organization, ownPairs.length);
}

// Undo-as-replay's own resolution (Phase 14 Task 8): given this
// flow's OWN undo-operation-pair address prefix (the route's
// own `pair.uriPrefix` — already flow-specific, since `undo` is
// a literal final route segment, so messageAddress folds the
// real id into the PREFIX rather than a separate uriId), walks
// this flow's flows/:id document-pair history and replays it as
// a stack with a pointer: a GENUINE pair (no correlated undo
// call) truncates any abandoned branch to `[0..pointer]` then
// pushes; an UNDO-correlated pair only moves the pointer back —
// it never adds a new logical state (the fix that makes
// undo-save-undo target the SAVE's own baseline, never a
// discarded future — see the PINNED Step 0 trace,
// .superpowers/sdd/phase14-task-8-report.md). Correlation is by
// the STORED REQUEST `at` (never the response `at` —
// appendMessagePair mints each pair's own response `at`
// independently via nowUtc(), so two pairs written in the SAME
// transaction do not share it; the request `at` DOES, since
// both the operation pair and its synthesized document pair
// carry the identical `pair.requestAt`). `target: undefined`
// means exhaustion (no pair exists before the current head); an
// undefined RETURN means the flow has no document pairs at all
// at this address (should never happen for a routed request
// against a real flow id — this derivation trusts nothing
// beyond what it reads, same posture as deriveFlow's own
// EntityNotFoundError guard).
export interface FlowUndoResolution {
    readonly current: DocumentPair;
    readonly target: DocumentPair | undefined;
}

export async function resolveFlowUndoTarget(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
    undoUriPrefix: string,
): Promise<FlowUndoResolution | undefined> {
    const prefix = flowsUriPrefix(organization);
    const [requests, responses, undoRequests] =
        await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
            db.requests.getAllWhere(
                'uri_prefix', undoUriPrefix,
            ),
        ]);
    const pairs = documentPairsAt(requests, responses, prefix)
        .filter((pair) => pair.uriId === flowId);
    const current = pairs.at(-1);
    if (current === undefined) return undefined;
    const requestAtById = new Map(
        requests.map((request) => [request.id, request.at]),
    );
    const undoRequestAts = new Set(
        undoRequests.map((request) => request.at),
    );
    const stack: DocumentPair[] = [];
    let pointer = -1;
    for (const pair of pairs) {
        const requestAt = requestAtById.get(pair.id);
        if (
            requestAt !== undefined
            && undoRequestAts.has(requestAt)
        ) {
            pointer -= 1;
        } else {
            stack.length = Math.max(pointer + 1, 0);
            stack.push(pair);
            pointer = stack.length - 1;
        }
    }
    const targetPointer = pointer - 1;
    const target = targetPointer >= 0
        ? stack[targetPointer] : undefined;
    return { current, target };
}

// One row per pair whose state_event_id is NEW — the document
// sequence IS the history, (state_at, id) ascending. Matches
// states.getAllFor(flowId): node-level 'deleted'/'restored'
// events carry NODE entity_ids, never the flow's own, so they
// never appear in a flow's own document pairs either — absent
// from BOTH sides. NOT routed — drift-proof only.
export async function deriveFlowStateHistory(
    db: DbAdapter,
    organization: Id,
    flowId: Id,
): Promise<StateEntity[]> {
    const prefix = flowsUriPrefix(organization);
    const { pairs } = await fetchFlowPairs(db, prefix);
    return stateHistoryFrom(
        documentLifecycleEvents(
            pairs.filter((pair) => pair.uriId === flowId),
        ),
        flowId,
    );
}

// ---- flowGraphBindingsFromPairs — RESTRICT graph-leg core ----
// ---- (Phase 15 Task 1, Author gate 5) ------------------------

// Replays every graphDelta.attributeEvents / memberEvents
// entry across this organization's flow document-pair history
// (full history, never merely the head — resolveFlowGraphOwner's
// own precedent). writeFlowGraphDelta folds the SAME events
// into flow_node_attributes / flow_node_members, so the
// latestByKey/relationFailClosed reduction over either source
// is byte-equal by construction.
//
// nodeFlowIds is the CURRENT flow_id stamp per node id —
// graphDelta.nodes upserts set it, graphDelta.deletions drop
// it when the entityId is still mapped (soft-deleted nodes
// are no longer current). Pair-plane successor of
// flowNodes.getById(flowNodeId).flow_id that RESTRICT uses to
// name referring flows. A later pair that re-upserts the
// node restores the map entry (documentPairsAt ascending).
//
// Do NOT use the client-authored document `graph` snapshot
// (unvalidated against the relation ledgers). dbOrView-shaped
// and opens no nested transaction — callable from WITHIN an
// already-open write-gate transaction (ATTRIBUTE_RESTRICT_
// TABLES already lists requests + responses).
export interface FlowGraphBindingLedgers {
    readonly attributeEvents:
        readonly FlowNodeAttributeEntity[];
    readonly memberEvents: readonly FlowNodeMemberEntity[];
    readonly nodeFlowIds: ReadonlyMap<Id, Id>;
}

function attributeEventOf(
    raw: Record<string, unknown>,
): FlowNodeAttributeEntity {
    const { id: _id, ...fields } = raw;
    return {
        ...validateFlowNodeAttributeEntity(fields),
        id: pickString(raw, 'id'),
    };
}

function memberEventOf(
    raw: Record<string, unknown>,
): FlowNodeMemberEntity {
    const { id: _id, ...fields } = raw;
    return {
        ...validateFlowNodeMemberEntity(fields),
        id: pickString(raw, 'id'),
    };
}

export async function flowGraphBindingsFromPairs(
    dbOrView: DbAdapter,
    organization: Id,
): Promise<FlowGraphBindingLedgers> {
    const prefix = flowsUriPrefix(organization);
    const [requests, responses] = await Promise.all([
        dbOrView.requests.getAllWhere('uri_prefix', prefix),
        dbOrView.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const attributeEvents: FlowNodeAttributeEntity[] = [];
    const memberEvents: FlowNodeMemberEntity[] = [];
    const nodeFlowIds = new Map<Id, Id>();
    for (const pair of documentPairsAt(
        requests, responses, prefix,
    )) {
        const delta = pair.body['graphDelta'];
        if (typeof delta !== 'object' || delta === null) {
            continue;
        }
        const fields = delta as Record<string, unknown>;
        const nodes = fields['nodes'];
        if (Array.isArray(nodes)) {
            for (const item of nodes) {
                if (
                    typeof item !== 'object'
                    || item === null
                ) {
                    continue;
                }
                const node = item as Record<string, unknown>;
                const nodeId = node['id'];
                const flowId = node['flow_id'];
                if (
                    typeof nodeId === 'string'
                    && typeof flowId === 'string'
                ) {
                    // Later pairs win — full-history walk is
                    // (at, id) ascending (documentPairsAt).
                    nodeFlowIds.set(nodeId, flowId);
                }
            }
        }
        // AFTER nodes so a re-upsert in this same delta (or
        // a later pair) restores before/without a delete
        // wiping a current node. Soft-delete posts
        // states 'deleted' only — no attributeEvents
        // 'removed' — so RESTRICT must drop the node map
        // entry or residual 'added' bindings 409 forever.
        const deletions = fields['deletions'];
        if (Array.isArray(deletions)) {
            for (const item of deletions) {
                if (
                    typeof item !== 'object'
                    || item === null
                ) {
                    continue;
                }
                const del = item as Record<string, unknown>;
                const entityId = del['entityId'];
                if (
                    typeof entityId === 'string'
                    && nodeFlowIds.has(entityId)
                ) {
                    nodeFlowIds.delete(entityId);
                }
            }
        }
        const attrs = fields['attributeEvents'];
        if (Array.isArray(attrs)) {
            for (const item of attrs) {
                if (
                    typeof item !== 'object'
                    || item === null
                ) {
                    continue;
                }
                attributeEvents.push(
                    attributeEventOf(
                        item as Record<string, unknown>,
                    ),
                );
            }
        }
        const members = fields['memberEvents'];
        if (Array.isArray(members)) {
            for (const item of members) {
                if (
                    typeof item !== 'object'
                    || item === null
                ) {
                    continue;
                }
                memberEvents.push(
                    memberEventOf(
                        item as Record<string, unknown>,
                    ),
                );
            }
        }
    }
    return {
        attributeEvents: attributeEvents.sort(byIdAscending),
        memberEvents: memberEvents.sort(byIdAscending),
        nodeFlowIds,
    };
}
