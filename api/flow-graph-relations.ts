import { latestByKey } from '../shared/ledger-reduction.ts';
import type {
    FlowNodeId,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    FlowNodeRelationAction,
    GraphNode,
    GraphEdge,
    StoredGraph,
    MemberId,
    NodeAttribute,
} from './types.ts';
import { storedGraph } from './types.ts';
import {
    type FlowGraphDelta,
    asStoredGraph,
} from './validators.ts';
import { byIdAscending } from './derive-documents.ts';

// On an equal-`at` tie a 'removed' outranks an 'added'
// regardless of row order — the union's dissolution wins on
// every backend, mirroring role_grants' revoke-beats-grant.
// Equal actions fall to the id tail for determinism.
const RELATION_ACTION_RANK:
    Record<FlowNodeRelationAction, number> = {
    removed: 1,
    added: 0,
};

export function relationFailClosed<
    T extends {
        action: FlowNodeRelationAction;
        at: string;
        id: string;
    },
>(candidate: T, incumbent: T): boolean {
    if (candidate.at !== incumbent.at) {
        return candidate.at > incumbent.at;
    }
    const c = RELATION_ACTION_RANK[candidate.action];
    const i = RELATION_ACTION_RANK[incumbent.action];
    if (c !== i) return c > i;
    return candidate.id > incumbent.id;
}

// The member ids a node CURRENTLY joins: the latest action per
// member within the node's ledger rows — an 'added' with no
// later 'removed'. Derive-from-ledger, never a stored set.
export function currentNodeMemberIds(
    rows: readonly FlowNodeMemberEntity[],
    flowNodeId: FlowNodeId,
): MemberId[] {
    const forNode = rows.filter(
        row => row.flow_node_id === flowNodeId,
    );
    const latest = latestByKey(
        forNode, row => row.member_id, relationFailClosed,
    );
    const ids: MemberId[] = [];
    for (const [, last] of latest) {
        if (last.action === 'added') ids.push(last.member_id);
    }
    return ids;
}

// The attributes a node CURRENTLY carries, mapped storage →
// domain: the latest action per attribute, kept when 'added'.
// The winning row carries the live mode/is_required — a
// mode/required change is a NEW 'added' row, never an UPDATE,
// so latest-wins reads the current payload for free.
export function currentNodeAttributes(
    rows: readonly FlowNodeAttributeEntity[],
    flowNodeId: FlowNodeId,
): NodeAttribute[] {
    const forNode = rows.filter(
        row => row.flow_node_id === flowNodeId,
    );
    const latest = latestByKey(
        forNode, row => row.attribute_id, relationFailClosed,
    );
    const attributes: NodeAttribute[] = [];
    for (const [, last] of latest) {
        if (last.action === 'added') {
            attributes.push({
                attributeId: last.attribute_id,
                mode: last.mode,
                isRequired: last.is_required,
            });
        }
    }
    return attributes;
}

// Reassemble the domain StoredGraph from its relations — the
// READ seam's inverse of the save delta. Nodes/edges are the
// live (tombstone-filtered) entity rows handed in; members and
// attributes derive from their ledgers per node. The domain
// GraphNode/GraphEdge shape is preserved exactly, so the
// canvas, stats, mermaid, and hazard readers are untouched.
export function reassembleStoredGraph(
    nodeRows: readonly FlowNodeEntity[],
    edgeRows: readonly FlowEdgeEntity[],
    memberRows: readonly FlowNodeMemberEntity[],
    attributeRows: readonly FlowNodeAttributeEntity[],
): StoredGraph {
    const nodes: GraphNode[] = nodeRows.map(node => ({
        id: node.id,
        name: node.name,
        positionX: node.position_x,
        positionY: node.position_y,
        isCreate: node.is_create,
        isArchive: node.is_archive,
        memberIds: currentNodeMemberIds(memberRows, node.id),
        attributes: currentNodeAttributes(
            attributeRows, node.id),
        taskInstructions: node.task_instructions,
    }));
    const edges: GraphEdge[] = edgeRows.map(edge => ({
        id: edge.id,
        name: edge.name,
        fromNodeId: edge.from_node_id,
        toNodeId: edge.to_node_id,
    }));
    return { nodes, edges };
}

// Reduce a CREATE-shaped FlowGraphDelta into a StoredGraph — the
// pure counterpart of reassembleStoredGraph for a delta that has
// never touched storage: a create delta's `deletions` is always
// empty, so every node/edge row is an upsert and every member/
// attribute event is current by construction — the SAME row
// shapes reassembleStoredGraph already reduces (FlowNodeRowBody/
// FlowEdgeRowBody/FlowNodeMemberRowBody/FlowNodeAttributeRowBody
// mirror the entity rows field-for-field). Exported so the live
// POST /flows handler and the seed's pass-1 pair body-builder
// share ONE reduction for the synthesized document's graph field
// — never two hand-rolled constructions of the same value.
export function reduceCreateGraphDelta(
    delta: FlowGraphDelta,
): StoredGraph {
    return reassembleStoredGraph(
        delta.nodes, delta.edges,
        delta.memberEvents, delta.attributeEvents,
    );
}

// The message-plane flows derivation's ONE flows-novel
// reduction (Task 7, design decision 1): a document PUT's
// graph value is the client-authored working snapshot,
// carried verbatim by postFlowDocumentOp — its nodes[]/edges[]
// arrive in whatever order the client happened to serialize.
// The OLD plane's own GET reassembles nodes[]/edges[] from
// flow_nodes/flow_edges via getAllWhere, which returns rows in
// PRIMARY-KEY (id) order on IndexedDB — so the two orders
// already coincide there (H7: invisible on IndexedDB) — but in
// ARRIVAL order on the memory/localStorage tiers, where they
// can diverge (load-bearing there). Re-sorting nodes[]/edges[]
// ascending-id here makes the derived side match the OLD
// plane's IndexedDB behavior byte-exactly regardless of which
// backend actually ran the comparison. Within-node
// memberIds[]/attributes[] pass through UNSORTED — a cosmetic
// order change design decision 1 accepts: currentNodeMemberIds/
// currentNodeAttributes above already return them in THEIR OWN
// reduction order (a Map's insertion order), which neither
// plane could re-derive from the other's array order alone.
export function normalizedStoredGraph(
    value: unknown,
): Record<string, unknown> {
    const parsed = asStoredGraph(
        value, 'normalizedStoredGraph.graph',
    );
    return storedGraph({
        nodes: [...parsed.nodes].sort(byIdAscending),
        edges: [...parsed.edges].sort(byIdAscending),
    });
}
