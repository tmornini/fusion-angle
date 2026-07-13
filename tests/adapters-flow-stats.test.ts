import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
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

// A work-order transition, posted through the SAME
// wire-reachable POST the live route serves
// (postWorkOrderTransitionOp) — required for the flipped
// history derive (Task 7), which
// getTransitionEventsByWorkOrder reads, to derive it. A raw
// db.states.put left no message pair at this address.
async function transitionWorkOrder(
    ctx: RequestContext,
    workOrderId: string,
    eventId: string,
    targetState: string,
    at: string,
): Promise<void> {
    await ctx.POST(`work-orders/${workOrderId}/transition`, {
        transitionEventId: eventId,
        targetState,
        fieldValues: [],
        release: null,
        transitionAt: at,
    });
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
        const db = memoryDbAdapter();
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
        // Phase Final Stage B: work_orders table retired —
        // seed through the live document PUT.
        await ctx.PUT('work-orders/wo1', {
            display_id: 'WO-1',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 1,
        });
        await ctx.PUT('work-orders/wo2', {
            display_id: 'WO-2',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 2,
        });

        // wo1 belongs to f1; wo2 belongs to OTHER. NAMED re-pin
        // (Task 7): getFlowStats reads flows/:id/work-orders
        // through the flipped GET.
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
        await transitionWorkOrder(ctx, 'wo1', 't1a', 'c', daysAgo(40));
        await transitionWorkOrder(ctx, 'wo1', 't1b', 'a', daysAgo(40));
        await transitionWorkOrder(ctx, 'wo1', 't1c', 'z', daysAgo(5));

        // wo2 (OTHER flow): '' → c (daysAgo(40))
        // Must not affect f1 stats
        await transitionWorkOrder(ctx, 'wo2', 't2a', 'c', daysAgo(40));

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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        // seedFlow saves is_auto_layout true; buildTestGraph
        // seeds c→a→z all at (0,0).
        const autoGraph = buildTestGraph();
        await seedFlow(ctx, 'f1', 'AutoLayout', autoGraph);
        // Phase Final Stage B: work_orders table retired.
        await ctx.PUT('work-orders/wo1', {
            display_id: 'WO-1',
            flow_graph: {
                name: 'AutoLayout',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 1,
        });
        // NAMED re-pin (Task 7): same reason as above.
        await ctx.PUT('flows/f1/work-orders/fwo1', {
            flow_id: 'f1',
            work_order_id: 'wo1',
            at: daysAgo(10),
        });
        await transitionWorkOrder(ctx, 'wo1', 't1', 'c', daysAgo(10));
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
