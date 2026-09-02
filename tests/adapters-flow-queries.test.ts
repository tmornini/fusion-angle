import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    putProject,
} from '../web-app/app/adapters/projects.ts';
import {
    getFlowsByProject,
    getFlowGraph,
    getFlowsWithProjectNames,
    getProjectFlowEntities,
    type FlowGraph,
} from
'../web-app/app/adapters/flow-queries.ts';
import type {
    GraphNode,
    GraphEdge,
    ProjectFlowEntity,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import { NODE_WIDTH } from '../web-app/app/flow-layout.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
    const ctx = createRequestContext(db, await organizationToken());
    return { db, ctx };
}

function buildNode(
    id: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name: id,
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
        name: 'Transition',
        fromNodeId,
        toNodeId,
    };
}

async function createBaseFlow(
    ctx: RequestContext,
    flowId: string,
    projectId: string,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId,
        name: 'Flow ' + flowId,
    });
}

async function saveGraph(
    ctx: RequestContext,
    flowId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await putFlow(ctx, flowId, {
        name: 'Flow ' + flowId,
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    });
}

// Seeds a project through the SAME document PUT the live route
// uses (putProject), so a message pair exists at this project's
// address — required for the flipped GET projects route
// (Phase 3 Task 6), which getFlowsWithProjectNames /
// getProjectFlowEntities read, to derive it. A SYNTHESIZED
// trio (this helper never carried one) — the state itself is
// irrelevant to every caller here.
async function seedProject(
    ctx: RequestContext,
    id: string,
    title: string,
): Promise<void> {
    await putProject(ctx, id, {
        title,
        description: '',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 0,
        actual_cost: 0,
        position: 0,
        state: 'approved',
    });
}

Deno.test(
    'getFlowGraph returns the parsed graph'
    + ' with metadata and counts',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        const startId = generateIdentifier();
        const midId = generateIdentifier();
        const endId = generateIdentifier();
        const edge2Id = generateIdentifier();
        const start = buildNode(startId, {
            isCreate: true,
        });
        const mid = buildNode(midId);
        const end = buildNode(endId, {
            isArchive: true,
        });
        const YiJPbufDpkyrZcZCYbUJpg = buildEdge(
            generateIdentifier(), startId, midId,
        );
        const e2 = buildEdge(
            edge2Id, midId, endId,
        );
        await saveGraph(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
            [start, mid, end], [YiJPbufDpkyrZcZCYbUJpg, e2],
        );
        const g: FlowGraph = await getFlowGraph(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assertStrictEquals(g.id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(g.name, 'Flow aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(g.isLocked, false);
        assertStrictEquals(g.isAutoLayout, false);
        assertStrictEquals(g.isAutoFit, false);
        assertStrictEquals(
            g.lockTimeout, DEFAULT_LOCK_TIMEOUT,
        );
        assertStrictEquals(g.nodes.length, 3);
        assertStrictEquals(g.edges.length, 2);
        assert(
            g.nodes.some(n => n.id === midId),
        );
        assert(
            g.edges.some(e => e.id === edge2Id),
        );
    },
);

Deno.test(
    'getFlowGraph reflects flag changes'
    + ' saved on the flow',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        await putFlow(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
            {
                name: 'Locked Flow',
                isLocked: true,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: 900,
                nodes: [buildNode(generateIdentifier())],
                edges: [],
            },
        );
        const g = await getFlowGraph(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
        );
        assertStrictEquals(g.name, 'Locked Flow');
        assertStrictEquals(g.isLocked, true);
        assertStrictEquals(g.isAutoLayout, true);
        assertStrictEquals(g.isAutoFit, true);
        assertStrictEquals(g.lockTimeout, 900);
    },
);

Deno.test(
    'getFlowsByProject returns only flows'
    + ' linked to the given project',
    async () => {
        const { db } = await setupMemDb();
        const WeXjAaAxGSpLpamfEuvcww = createRequestContext(db
            , await organizationToken());
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'pnXmXrxOWayANgDLdCjuBw'
            , 'Project One');
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'prBESZPjJDiuXCeZLmbiVw'
            , 'Project Two');
        const flow2 = generateIdentifier();
        const flow3 = generateIdentifier();
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww
            , 'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw');
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww, flow2
            , 'pnXmXrxOWayANgDLdCjuBw');
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww, flow3
            , 'prBESZPjJDiuXCeZLmbiVw');
        const p1Flows = await getFlowsByProject(
            createRequestContext(db, await organizationToken())
                , 'pnXmXrxOWayANgDLdCjuBw',
        );
        const p2Flows = await getFlowsByProject(
            createRequestContext(db, await organizationToken())
                , 'prBESZPjJDiuXCeZLmbiVw',
        );
        const p1Ids = p1Flows
            .map(f => f.id).sort();
        assertEquals(
            p1Ids, [
                'aEsGMmBEFaVdWihhHXwCbw', flow2,
            ].sort(),
        );
        assertStrictEquals(p2Flows.length, 1);
        assertStrictEquals(p2Flows[0]!.id, flow3);
    },
);

