import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import { deriveFlow } from '../api/derive-flows.ts';
import { validateStoredGraphJson } from '../api/validators.ts';
import type { StoredGraph } from '../api/types.ts';

// buildFlows() seeds land on Stark (flowSeedBody stamps
// organization_id: STARK_ORGANIZATION); seed-flow-org2 is a
// separate postFlowDocumentOp path not covered here.
const STARK_ORGANIZATION = '1';

// Phase Final Task 2: graph relation ROW halves stripped.
// The decompose covenant re-homes to the pair plane: every
// seeded flow's AUTHORED build-time graph must equal the
// graph deriveFlow returns from the document pair (graph
// field, not graphDelta). Relations are SETS, so comparison
// is order-normalized.
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

test('seed pair-plane graph equals each flow\'s'
    + ' authored graph',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);

    for (const flow of buildFlows()) {
        const expected = validateStoredGraphJson(
            flow.graph, 'seed flow ' + flow.id,
        );
        const derived = await deriveFlow(
            db, STARK_ORGANIZATION, flow.id,
        );
        const actual = validateStoredGraphJson(
            derived.graph, 'derived flow ' + flow.id,
        );
        assert.deepEqual(
            normalizeGraph(actual),
            normalizeGraph(expected),
            'flow ' + flow.id + ' pair graph must '
                + 'equal its authored graph',
        );
    }
});
