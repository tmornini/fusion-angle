import { assert, assertRejects, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
// flipped GET organizations/:id/flows/:id route (Phase 4 Task 8), which
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
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
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
    await ctx.POST(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId
        + '/transition',
        {
        transitionEventId: eventId,
        targetState,
        release: null,
        transitionAt: at,
    });
}

// c→a→z graph: c isCreate, z isArchive, a regular
function buildTestGraph(): {
    graph: StoredGraph;
    createId: string;
    activeId: string;
    doneId: string;
} {
    const createId = generateIdentifier();
    const activeId = generateIdentifier();
    const doneId = generateIdentifier();
    return {
        createId,
        activeId,
        doneId,
        graph: {
            nodes: [
                buildNode(createId, 'Create', {
                    isCreate: true,
                }),
                buildNode(activeId, 'Active'),
                buildNode(doneId, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(),
                    createId, activeId,
                ),
                buildEdge(
                    generateIdentifier(),
                    activeId, doneId,
                ),
            ],
        },
    };
}

// -- Tests ------------------------------------

Deno.test(
    'getFlowStats only includes this flow\'s'
    + ' work orders',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());

        // Flow ZOousbbnzpqlxJExVAruYQ with an Onboarding graph, seeded
        // through the
        // gate-driven create/document-PUT idiom.
        const f1Graph = buildTestGraph();
        await seedFlow(
            ctx, 'ZOousbbnzpqlxJExVAruYQ', 'Onboarding',
            f1Graph.graph,
        );

        // Minimal VALID work-order graphs — the gate
        // demands shape, but getFlowStats reads from
        // flow-work-orders and flow transitions,
        // not from work-order.flow_graph
        // Phase Final Stage B: work_orders table retired —
        // seed through the live document PUT.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA', {
            display_id: 'WO-1',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 1,
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNXXsTEwShOozlQCEWKIIw', {
            display_id: 'WO-2',
            flow_graph: {
                name: 'Onboarding',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 2,
        });

        // yNSSnbrpacodQTzUEcdEVA belongs to ZOousbbnzpqlxJExVAruYQ;
        // yNXXsTEwShOozlQCEWKIIw belongs to OTHER. NAMED re-pin
        // (Task 7): getFlowStats reads
        // organizations/:id/flows/:id/work-orders
        // through the flipped GET.
        const otherFlow = generateIdentifier();
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/work-orders/'
            + generateIdentifier(), {
            flow_id: 'ZOousbbnzpqlxJExVAruYQ',
            work_order_id: 'yNSSnbrpacodQTzUEcdEVA',
            at: daysAgo(45),
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + otherFlow + '/work-orders/'
            + generateIdentifier(), {
            flow_id: otherFlow,
            work_order_id: 'yNXXsTEwShOozlQCEWKIIw',
            at: daysAgo(45),
        });

        // yNSSnbrpacodQTzUEcdEVA: '' → create → active → done
        // ~35 days in the active node, within 90-day window
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), f1Graph.createId,
            daysAgo(40),
        );
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), f1Graph.activeId,
            daysAgo(40),
        );
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), f1Graph.doneId,
            daysAgo(5),
        );

        // Other flow: '' → create. Must not affect stats.
        await transitionWorkOrder(
            ctx, 'yNXXsTEwShOozlQCEWKIIw',
            generateIdentifier(), f1Graph.createId,
            daysAgo(40),
        );

        const { model, graph } =
            await getFlowStats(ctx, 'ZOousbbnzpqlxJExVAruYQ', Date.now());

        assertStrictEquals(graph.name, 'Onboarding');
        assertStrictEquals(
            model.completedWorkOrderCount, 1,
        );
        assertStrictEquals(
            model.incompleteWorkOrderCount, 0,
        );
        const a =
            model.nodes.find(
                n => n.id === f1Graph.activeId,
            )!;
        assert(
            a !== undefined,
            'active node must be present',
        );
        assert(
            a.heatPct > 0,
            `expected heatPct > 0, got ${a.heatPct}`,
        );
    },
);

Deno.test(
    'getFlowStats unknown flowId propagates'
    + ' the underlying error',
    async () => {
        const { ctx } = await adminContext();
        await assertRejects(
            () => getFlowStats(
                ctx, generateIdentifier(), Date.now(),
            ),
        );
        // getFlowStats fans four reads out through
        // Promise.all; getFlowGraph's rejection settles the
        // caller while the other three are still in flight.
        // Yield a macrotask turn so those ops complete in
        // the test that started them.
        await new Promise(resolve => setTimeout(resolve, 0));
    },
);

Deno.test(
    'getFlowStats lays out an auto-layout flow so the'
    + ' returned graph and stat model are not degenerate',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        // seedFlow saves is_auto_layout true; buildTestGraph
        // seeds c→a→z all at (0,0).
        const autoGraph = buildTestGraph();
        await seedFlow(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'AutoLayout'
            , autoGraph.graph);
        // Phase Final Stage B: work_orders table retired.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA', {
            display_id: 'WO-1',
            flow_graph: {
                name: 'AutoLayout',
                lockTimeout: 0, nodes: [], edges: [],
            },
            position: 1,
        });
        // NAMED re-pin (Task 7): same reason as above.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/work-orders/'
            + generateIdentifier(), {
            flow_id: 'ZOousbbnzpqlxJExVAruYQ',
            work_order_id: 'yNSSnbrpacodQTzUEcdEVA',
            at: daysAgo(10),
        });
        await transitionWorkOrder(
            ctx, 'yNSSnbrpacodQTzUEcdEVA',
            generateIdentifier(), autoGraph.createId,
            daysAgo(10),
        );
        const { model, graph } =
            await getFlowStats(ctx, 'ZOousbbnzpqlxJExVAruYQ', Date.now());
        const graphPos = new Set(
            graph.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assertStrictEquals(graphPos.size, 3);
        const c = graph.nodes.find(
            n => n.id === autoGraph.createId,
        )!;
        const z = graph.nodes.find(
            n => n.id === autoGraph.doneId,
        )!;
        assert(c.positionX < z.positionX);
        const modelPos = new Set(
            model.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        );
        assertStrictEquals(modelPos.size, 3);
    },
);
