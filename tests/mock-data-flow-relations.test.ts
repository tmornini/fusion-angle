import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import {
    reassembleStoredGraph,
} from '../api/flow-graph-relations.ts';
import { validateStoredGraphJson } from '../api/validators.ts';
import type { StoredGraph } from '../api/types.ts';

// The dual-seed covenant (F-131 step 2): every seeded flow's
// graph blob decomposes into flow_nodes / flow_edges /
// flow_node_members / flow_node_attributes rows that, run back
// through reassembleStoredGraph, reproduce the blob exactly.
// Relations are SETS, so the comparison is order-normalized —
// the covenant is which node carries which members/attributes,
// not array order.
function normalizeGraph(graph: StoredGraph): StoredGraph {
    return {
        nodes: [...graph.nodes]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(node => ({
                ...node,
                memberIds: [...node.memberIds].sort(),
                attributes: [...node.attributes].sort(
                    (a, b) => a.attributeId.localeCompare(
                        b.attributeId,
                    ),
                ),
            })),
        edges: [...graph.edges].sort(
            (a, b) => a.id.localeCompare(b.id),
        ),
    };
}

test('dual-seed decomposes each flow graph into '
    + 'relations that reassemble to the blob', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);

    const allNodes = await db.flowNodes.getAll();
    const allEdges = await db.flowEdges.getAll();
    const allMembers = await db.flowNodeMembers.getAll();
    const allAttributes =
        await db.flowNodeAttributes.getAll();

    for (const flow of buildFlows()) {
        const expected = validateStoredGraphJson(
            flow.graph, 'seed flow ' + flow.id,
        );
        const nodeRows = allNodes.filter(
            node => node.flow_id === flow.id,
        );
        const edgeRows = allEdges.filter(
            edge => edge.flow_id === flow.id,
        );
        const reassembled = reassembleStoredGraph(
            nodeRows, edgeRows, allMembers, allAttributes,
        );
        assert.deepEqual(
            normalizeGraph(reassembled),
            normalizeGraph(expected),
            'flow ' + flow.id + ' relations must '
                + 'reassemble to its graph blob',
        );
    }
});
