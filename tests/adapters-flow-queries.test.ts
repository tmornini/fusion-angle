import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    getFlows,
    getFlowsByProject,
    getFlowGraph,
    getFlowsWithProjectNames,
    getProjectFlowRows,
    type FlowGraph,
} from
'../web-app/app/adapters/flow-queries.ts';
import type {
    GraphNode,
    GraphEdge,
    ProjectEntity,
    ProjectFlowEntity,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import { populateMockData } from '../api/mock-data.ts';
import { NODE_WIDTH } from '../web-app/app/flow-layout.ts';

function setupMemDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

function buildNode(
    id: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name: id,
        description: '',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        workerIds: [],
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
        name: 'Transition',
        description: '',
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
        linkId: flowId + '-link',
        projectId,
        name: 'Flow ' + flowId,
        description: 'desc ' + flowId,
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
        description: 'desc ' + flowId,
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
        createdAt: '2026-01-01T00:00:00.000Z',
    });
}

function putProject(
    db: MemoryDbAdapter,
    id: string,
    title: string,
): Promise<ProjectEntity> {
    return db.projects.put(id, {
        title,
        description: '',
        status: 'approved',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_duration: 0,
        actual_duration: 0,
        estimated_cost: 0,
        actual_cost: 0,
        estimated_impact: 0,
        actual_impact: 0,
        position: 0,
        business_context: '{}',
        timeline_label: '',
    });
}

test(
    'getFlowGraph returns the parsed graph'
    + ' with metadata and counts',
    async () => {
        const { db } = setupMemDb();
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        const start = buildNode('start', {
            isCreate: true,
        });
        const mid = buildNode('mid');
        const end = buildNode('end', {
            isArchive: true,
        });
        const e1 = buildEdge(
            'e1', 'start', 'mid',
        );
        const e2 = buildEdge(
            'e2', 'mid', 'end',
        );
        await saveGraph(
            createRequestContext(db), 'flow-1',
            [start, mid, end], [e1, e2],
        );
        const g: FlowGraph = await getFlowGraph(
            createRequestContext(db), 'flow-1',
        );
        assert.equal(g.id, 'flow-1');
        assert.equal(g.name, 'Flow flow-1');
        assert.equal(
            g.description, 'desc flow-1',
        );
        assert.equal(g.isLocked, false);
        assert.equal(g.isAutoLayout, false);
        assert.equal(g.isAutoFit, false);
        assert.equal(
            g.lockTimeout, DEFAULT_LOCK_TIMEOUT,
        );
        assert.equal(typeof g.createdAt, 'string');
        assert.equal(g.nodes.length, 3);
        assert.equal(g.edges.length, 2);
        assert.ok(
            g.nodes.some(n => n.id === 'mid'),
        );
        assert.ok(
            g.edges.some(e => e.id === 'e2'),
        );
    },
);

test(
    'getFlowGraph reflects flag changes'
    + ' saved on the flow',
    async () => {
        const { db } = setupMemDb();
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        await putFlow(
            createRequestContext(db), 'flow-1',
            {
                name: 'Locked Flow',
                description: 'd',
                isLocked: true,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: 900,
                nodes: [buildNode('a')],
                edges: [],
                createdAt:
                    '2026-01-01T00:00:00.000Z',
            },
        );
        const g = await getFlowGraph(
            createRequestContext(db), 'flow-1',
        );
        assert.equal(g.name, 'Locked Flow');
        assert.equal(g.isLocked, true);
        assert.equal(g.isAutoLayout, true);
        assert.equal(g.isAutoFit, true);
        assert.equal(g.lockTimeout, 900);
    },
);

