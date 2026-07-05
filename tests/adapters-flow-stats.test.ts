import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getFlowStats,
} from '../web-app/app/adapters/flow-stats.ts';
import {
    postFlowCreation,
    putFlow,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
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

// Seed a flow through the SAME gate-driven create/document-PUT
// idiom the live route uses (postFlowCreation + putFlow), so a
// message pair exists at this flow's address — required for the
// flipped GET flows/:id route (Phase 4 Task 8), which
// getFlowStats reads via getFlowGraph, to derive it.
// postFlowCreation seeds a default start/complete graph; the
// immediate putFlow overwrites it with the caller's own graph.
async function seedFlow(
    ctx: RequestContext,
    flowId: string,
    name: string,
    graph: StoredGraph,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'p-' + flowId,
        name,
    });
    await putFlow(ctx, flowId, {
        name,
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
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
        const ctx = createRequestContext(db, await devToken());

        // Flow f1 with an Onboarding graph, seeded through the
        // gate-driven create/document-PUT idiom.
        const f1Graph = buildTestGraph();
        await seedFlow(ctx, 'f1', 'Onboarding', f1Graph);

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

        // wo1 belongs to f1; wo2 belongs to OTHER. NAMED re-pin
        // (Task 7, the projects/:id/flows precedent): getFlowStats
        // reads flows/:id/work-orders through the flipped GET —
        // a raw db.flowWorkOrders.put leaves no message pair at
        // this address, so each join must land through the SAME
        // wire-reachable PUT the live route serves. The
        // workOrders.put entity rows above STAY raw — getFlowStats
        // never reads a flipped work-orders entity route.
        await ctx.PUT('flows/f1/work-orders/fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            at: daysAgo(45),
        });
        await ctx.PUT('flows/OTHER/work-orders/fwo2', {
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
        const ctx = createRequestContext(db, await devToken());
        // seedFlow saves is_auto_layout true; buildTestGraph
        // seeds c→a→z all at (0,0).
        const autoGraph = buildTestGraph();
        await seedFlow(ctx, 'f1', 'AutoLayout', autoGraph);
        await db.workOrders.put('wo1', {
            organization_id: '1',
            display_id: 'WO-1',
            flow_graph: jsonObjectField({
                name: 'AutoLayout',
                lockTimeout: 0, nodes: [], edges: [],
            }),
            position: 1,
        });
        // NAMED re-pin (Task 7): same reason as above.
        await ctx.PUT('flows/f1/work-orders/fwo1', {
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
