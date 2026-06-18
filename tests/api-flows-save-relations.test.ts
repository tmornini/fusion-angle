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
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StateEntity,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    reassembleStoredGraph,
} from '../api/flow-graph-relations.ts';
import {
    asStoredGraph,
} from '../api/validators.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    await seedHumanMember(db, 'm1', 'Member One');
    await seedHumanMember(db, 'm2', 'Member Two');
    const ctx = createRequestContext(db, await devToken());
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

function save(
    nodes: GraphNode[],
    edges: GraphEdge[],
): {
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    return {
        name: 'Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    };
}

async function relations(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<{
    nodeRows: Awaited<
        ReturnType<typeof db.flowNodes.getAllWhere>
    >;
    edgeRows: Awaited<
        ReturnType<typeof db.flowEdges.getAllWhere>
    >;
    memberRows: Awaited<
        ReturnType<typeof db.flowNodeMembers.getAll>
    >;
    attrRows: Awaited<
        ReturnType<typeof db.flowNodeAttributes.getAll>
    >;
}> {
    return {
        nodeRows: await db.flowNodes
            .getAllWhere('flow_id', flowId),
        edgeRows: await db.flowEdges
            .getAllWhere('flow_id', flowId),
        memberRows: await db.flowNodeMembers.getAll(),
        attrRows: await db.flowNodeAttributes.getAll(),
    };
}

// The known baseline graph save #1 establishes: two nodes
// (A keeps a member m1 and attribute x in editable mode,
// plus a soon-to-be-deleted member m2 and attribute y; B is
// plain) joined by edge e1. Save #2 diffs against THIS.
function buildBaselineGraph(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    const a = buildNode('a', {
        isCreate: true,
        memberIds: ['m1', 'm2'],
        attributes: [
            {
                attributeId: 'x',
                mode: 'editable',
                isRequired: false,
            },
            {
                attributeId: 'y',
                mode: 'readonly',
                isRequired: true,
            },
        ],
    });
    const b = buildNode('b', { isArchive: true });
    const c = buildNode('c');
    const e1 = buildEdge('e1', 'a', 'b');
    const e2 = buildEdge('e2', 'a', 'c');
    return { nodes: [a, b, c], edges: [e1, e2] };
}

// Save #2 working graph: add member m2→removed and m? ; the
// brief's seven operations — add a member, remove a member,
// add an attribute, change an attribute's mode, move a node,
// delete a node, delete an edge.
function buildWorkingGraph(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    const a = buildNode('a', {
        isCreate: true,
        positionX: 999, // moved
        positionY: 888,
        // m2 removed, m1 kept; nothing added on a
        memberIds: ['m1'],
        attributes: [
            // x mode changed editable -> readonly
            {
                attributeId: 'x',
                mode: 'readonly',
                isRequired: false,
            },
            // y removed; z added
            {
                attributeId: 'z',
                mode: 'editable',
                isRequired: true,
            },
        ],
    });
    // b gains member m2 (add a member)
    const b = buildNode('b', {
        isArchive: true,
        memberIds: ['m2'],
    });
    // c is deleted; edge e2 (a->c) is deleted with it
    const e1 = buildEdge('e1', 'a', 'b');
    return { nodes: [a, b], edges: [e1] };
}

async function seedKnownBaseline(
    ctx: RequestContext,
    flowId: string,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'project-1',
        name: 'Rel Save Flow',
    });
    const base = buildBaselineGraph();
    await putFlow(ctx, flowId, save(base.nodes, base.edges));
}

test(
    'PUT /flows/:id ROUND-TRIP: reassembled relations'
    + ' equal the intended saved graph',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-save-rt';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const r = await relations(db, flowId);
        const reassembled = reassembleStoredGraph(
            r.nodeRows, r.edgeRows, r.memberRows, r.attrRows,
        );

        // node c deleted, edge e2 deleted
        const nodeIds = reassembled.nodes
            .map(n => n.id).sort();
        assert.deepEqual(nodeIds, ['a', 'b']);
        const edgeIds = reassembled.edges.map(e => e.id);
        assert.deepEqual(edgeIds, ['e1']);

        const a = reassembled.nodes
            .find(n => n.id === 'a')!;
        // node a moved
        assert.equal(a.positionX, 999);
        assert.equal(a.positionY, 888);
        // member m2 removed from a, m1 kept
        assert.deepEqual(a.memberIds.sort(), ['m1']);
        // attribute x mode changed, y removed, z added
        const aAttrs = [...a.attributes]
            .sort((p, q) =>
                p.attributeId.localeCompare(q.attributeId));
        assert.deepEqual(
            aAttrs,
            [
                {
                    attributeId: 'x',
                    mode: 'readonly',
                    isRequired: false,
                },
                {
                    attributeId: 'z',
                    mode: 'editable',
                    isRequired: true,
                },
            ],
        );

        const b = reassembled.nodes
            .find(n => n.id === 'b')!;
        // member m2 added to b
        assert.deepEqual(b.memberIds.sort(), ['m2']);
    },
);