test(
    'getFlows summarizes every flow with'
    + ' node and edge counts',
    async () => {
        const { db } = setupMemDb();
        const c1 = createRequestContext(db);
        await createBaseFlow(c1, 'flow-1', 'p1');
        await createBaseFlow(c1, 'flow-2', 'p1');
        await saveGraph(
            createRequestContext(db), 'flow-1',
            [
                buildNode('a'), buildNode('b'),
                buildNode('c'),
            ],
            [buildEdge('ab', 'a', 'b')],
        );
        await saveGraph(
            createRequestContext(db), 'flow-2',
            [buildNode('x')], [],
        );
        const flows = await getFlows(
            createRequestContext(db),
        );
        assert.equal(flows.length, 2);
        const f1 = flows.find(
            f => f.id === 'flow-1',
        )!;
        const f2 = flows.find(
            f => f.id === 'flow-2',
        )!;
        assert.equal(f1.name, 'Flow flow-1');
        assert.equal(f1.nodeCount, 3);
        assert.equal(f1.edgeCount, 1);
        assert.equal(f2.nodeCount, 1);
        assert.equal(f2.edgeCount, 0);
    },
);

test(
    'getFlows on a fresh flow reports the'
    + ' default two nodes and no edges',
    async () => {
        const { db } = setupMemDb();
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        const flows = await getFlows(
            createRequestContext(db),
        );
        assert.equal(flows.length, 1);
        assert.equal(flows[0]!.nodeCount, 2);
        assert.equal(flows[0]!.edgeCount, 0);
    },
);

test(
    'getFlowsByProject returns only flows'
    + ' linked to the given project',
    async () => {
        const { db } = setupMemDb();
        const c1 = createRequestContext(db);
        await putProject(db, 'p1', 'Project One');
        await putProject(db, 'p2', 'Project Two');
        await createBaseFlow(c1, 'flow-1', 'p1');
        await createBaseFlow(c1, 'flow-2', 'p1');
        await createBaseFlow(c1, 'flow-3', 'p2');
        const p1Flows = await getFlowsByProject(
            createRequestContext(db), 'p1',
        );
        const p2Flows = await getFlowsByProject(
            createRequestContext(db), 'p2',
        );
        const p1Ids = p1Flows
            .map(f => f.id).sort();
        assert.deepEqual(
            p1Ids, ['flow-1', 'flow-2'],
        );
        assert.equal(p2Flows.length, 1);
        assert.equal(p2Flows[0]!.id, 'flow-3');
    },
);

test(
    'getFlowsByProject returns an empty list'
    + ' for a project with no flows',
    async () => {
        const { db } = setupMemDb();
        await putProject(db, 'p1', 'Project One');
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        const rows = await getFlowsByProject(
            createRequestContext(db), 'p-empty',
        );
        assert.deepEqual(rows, []);
    },
);

test(
    'getFlowsByProject carries node and'
    + ' edge counts for each flow',
    async () => {
        const { db } = setupMemDb();
        await putProject(db, 'p1', 'Project One');
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        await saveGraph(
            createRequestContext(db), 'flow-1',
            [
                buildNode('a'), buildNode('b'),
            ],
            [buildEdge('ab', 'a', 'b')],
        );
        const rows = await getFlowsByProject(
            createRequestContext(db), 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.nodeCount, 2);
        assert.equal(rows[0]!.edgeCount, 1);
    },
);

test(
    'getFlowsWithProjectNames pairs each'
    + ' flow with its project name',
    async () => {
        const { db } = setupMemDb();
        const c1 = createRequestContext(db);
        await putProject(db, 'p1', 'Project One');
        await putProject(db, 'p2', 'Project Two');
        await createBaseFlow(c1, 'flow-1', 'p1');
        await createBaseFlow(c1, 'flow-2', 'p2');
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db),
        );
        assert.equal(pairs.length, 2);
        const byFlow = new Map(
            pairs.map(
                p => [p.summary.id, p.projectName],
            ),
        );
        assert.equal(
            byFlow.get('flow-1'), 'Project One',
        );
        assert.equal(
            byFlow.get('flow-2'), 'Project Two',
        );
    },
);

