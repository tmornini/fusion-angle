import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
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
import {
    seedAdminSchema,
} from './test-fixtures.ts';

// -- Fixture helpers --------------------------

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
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
        fromNodeId,
        toNodeId,
    };
}

// The flow row stores only scalar fields — the graph lives in
// the relation tables (seeded separately via seedFlowRelations).
function buildFlow(
    name: string,
): Omit<FlowEntity, 'id'> {
    return {
        organization_id: '1',
        name,
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

// Seed the four relation tables to match a StoredGraph —
// GET /flows/:id reassembles the read graph from these rows,
// so the stored blob is never the read source. Direct puts
// with no 'deleted' state event leave every node/edge live.
async function seedFlowRelations(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const at = '2026-01-01T00:00:00.000000Z';
    for (const n of graph.nodes) {
        await db.flowNodes.put(n.id, {
            flow_id: flowId,
            name: n.name,
            position_x: n.positionX,
            position_y: n.positionY,
            is_create: n.isCreate,
            is_archive: n.isArchive,
            task_instructions: n.taskInstructions,
            at,
        });
        for (const mid of n.memberIds) {
            await db.flowNodeMembers.put(
                `${n.id}-${mid}`,
                {
                    flow_node_id: n.id,
                    member_id: mid,
                    action: 'added',
                    at,
                },
            );
        }
        for (const a of n.attributes) {
            await db.flowNodeAttributes.put(
                `${n.id}-${a.attributeId}`,
                {
                    flow_node_id: n.id,
                    attribute_id: a.attributeId,
                    mode: a.mode,
                    is_required: a.isRequired,
                    action: 'added',
                    at,
                },
            );
        }
    }
    for (const e of graph.edges) {
        await db.flowEdges.put(e.id, {
            flow_id: flowId,
            name: e.name,
            from_node_id: e.fromNodeId,
            to_node_id: e.toNodeId,
            at,
        });
    }
}

// Timestamps relative to now so the 90-day window
// check stays valid regardless of when the test runs.
function daysAgo(d: number): string {
    return new Date(
        Date.now() - d * 24 * 3600 * 1000,
    ).toISOString()
        .replace('Z', '000Z');
}

// c→a→z graph: c isCreate, z isArchive, a regular
function buildTestGraph(): StoredGraph {
    return {
        nodes: [
            buildNode('c', 'Create', {
                isCreate: true,
            }),
            buildNode('a', 'Active'),
            buildNode('z', 'Done', {
                isArchive: true,
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
        await seedAdminSchema(db);

        // Flow f1 with an Onboarding graph — seed both the
        // blob (for shape) and the relations (the read source
        // GET /flows/:id reassembles from).
        const f1Graph = buildTestGraph();
        await db.flows.put(
            'f1',
            buildFlow('Onboarding'),
        );
        await seedFlowRelations(db, 'f1', f1Graph);

        // Minimal VALID work-order graphs — the gate
        // demands shape, but getFlowStats reads from
        // flow-work-orders and flow transitions,
        // not from work-order.flow_graph
        await db.workOrders.put('wo1', {
            organization_id: '1',
            display_id: 'WO-1',
            flow_graph: jsonObjectField({
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            }),
            position: 1,
        });
        await db.workOrders.put('wo2', {
            organization_id: '1',
            display_id: 'WO-2',
            flow_graph: jsonObjectField({
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            }),
            position: 2,
        });

        // wo1 belongs to f1; wo2 belongs to OTHER
        await db.flowWorkOrders.put('fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            at: daysAgo(45),
        });
        await db.flowWorkOrders.put('fwo2', {
            flow_id: 'OTHER',
            work_order_id: 'wo2',
            at: daysAgo(45),
        });

        // wo1: '' → c (daysAgo(40)), c → a
        // (daysAgo(40)), a → z (daysAgo(5))
        // ~35 days in node 'a', well within 90-day window
        await db.states.put('t1a', {
            entity_id: 'wo1',
            state: 'c',
            member_id: 'p1',
            at: daysAgo(40),
        });
        await db.states.put('t1b', {
            entity_id: 'wo1',
            state: 'a',
            member_id: 'p1',
            at: daysAgo(40),
        });
        await db.states.put('t1c', {
            entity_id: 'wo1',
            state: 'z',
            member_id: 'p1',
            at: daysAgo(5),
        });

        // wo2 (OTHER flow): '' → c (daysAgo(40))
        // Must not affect f1 stats
        await db.states.put('t2a', {
            entity_id: 'wo2',
            state: 'c',
            member_id: 'p1',
            at: daysAgo(40),
        });

        const ctx = createRequestContext(db, await devToken());
        const { model, graph } =
            await getFlowStats(ctx, 'f1', Date.now());

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
        const { ctx } = await adminContext();
        await assert.rejects(
            () => getFlowStats(ctx, 'nope', Date.now()),
        );
    },
);

test(
    'getFlowStats lays out an auto-layout flow so the'
    + ' returned graph and stat model are not degenerate',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        // buildFlow is is_auto_layout; buildTestGraph
        // seeds c→a→z all at (0,0). Seed the relations too —
        // GET /flows/:id reassembles the read graph from them.
        const autoGraph = buildTestGraph();
        await db.flows.put(
            'f1',
            buildFlow('AutoLayout'),
        );
        await seedFlowRelations(db, 'f1', autoGraph);
        await db.workOrders.put('wo1', {
            organization_id: '1',
            display_id: 'WO-1',
            flow_graph: jsonObjectField({
                name: 'AutoLayout',
                lockTimeout: 0, nodes: [], edges: [],
            }),
            position: 1,
        });
        await db.flowWorkOrders.put('fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            at: daysAgo(10),
        });
        await db.states.put('t1', {
            entity_id: 'wo1',
            state: 'c',
            member_id: 'p1',
            at: daysAgo(10),
        });
        const ctx = createRequestContext(db, await devToken());
        const { model, graph } =
            await getFlowStats(ctx, 'f1', Date.now());
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
