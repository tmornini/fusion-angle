import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, FlowWithGraph, StateEntity } from './types.ts';
import {
    pickString, pickNumber, pickBoolean, pickJsonObjectField,
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
// case proves this, not just asserts it).
export function flowEntityOf(
    document: DerivedDocument,
    organization: Id,
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
        flows.push(flowEntityOf(document, organization));
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
    const history = stateHistoryFrom(
        documentLifecycleEvents(
            pairs.filter((pair) => pair.uriId === flowId),
        ),
        flowId,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw new EntityNotFoundError(FLOWS_TABLE, flowId);
    }
    return flowEntityOf(document, organization);
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