test(
    'getFlowsWithProjectNames yields undefined'
    + ' when the linked project is gone',
    async () => {
        const { db } = setupMemDb();
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'ghost-project',
        );
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db),
        );
        assert.equal(pairs.length, 1);
        assert.equal(pairs[0]!.summary.id, 'flow-1');
        assert.equal(
            pairs[0]!.projectName, undefined,
        );
    },
);

test(
    'getFlowsWithProjectNames includes node'
    + ' and edge counts in the summary',
    async () => {
        const { db } = setupMemDb();
        await putProject(db, 'p1', 'Project One');
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        await saveGraph(
            createRequestContext(db), 'flow-1',
            [
                buildNode('a'), buildNode('b'),
                buildNode('c'),
            ],
            [
                buildEdge('ab', 'a', 'b'),
                buildEdge('bc', 'b', 'c'),
            ],
        );
        const pairs = await getFlowsWithProjectNames(
            createRequestContext(db),
        );
        assert.equal(pairs.length, 1);
        assert.equal(
            pairs[0]!.summary.nodeCount, 3,
        );
        assert.equal(
            pairs[0]!.summary.edgeCount, 2,
        );
    },
);

test(
    'getProjectFlowRows returns the link rows',
    async () => {
        const { db } = setupMemDb();
        const c1 = createRequestContext(db);
        await createBaseFlow(c1, 'flow-1', 'p1');
        await createBaseFlow(c1, 'flow-2', 'p2');
        const rows: ProjectFlowEntity[] =
            await getProjectFlowRows(
                createRequestContext(db),
            );
        assert.equal(rows.length, 2);
        const link1 = rows.find(
            r => r.flow_id === 'flow-1',
        )!;
        assert.equal(link1.project_id, 'p1');
        const link2 = rows.find(
            r => r.flow_id === 'flow-2',
        )!;
        assert.equal(link2.project_id, 'p2');
    },
);

test(
    'getProjectFlowRows is empty when no'
    + ' flows have been created',
    async () => {
        const { db } = setupMemDb();
        const rows = await getProjectFlowRows(
            createRequestContext(db),
        );
        assert.deepEqual(rows, []);
    },
);

test(
    'a project-flow link added directly to'
    + ' the table surfaces in getFlowsByProject',
    async () => {
        const { db } = setupMemDb();
        await putProject(db, 'p9', 'Project Nine');
        await createBaseFlow(
            createRequestContext(db),
            'flow-1', 'p1',
        );
        await db.projectFlows.put('extra-link', {
            project_id: 'p9',
            flow_id: 'flow-1',
            created_at: '2026-01-01T00:00:00.000Z',
        });
        const rows = await getFlowsByProject(
            createRequestContext(db), 'p9',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.id, 'flow-1');
    },
);

// The mock "Layout Test: Proposal Review Cycle" flow:
// 17 nodes, every one at (0,0), is_auto_layout true —
// the case that rendered the stats canvas as one giant
// scaled-up "Archive" rect.
const LAYOUT_TEST_FLOW_ID = '7COt7Kf4OaOBg6AjaNO04s';

test(
    'getFlowGraph lays out an auto-layout flow whose'
    + ' stored positions are placeholders',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const g = await getFlowGraph(
            createRequestContext(db),
            LAYOUT_TEST_FLOW_ID,
        );
        const xs = g.nodes.map(n => n.positionX);
        const spanX =
            Math.max(...xs) - Math.min(...xs);
        assert.ok(
            spanX > 2 * NODE_WIDTH,
            `expected a real x-span, got ${spanX}`,
        );
        const distinct = new Set(
            g.nodes.map(
                n => `${n.positionX},${n.positionY}`,
            ),
        ).size;
        assert.equal(distinct, g.nodes.length);
        const start = g.nodes.find(n => n.isCreate)!;
        const end = g.nodes.find(n => n.isArchive)!;
        assert.ok(start.positionX < end.positionX);
    },
);
