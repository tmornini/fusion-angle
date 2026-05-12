import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getFlowStats,
} from '../web-app/app/adapters/flow-stats.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../api/types.ts';

// -- Fixture helpers --------------------------

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
        description: '',
        positionX: 0,
        positionY: 0,
        isStart: false,
        isComplete: false,
        crew: { kind: 'unassigned' },
        fields: [],
        ...overrides,
    };
}

function buildEdge(
    id: string,
    fromNodeId: string,
    toNodeId: string,
): GraphEdge {
    return {
        id,
        name: '',
        description: '',
        fromNodeId,
        toNodeId,
    };
}

function buildFlow(
    name: string,
    graph: StoredGraph,
): Omit<FlowEntity, 'id'> {
    return {
        name,
        description: '',
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

// Timestamps relative to now so the 90-day window
// check stays valid regardless of when the test runs.
function daysAgo(d: number): string {
    return new Date(
        Date.now() - d * 24 * 3600 * 1000,
    ).toISOString();
}

// c→a→z graph: c isStart, z isComplete, a regular
function buildTestGraph(): StoredGraph {
    return {
        nodes: [
            buildNode('c', 'Create', {
                isStart: true,
            }),
            buildNode('a', 'Active'),
            buildNode('z', 'Done', {
                isComplete: true,
            }),
        ],
        edges: [
            buildEdge('e-ca', 'c', 'a'),
            buildEdge('e-az', 'a', 'z'),
        ],
    };
}

// -- Tests ------------------------------------

test(
    'getFlowStats only includes this flow\'s'
    + ' work orders',
    async () => {
        const db = new MemoryDbAdapter();

        // Flow f1 with an Onboarding graph
        await db.flows.put(
            'f1',
            buildFlow('Onboarding', buildTestGraph()),
        );

        // Minimal work-order rows (no flow_graph
        // needed — getFlowStats reads from
        // flow-work-orders and flow transitions,
        // not from work-order.flow_graph)
        await db.workOrders.put('wo1', {
            display_id: 'WO-1',
            flow_graph:
                jsonObjectField({}) as never,
            position: 1,
            created_at: daysAgo(45),
        });
        await db.workOrders.put('wo2', {
            display_id: 'WO-2',
            flow_graph:
                jsonObjectField({}) as never,
            position: 2,
            created_at: daysAgo(45),
        });

        // wo1 belongs to f1; wo2 belongs to OTHER
        await db.flowWorkOrders.put('fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            created_at: daysAgo(45),
        });
        await db.flowWorkOrders.put('fwo2', {
            flow_id: 'OTHER',
            work_order_id: 'wo2',
            created_at: daysAgo(45),
        });

        // wo1: '' → c (daysAgo(40)), c → a
        // (daysAgo(40)), a → z (daysAgo(5))
        // ~35 days in node 'a', well within 90-day window
        await db.workOrderTransitions.put('t1a', {
            work_order_id: 'wo1',
            from_node_id: '',
            to_node_id: 'c',
            person_id: 'p1',
            transitioned_at: daysAgo(40),
        });
        await db.workOrderTransitions.put('t1b', {
            work_order_id: 'wo1',
            from_node_id: 'c',
            to_node_id: 'a',
            person_id: 'p1',
            transitioned_at: daysAgo(40),
        });
        await db.workOrderTransitions.put('t1c', {
            work_order_id: 'wo1',
            from_node_id: 'a',
            to_node_id: 'z',
            person_id: 'p1',
            transitioned_at: daysAgo(5),
        });

        // wo2 (OTHER flow): '' → c (daysAgo(40))
        // Must not affect f1 stats
        await db.workOrderTransitions.put('t2a', {
            work_order_id: 'wo2',
            from_node_id: '',
            to_node_id: 'c',
            person_id: 'p1',
            transitioned_at: daysAgo(40),
        });

        const ctx = createRequestContext(db);
        const { model, graph } =
            await getFlowStats(ctx, 'f1');

        assert.equal(graph.name, 'Onboarding');
        assert.equal(
            model.completedWorkOrderCount, 1,
        );
        assert.equal(
            model.incompleteWorkOrderCount, 0,
        );
        const a =
            model.nodes.find(n => n.id === 'a')!;
        assert.ok(
            a !== undefined,
            'node a must be present',
        );
        assert.ok(
            a.heatPct > 0,
            `expected heatPct > 0, got ${a.heatPct}`,
        );
    },
);

test(
    'getFlowStats unknown flowId propagates'
    + ' the underlying error',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => getFlowStats(ctx, 'nope'),
        );
    },
);

test(
    'getFlowStats lays out an auto-layout flow so the'
    + ' returned graph and stat model are not degenerate',
    async () => {
        const db = new MemoryDbAdapter();
        // buildFlow is is_auto_layout; buildTestGraph
        // seeds c→a→z all at (0,0).
        await db.flows.put(
            'f1',
            buildFlow('AutoLayout', buildTestGraph()),
        );
        await db.workOrders.put('wo1', {
            display_id: 'WO-1',
            flow_graph: jsonObjectField({}) as never,
            position: 1,
            created_at: daysAgo(10),
        });
        await db.flowWorkOrders.put('fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            created_at: daysAgo(10),
        });
        await db.workOrderTransitions.put('t1', {
            work_order_id: 'wo1',
            from_node_id: '',
            to_node_id: 'c',
            person_id: 'p1',
            transitioned_at: daysAgo(10),
        });
        const ctx = createRequestContext(db);
        const { model, graph } =
            await getFlowStats(ctx, 'f1');
        const graphPos = new Set(
            graph.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assert.equal(graphPos.size, 3);
        const c = graph.nodes.find(n => n.id === 'c')!;
        const z = graph.nodes.find(n => n.id === 'z')!;
        assert.ok(c.positionX < z.positionX);
        const modelPos = new Set(
            model.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assert.equal(modelPos.size, 3);
    },
);
