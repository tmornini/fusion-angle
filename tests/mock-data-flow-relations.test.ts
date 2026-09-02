import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { buildFlows } from '../api/mock-data/flows.ts';
import { deriveFlow } from '../api/derive-flows.ts';
import { asStoredGraph } from '../api/validators.ts';
import type { StoredGraph } from '../api/types.ts';
import { seededMockDb } from './mock-seed.ts';

// buildFlows() seeds land on Stark (flowSeedBody stamps
// organization_id: STARK_ORGANIZATION); seed-flow-org2 is a
// separate postFlowDocumentOp path not covered here.
const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

// Phase Final Task 2: graph relation ROW halves stripped.
// The decompose covenant re-homes to the message plane: every
// seeded flow's AUTHORED build-time graph must equal the
// graph deriveFlow returns from the document message pair (graph
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

Deno.test('seed message-plane graph equals each flow\'s'
    + ' authored graph',
async () => {
    const db = await seededMockDb();

    for (const flow of buildFlows()) {
        const expected = asStoredGraph(
            flow.graph, 'seed flow ' + flow.id,
        );
        const derived = await deriveFlow(
            db, STARK_ORGANIZATION, flow.id,
        );
        const actual = asStoredGraph(
            derived.graph, 'derived flow ' + flow.id,
        );
        assertEquals(
            normalizeGraph(actual),
            normalizeGraph(expected),
            'flow ' + flow.id + ' pair graph must '
                + 'equal its authored graph',
        );
    }
});

Deno.test('Fusion Angle Flow keeps its seed id', () => {
    const flow = buildFlows().find(
        (row) => row.name === 'Fusion Angle Flow',
    );
    assert(flow, 'Fusion Angle Flow must exist');
    assertStrictEquals(
        flow!.id,
        'GgfDbXOJUvvaCekCTcvhuw',
    );
});
