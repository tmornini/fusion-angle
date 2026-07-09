import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// flow-operations.ts → logger.ts → preferences.ts
// reads localStorage, which is absent in Node. Stub it
// before any log.* call in an error path (mirrors
// flow-operations.test.ts).
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

import { MemoryDbAdapter } from '../api/db-memory.ts';
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
import {
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from
'../web-app/app/presenters/flow-designer.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import {
    performUndo,
    performRedo,
} from '../web-app/app/flow-operations.ts';
import type {
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
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const FLOW_ID = 'flow-ur';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    await seedHumanMember(db, 'm1', 'Member One');
    const ctx = createRequestContext(db, await devToken());
    await postFlowCreation(ctx, {
        flowId: FLOW_ID,
        linkId: FLOW_ID + '-link',
        projectId: 'project-1',
        name: 'Undo/Redo Flow',
    });
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
        name: 'Undo/Redo Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    };
}

// Build a FlowSnapshot whose graph is exactly nodes/edges —
// the client's authoritative current state at undo/redo time.
function snapOf(
    nodes: GraphNode[],
    edges: GraphEdge[] = [],
): FlowSnapshot {
    return buildInitialFlowSnapshot(
        {
            id: FLOW_ID,
            name: 'Undo/Redo Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            createdAt: '2026-01-01T00:00:00.000000Z',
            nodes,
            edges,
        },
        800, 600, [], [], [],
    );
}

// Persist `graph` as the CURRENT flow state — a genuine save,
// so it lands its OWN document pair at flows/:id. Undo-as-replay
// (Phase 14 Task 8) resolves its restore target by walking that
// SAME document-pair history — a plain putFlow call is now the
// full setup a later undo needs to revert to exactly this graph;
// no flow_versions archive rides alongside it any more (that
// archive fed the OLD undo mechanism's own consume, now retired).
async function saveGraph(
    ctx: RequestContext,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await putFlow(ctx, FLOW_ID, save(nodes, edges));
}

// Read the live (tombstone-filtered) relation rows and
// reassemble the domain graph — the same READ seam the canvas
// uses. A revived node reappears here ONLY if a non-'deleted'
// state event now supersedes its tombstone.
async function reassemble(
    db: MemoryDbAdapter,
): Promise<StoredGraph> {
    const nodeRows = await db.flowNodes
        .getAllWhere('flow_id', FLOW_ID);
    const edgeRows = await db.flowEdges
        .getAllWhere('flow_id', FLOW_ID);
    const memberRows = await db.flowNodeMembers.getAll();
    const attrRows = await db.flowNodeAttributes.getAll();
    return reassembleStoredGraph(
        nodeRows, edgeRows, memberRows, attrRows,
    );
}

async function latestStateFor(
    ctx: RequestContext,
    entityId: string,
): Promise<string> {
    const events = await ctx.GET<StateEntity[]>(
        'entity-states/' + entityId + '/history',
    );
    return events.at(-1)!.state;
}

// performUndo (Phase 14 Task 8) gates on hasUndoHistory
// client-side BEFORE ever calling the server — every test below
// has already made a genuine saveGraph edit, so this fixture
// must say so (true), or performUndo short-circuits to a no-op
// without exercising the route at all. The empty redoStack is
// the part actually named "no redo" below.
const HAS_UNDO_HISTORY = buildFlowHistorySnapshot(true);

test(
    'DELETE-THEN-UNDO revives the deleted node and its'
    + ' edge: reassembly includes them, latest state'
    + " is 'restored'",
    async () => {
        const { db, ctx } = await setupMemDb();
        const a = buildNode('a', { isCreate: true });
        const x = buildNode('x');
        const xEdge = buildEdge('xe', 'a', 'x');

        // Save the graph that HAS X + its edge — undo's target.
        await saveGraph(
            ctx, [a, x], [xEdge],
        );
        // Then save the graph WITHOUT X (X + its edge are
        // tombstoned by the save delta).
        await putFlow(ctx, FLOW_ID, save([a], []));

        const afterDelete = await reassemble(db);
        assert.ok(
            !afterDelete.nodes.some(n => n.id === 'x'),
            'X is tombstoned after the deleting save',
        );
        assert.equal(
            await latestStateFor(ctx, 'x'), 'deleted',
        );
        assert.equal(
            await latestStateFor(ctx, 'xe'), 'deleted',
        );

        // UNDO from the current (X-less) graph back to the
        // version that still had X.
        const undo = await performUndo(
            ctx, snapOf([a], []), HAS_UNDO_HISTORY,
        );
        assert.equal(undo.kind, 'ok');
        if (undo.kind !== 'ok') return;

        // KEYSTONE: X and its edge are REVIVED — the
        // reassembled live graph includes them again.
        const afterUndo = await reassemble(db);
        assert.ok(
            afterUndo.nodes.some(n => n.id === 'x'),
            'undo REVIVES the deleted node X',
        );
        assert.ok(
            afterUndo.edges.some(e => e.id === 'xe'),
            'undo REVIVES the edge deleted alongside X',
        );
        // And X's LATEST state event supersedes the
        // tombstone with a non-'deleted' 'restored'.
        assert.equal(
            await latestStateFor(ctx, 'x'), 'restored',
            "revived node's latest state is 'restored'",
        );
        assert.equal(
            await latestStateFor(ctx, 'xe'), 'restored',
            "revived edge's latest state is 'restored'",
        );
    },
);