Deno.test(
    'getFlowsByProject returns an empty list'
    + ' for a project with no flows',
    async () => {
        const { db, ctx } = await setupMemDb();
        await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Project One');
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        const rows = await getFlowsByProject(
            createRequestContext(
                db, await organizationToken(),
            ), generateIdentifier(),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'getFlowsByProject carries node and'
    + ' edge counts for each flow',
    async () => {
        const { db, ctx } = await setupMemDb();
        await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Project One');
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        const a = generateIdentifier();
        const b = generateIdentifier();
        await saveGraph(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
            [buildNode(a), buildNode(b)],
            [buildEdge(generateIdentifier(), a, b)],
        );
        const rows = await getFlowsByProject(
            createRequestContext(db, await organizationToken())
                , 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.nodeCount, 2);
        assertStrictEquals(rows[0]!.edgeCount, 1);
    },
);

Deno.test(
    'getFlowsWithProjectNames pairs each'
    + ' flow with its project name',
    async () => {
        const { db } = await setupMemDb();
        const WeXjAaAxGSpLpamfEuvcww = createRequestContext(db
            , await organizationToken());
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'pnXmXrxOWayANgDLdCjuBw'
            , 'Project One');
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'prBESZPjJDiuXCeZLmbiVw'
            , 'Project Two');
        const flow2 = generateIdentifier();
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww
            , 'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw');
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww, flow2
            , 'prBESZPjJDiuXCeZLmbiVw');
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db, await organizationToken()),
        );
        assertStrictEquals(pairs.length, 2);
        const byFlow = new Map(
            pairs.map(
                p => [p.summary.id, p.projectName],
            ),
        );
        assertStrictEquals(
            byFlow.get('aEsGMmBEFaVdWihhHXwCbw'), 'Project One',
        );
        assertStrictEquals(
            byFlow.get(flow2), 'Project Two',
        );
    },
);

Deno.test(
    'getFlowsWithProjectNames yields undefined'
    + ' when the linked project is gone',
    async () => {
        const { db } = await setupMemDb();
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', generateIdentifier(),
        );
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db, await organizationToken()),
        );
        assertStrictEquals(pairs.length, 1);
        assertStrictEquals(pairs[0]!.summary.id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(
            pairs[0]!.projectName, undefined,
        );
    },
);

Deno.test(
    'getFlowsWithProjectNames includes node'
    + ' and edge counts in the summary',
    async () => {
        const { db, ctx } = await setupMemDb();
        await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Project One');
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        const a = generateIdentifier();
        const b = generateIdentifier();
        const c = generateIdentifier();
        await saveGraph(
            createRequestContext(db, await organizationToken())
                , 'aEsGMmBEFaVdWihhHXwCbw',
            [
                buildNode(a), buildNode(b),
                buildNode(c),
            ],
            [
                buildEdge(generateIdentifier(), a, b),
                buildEdge(generateIdentifier(), b, c),
            ],
        );
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db, await organizationToken()),
        );
        assertStrictEquals(pairs.length, 1);
        assertStrictEquals(
            pairs[0]!.summary.nodeCount, 3,
        );
        assertStrictEquals(
            pairs[0]!.summary.edgeCount, 2,
        );
    },
);