test(
    'PUT /flows/:id APPEND-ONLY: removed/re-added/'
    + 'changed leave new ledger rows, never splice',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-save-ledger';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const memberRows = await db.flowNodeMembers
            .getAll();
        // m2 on node a: an 'added' (baseline) then a
        // 'removed' (save #2). The 'added' is never spliced.
        const aM2 = memberRows.filter(
            row => row.flow_node_id === 'a'
                && row.member_id === 'm2',
        );
        const aM2Actions = aM2.map(r => r.action).sort();
        assert.deepEqual(
            aM2Actions, ['added', 'removed'],
            'removed member leaves a removed row beside'
            + ' the original added row',
        );
        // m2 re-added on node b: a NEW 'added' row
        const bM2 = memberRows.filter(
            row => row.flow_node_id === 'b'
                && row.member_id === 'm2',
        );
        assert.equal(bM2.length, 1);
        assert.equal(bM2[0]!.action, 'added');

        const attrRows = await db.flowNodeAttributes
            .getAll();
        // x on a: baseline 'added' (editable) then a NEW
        // 'added' (readonly) — prior row UNMUTATED.
        const aX = attrRows.filter(
            row => row.flow_node_id === 'a'
                && row.attribute_id === 'x',
        );
        assert.equal(
            aX.length, 2,
            'mode change appends a new added row',
        );
        const editableRow = aX.find(
            r => r.mode === 'editable',
        );
        const readonlyRow = aX.find(
            r => r.mode === 'readonly',
        );
        assert.ok(
            editableRow,
            'the original editable row is untouched',
        );
        assert.ok(readonlyRow);
        // y on a removed: an 'added' then a 'removed'
        const aY = attrRows.filter(
            row => row.flow_node_id === 'a'
                && row.attribute_id === 'y',
        );
        assert.deepEqual(
            aY.map(r => r.action).sort(),
            ['added', 'removed'],
        );
    },
);

test(
    'PUT /flows/:id IDEMPOTENCY: replaying one delta'
    + ' body twice lands byte-identical storage',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-save-idem';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        // Capture ONE PUT body (with one graphDelta) and
        // replay it. putFlow rebuilds the delta with fresh
        // ids per call, so capture the wire body directly.
        let captured: Record<string, unknown> | null = null;
        const origPut = ctx.PUT.bind(ctx);
        const spyCtx: RequestContext = {
            ...ctx,
            PUT: async <T,>(
                path: string,
                body?: unknown,
            ): Promise<T> => {
                if (path === 'flows/' + flowId
                    && captured === null) {
                    captured =
                        body as Record<string, unknown>;
                }
                return origPut<T>(path, body);
            },
        };
        await putFlow(spyCtx, flowId, save(
            working.nodes, working.edges,
        ));
        assert.ok(captured, 'a PUT body was captured');

        const afterFirst = await relations(db, flowId);
        const firstGraph = reassembleStoredGraph(
            afterFirst.nodeRows, afterFirst.edgeRows,
            afterFirst.memberRows, afterFirst.attrRows,
        );
        const memberCountBefore =
            afterFirst.memberRows.length;
        const attrCountBefore = afterFirst.attrRows.length;
        const nodeCountBefore = afterFirst.nodeRows.length;
        const edgeCountBefore = afterFirst.edgeRows.length;

        // Replay the EXACT captured body.
        await origPut('flows/' + flowId, captured);

        const afterReplay = await relations(db, flowId);
        // No duplicate rows on any relation table.
        assert.equal(
            afterReplay.memberRows.length,
            memberCountBefore,
            'no duplicate member rows on replay',
        );
        assert.equal(
            afterReplay.attrRows.length,
            attrCountBefore,
            'no duplicate attribute rows on replay',
        );
        assert.equal(
            afterReplay.nodeRows.length,
            nodeCountBefore,
        );
        assert.equal(
            afterReplay.edgeRows.length,
            edgeCountBefore,
        );
        // Derived state identical.
        const replayGraph = reassembleStoredGraph(
            afterReplay.nodeRows, afterReplay.edgeRows,
            afterReplay.memberRows, afterReplay.attrRows,
        );
        assert.deepEqual(replayGraph, firstGraph);
    },
);

test(
    'PUT /flows/:id DUAL-WRITE: stored flows.graph blob'
    + ' equals the reassembled relations',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-save-dual';
        await seedKnownBaseline(ctx, flowId);

        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));

        const flow = await ctx.GET<FlowEntity>(
            'flows/' + flowId,
        );
        const blob = asStoredGraph(
            JSON.parse(flow.graph), 'flow.graph',
        );

        const r = await relations(db, flowId);
        const reassembled = reassembleStoredGraph(
            r.nodeRows, r.edgeRows, r.memberRows, r.attrRows,
        );

        // Both describe the same nodes/edges/members/attrs.
        const norm = (g: StoredGraph): StoredGraph => ({
            nodes: [...g.nodes]
                .sort((p, q) => p.id.localeCompare(q.id))
                .map(n => ({
                    ...n,
                    memberIds: [...n.memberIds].sort(),
                    attributes: [...n.attributes].sort(
                        (p, q) => p.attributeId
                            .localeCompare(q.attributeId),
                    ),
                })),
            edges: [...g.edges]
                .sort((p, q) => p.id.localeCompare(q.id)),
        });
        assert.deepEqual(norm(blob), norm(reassembled));
    },
);

test(
    'PUT /flows/:id still emits exactly one updated event'
    + ' (existing covenant intact)',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = 'flow-save-event';
        await seedKnownBaseline(ctx, flowId);
        const working = buildWorkingGraph();
        await putFlow(ctx, flowId, save(
            working.nodes, working.edges,
        ));
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/' + flowId + '/history',
        );
        assert.deepEqual(
            events.map(e => e.state),
            ['active', 'updated', 'updated'],
        );
    },
);