test(
    'ADD-THEN-UNDO deletes the added node: reassembly'
    + ' omits it (working-not-target is a deletion)',
    async () => {
        const { db, ctx } = await setupMemDb();
        const a = buildNode('a', { isCreate: true });
        const x = buildNode('x');

        // Save the graph WITHOUT X — undo's target.
        await saveGraph(ctx, [a], []);
        // Then save the graph WITH X (X added).
        await putFlow(ctx, FLOW_ID, save([a, x], []));

        const afterAdd = await reassemble(db);
        assert.ok(afterAdd.nodes.some(n => n.id === 'x'));

        // Undo the add -> X is in current-not-target, so it
        // is deleted by the undo delta.
        const undo = await performUndo(
            ctx, snapOf([a, x], []), HAS_UNDO_HISTORY,
        );
        assert.equal(undo.kind, 'ok');
        if (undo.kind !== 'ok') return;

        const afterUndo = await reassemble(db);
        assert.ok(
            !afterUndo.nodes.some(n => n.id === 'x'),
            'undo of an add deletes the added node',
        );
        assert.equal(
            await latestStateFor(ctx, 'x'), 'deleted',
        );
    },
);

test(
    'MEMBER add + undo: the member is gone after undo',
    async () => {
        const { db, ctx } = await setupMemDb();
        const aBare = buildNode('a', { isCreate: true });
        const aWithMember = buildNode('a', {
            isCreate: true,
            memberIds: ['m1'],
        });

        // Save the graph whose node a has NO member — undo's target.
        await saveGraph(ctx, [aBare], []);
        // Then save the graph where a gains member m1.
        await putFlow(ctx, FLOW_ID, save([aWithMember], []));

        const afterAdd = await reassemble(db);
        assert.ok(
            afterAdd.nodes.find(n => n.id === 'a')!
                .memberIds.includes('m1'),
        );

        // Undo -> revert to the no-member version.
        const undo = await performUndo(
            ctx, snapOf([aWithMember], []), HAS_UNDO_HISTORY,
        );
        assert.equal(undo.kind, 'ok');
        if (undo.kind !== 'ok') return;

        const afterUndo = await reassemble(db);
        assert.ok(
            !afterUndo.nodes.find(n => n.id === 'a')!
                .memberIds.includes('m1'),
            'undo removes the added member',
        );
    },
);

test(
    'REDO round-trip: redo re-applies the delete after'
    + ' an undo revived it (X tombstoned again)',
    async () => {
        const { db, ctx } = await setupMemDb();
        const a = buildNode('a', { isCreate: true });
        const x = buildNode('x');
        const xEdge = buildEdge('xe', 'a', 'x');

        // Save the graph that HAS X — undo's target.
        await saveGraph(ctx, [a, x], [xEdge]);
        // Save the graph WITHOUT X (delete).
        await putFlow(ctx, FLOW_ID, save([a], []));

        // Undo -> X revived.
        const undo = await performUndo(
            ctx, snapOf([a], []), HAS_UNDO_HISTORY,
        );
        assert.equal(undo.kind, 'ok');
        if (undo.kind !== 'ok') return;
        const afterUndo = await reassemble(db);
        assert.ok(afterUndo.nodes.some(n => n.id === 'x'));

        // Redo -> re-apply the delete (X tombstoned again).
        const redo = await performRedo(
            ctx, snapOf([a, x], [xEdge]), undo.newHistory,
        );
        assert.equal(redo.kind, 'ok');
        if (redo.kind !== 'ok') return;

        const afterRedo = await reassemble(db);
        assert.ok(
            !afterRedo.nodes.some(n => n.id === 'x'),
            'redo re-applies the delete: X tombstoned again',
        );
        assert.equal(
            await latestStateFor(ctx, 'x'), 'deleted',
            "redo re-tombstones X (latest state 'deleted')",
        );
    },
);