Deno.test(
    'getProjectFlowEntities returns the link rows',
    async () => {
        const { db } = await setupMemDb();
        const WeXjAaAxGSpLpamfEuvcww = createRequestContext(db
            , await organizationToken());
        // The nested per-project reassembly enumerates the org's
        // projects, so the parent rows must exist for their flow
        // joins to surface.
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'pnXmXrxOWayANgDLdCjuBw'
            , 'Project pnXmXrxOWayANgDLdCjuBw');
        await seedProject(WeXjAaAxGSpLpamfEuvcww, 'prBESZPjJDiuXCeZLmbiVw'
            , 'Project prBESZPjJDiuXCeZLmbiVw');
        const flow2 = generateIdentifier();
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww
            , 'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw');
        await createBaseFlow(WeXjAaAxGSpLpamfEuvcww, flow2
            , 'prBESZPjJDiuXCeZLmbiVw');
        const rows: ProjectFlowEntity[] =
            await getProjectFlowEntities(
                createRequestContext(db, await organizationToken()),
            );
        assertStrictEquals(rows.length, 2);
        const link1 = rows.find(
            r => r.flow_id === 'aEsGMmBEFaVdWihhHXwCbw',
        )!;
        assertStrictEquals(link1.project_id, 'pnXmXrxOWayANgDLdCjuBw');
        const link2 = rows.find(
            r => r.flow_id === flow2,
        )!;
        assertStrictEquals(link2.project_id, 'prBESZPjJDiuXCeZLmbiVw');
    },
);

Deno.test(
    'getProjectFlowEntities is empty when no'
    + ' flows have been created',
    async () => {
        const { db } = await setupMemDb();
        const rows = await getProjectFlowEntities(
            createRequestContext(db, await organizationToken()),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'a project-flow link added via the wire PUT'
    + ' surfaces in getFlowsByProject',
    async () => {
        const { db, ctx } = await setupMemDb();
        await seedProject(ctx, 'psZcIMMgiSomMHzDxcUnYQ', 'Project Nine');
        await createBaseFlow(
            createRequestContext(db, await organizationToken()),
            'aEsGMmBEFaVdWihhHXwCbw', 'pnXmXrxOWayANgDLdCjuBw',
        );
        // NAMED re-pin (Phase 4 Task 8, Phase 3 Step 2b
        // precedent): the flipped GET organizations/:id/projects/:id/flows
        // derives
        // from the message ledger, not the raw project_flows
        // table — a raw db.projectFlows.put leaves no pair at
        // this address, so the link must land through the SAME
        // wire-reachable PUT the live route serves.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'psZcIMMgiSomMHzDxcUnYQ/flows/'
            + generateIdentifier(), {
            project_id: 'psZcIMMgiSomMHzDxcUnYQ',
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const rows = await getFlowsByProject(
            createRequestContext(db, await organizationToken())
                , 'psZcIMMgiSomMHzDxcUnYQ',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.id, 'aEsGMmBEFaVdWihhHXwCbw');
    },
);

// The mock "Layout Test: Proposal Review Cycle" flow:
// 17 nodes, every one at (0,0), is_auto_layout true —
// the case that rendered the stats canvas as one giant
// scaled-up "Archive" rect.
const LAYOUT_TEST_FLOW_ID = 'DDUhYDIRInXtIrRraxcyHQ';

Deno.test(
    'getFlowGraph lays out an auto-layout flow whose'
    + ' stored positions are placeholders',
    async () => {
        const db = await seededMockDb();
        const g = await getFlowGraph(
            createRequestContext(db, await organizationToken()),
            LAYOUT_TEST_FLOW_ID,
        );
        const xs = g.nodes.map(n => n.positionX);
        const spanX =
            Math.max(...xs) - Math.min(...xs);
        assert(
            spanX > 2 * NODE_WIDTH,
            `expected a real x-span, got ${spanX}`,
        );
        const distinct = new Set(
            g.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        ).size;
        assertStrictEquals(distinct, g.nodes.length);
        const start = g.nodes.find(n => n.isCreate)!;
        const end = g.nodes.find(n => n.isArchive)!;
        assert(start.positionX < end.positionX);
    },
);

Deno.test(
    'the Layout Test flow keeps the ruled covenant:'
    + ' Create min x, Archive max x, inside the y range',
    async () => {
        const db = await seededMockDb();
        const g = await getFlowGraph(
            createRequestContext(
                db, await organizationToken(),
            ),
            LAYOUT_TEST_FLOW_ID,
        );
        const xs = g.nodes.map(n => n.positionX);
        const ys = g.nodes.map(n => n.positionY);
        const start = g.nodes.find(n => n.isCreate)!;
        const end = g.nodes.find(n => n.isArchive)!;
        assertStrictEquals(
            start.positionX, Math.min(...xs),
            'Create at min x',
        );
        assertStrictEquals(
            end.positionX, Math.max(...xs),
            'Archive at max x',
        );
        assert(
            start.positionY <= end.positionY,
            'Create never below Archive',
        );
        assert(
            start.positionY > Math.min(...ys)
            || end.positionY < Math.max(...ys),
            'on a fan the pair sits inside the y range,'
            + ' not pinned to the corners',
        );
    },
);
