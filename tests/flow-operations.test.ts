import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// flow-operations.ts → logger.ts → preferences.ts
// reads localStorage, which is absent in Node.
// Stub it before any log.* call in an error path.
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
import {
    postFlowCreation,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    type FlowVersion,
} from '../web-app/app/adapters/index.ts';
import {
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from
'../web-app/app/presenters/flow-designer.ts';
import {
    buildFlowHistorySnapshot,
    appendToRedoStack,
} from '../web-app/app/flow-history.ts';
import {
    NODE_WIDTH, NODE_HEIGHT,
} from '../web-app/app/flow-layout.ts';
import {
    performAddEdge,
    performAddNodeAtPosition,
    performDeleteSelectedNodes,
    performDeleteSelectedEdge,
    performAddField,
    performDeleteField,
    performUndo,
    performRedo,
} from '../web-app/app/flow-operations.ts';
import type {
    GraphNode,
    GraphEdge,
    GraphField,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';

const FLOW_ID = 'flow-1';

// -- Builders ---------------------------------

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

function buildField(
    id: string,
): GraphField {
    return {
        id,
        name: id,
        fieldType: 'text',
        sortOrder: 0,
        isRequired: false,
        options: [],
    };
}

function buildGraph(
    nodes: GraphNode[],
    edges: GraphEdge[] = [],
): FlowGraph {
    return {
        id: FLOW_ID,
        name: 'Test Flow',
        description: '',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        createdAt: '2026-01-01T00:00:00.000Z',
        nodes,
        edges,
    };
}

function buildFlowVersion(
    overrides?: Partial<FlowVersion>,
): FlowVersion {
    return {
        id: 'ver-1',
        flowId: FLOW_ID,
        name: 'Previous',
        description: '',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [buildNode('a'), buildNode('b')],
        edges: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function snapFrom(graph: FlowGraph): FlowSnapshot {
    return buildInitialFlowSnapshot(
        graph, 800, 600, new Map(),
    );
}

function locked(snap: FlowSnapshot): FlowSnapshot {
    return { ...snap, isLocked: true };
}

function withNodeSelection(
    snap: FlowSnapshot,
    ...nodeIds: string[]
): FlowSnapshot {
    return {
        ...snap,
        interaction: {
            ...snap.interaction,
            selection: {
                kind: 'nodes',
                nodeIds: new Set(nodeIds),
            },
        },
    };
}

function withEdgeSelection(
    snap: FlowSnapshot,
    edgeId: string,
): FlowSnapshot {
    return {
        ...snap,
        interaction: {
            ...snap.interaction,
            selection: { kind: 'edge', edgeId },
        },
    };
}

function withNoSelection(
    snap: FlowSnapshot,
): FlowSnapshot {
    return {
        ...snap,
        interaction: {
            ...snap.interaction,
            selection: { kind: 'none' },
        },
    };
}

async function setupFlow(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.workers.put('current', {
        first_name: 'Demo',
        last_name: 'User',
        email: 'demo@example.com',
        phone: '',
        title: 'Admin',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        bio: '',
        department: 'Product',
    });
    const ctx = createRequestContext(db);
    await postFlowCreation(ctx, {
        flowId: FLOW_ID,
        linkId: FLOW_ID + '-link',
        projectId: 'project-1',
        name: 'Test Flow',
        description: '',
    });
    return { db, ctx };
}

// A db with NO flow row: commitFlowMutation's
// postFlowVersion does ctx.GET('flows/flow-1')
// which 404s, driving the catch → failOp(...).
function setupNoFlow(): MemoryDbAdapter {
    return new MemoryDbAdapter();
}

async function persistedGraph(
    db: MemoryDbAdapter,
): Promise<StoredGraph> {
    const flow = await createRequestContext(db)
        .GET<{ graph: string }>(
            'flows/' + FLOW_ID,
        );
    return JSON.parse(flow.graph) as StoredGraph;
}

async function flowVersionCount(
    db: MemoryDbAdapter,
): Promise<number> {
    const rows = await createRequestContext(db)
        .GET<unknown[]>('flow-versions');
    return rows.length;
}

async function silenceConsoleError<T>(
    fn: () => Promise<T>,
): Promise<T> {
    const original = console.error;
    console.error = () => {};
    try {
        return await fn();
    } finally {
        console.error = original;
    }
}

// -- performAddEdge ---------------------------

test(
    'performAddEdge: success returns the new'
    + ' edge and persists it',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const op = await performAddEdge(
            db, snap, 'a', 'b',
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.edge.fromNodeId, 'a');
        assert.equal(op.edge.toNodeId, 'b');
        assert.equal(op.advanceHistory, true);
        const g = await persistedGraph(db);
        assert.equal(g.edges.length, 1);
        assert.equal(
            await flowVersionCount(db), 1,
        );
    },
);

test(
    'performAddEdge: from a start node with no'
    + ' outgoing edge succeeds',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('s', { isCreate: true }),
            buildNode('a'),
        ]));
        const op = await performAddEdge(
            db, snap, 's', 'a',
        );
        assert.equal(op.kind, 'ok');
    },
);

test(
    'performAddEdge: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ])));
        const op = await performAddEdge(
            db, snap, 'a', 'b',
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /locked/i);
    },
);

test(
    'performAddEdge: unknown fromId throws',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('b'),
        ]));
        await assert.rejects(
            () => performAddEdge(
                db, snap, 'missing', 'b',
            ),
            /unknown fromId missing/,
        );
    },
);

test(
    'performAddEdge: unknown toId throws',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        await assert.rejects(
            () => performAddEdge(
                db, snap, 'a', 'missing',
            ),
            /unknown toId missing/,
        );
    },
);

test(
    'performAddEdge: from an end node fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('e', { isArchive: true }),
            buildNode('a'),
        ]));
        const op = await performAddEdge(
            db, snap, 'e', 'a',
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /end state/i);
    },
);

test(
    'performAddEdge: to a start node fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
            buildNode('s', { isCreate: true }),
        ]));
        const op = await performAddEdge(
            db, snap, 'a', 's',
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /start state/i);
    },
);

test(
    'performAddEdge: duplicate edge fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op = await performAddEdge(
            db, snap, 'a', 'b',
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /already exists/i);
    },
);

test(
    'performAddEdge: a second edge out of the'
    + ' start node fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [
                buildNode('s', { isCreate: true }),
                buildNode('a'), buildNode('b'),
            ],
            [buildEdge('e1', 's', 'a')],
        ));
        const op = await performAddEdge(
            db, snap, 's', 'b',
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(
            op.toast, /only one outgoing/i,
        );
    },
);

test(
    'performAddEdge: a commit failure yields a'
    + ' fail result',
    async () => {
        const db = setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const op = await silenceConsoleError(
            () => performAddEdge(db, snap, 'a', 'b'),
        );
        assert.equal(
            (await op).kind, 'fail',
        );
        const settled = await op;
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast, /failed to create/i,
        );
    },
);

// -- performAddNodeAtPosition -----------------

test(
    'performAddNodeAtPosition: returns node,'
    + ' edge, selectId and centers on the point',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddNodeAtPosition(
            db, snap, 'a', 300, 200,
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.edge.fromNodeId, 'a');
        assert.equal(
            op.edge.toNodeId, op.node.id,
        );
        assert.equal(op.selectId, op.node.id);
        assert.equal(op.advanceHistory, true);
        assert.equal(
            op.node.positionX,
            300 - NODE_WIDTH / 2,
        );
        assert.equal(
            op.node.positionY,
            200 - NODE_HEIGHT / 2,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
        assert.equal(g.edges.length, 1);
    },
);

test(
    'performAddNodeAtPosition: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode('a'),
        ])));
        const op = await performAddNodeAtPosition(
            db, snap, 'a', 0, 0,
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performAddNodeAtPosition: unknown fromNodeId'
    + ' throws',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([]));
        await assert.rejects(
            () => performAddNodeAtPosition(
                db, snap, 'missing', 0, 0,
            ),
            /unknown fromNodeId missing/,
        );
    },
);

test(
    'performAddNodeAtPosition: from an end node'
    + ' fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('e', { isArchive: true }),
        ]));
        const op = await performAddNodeAtPosition(
            db, snap, 'e', 0, 0,
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /end state/i);
    },
);

test(
    'performAddNodeAtPosition: from a start node'
    + ' that already has an outgoing edge fails',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [
                buildNode('s', { isCreate: true }),
                buildNode('a'),
            ],
            [buildEdge('e1', 's', 'a')],
        ));
        const op = await performAddNodeAtPosition(
            db, snap, 's', 0, 0,
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(
            op.toast, /only one outgoing/i,
        );
    },
);

test(
    'performAddNodeAtPosition: a commit failure'
    + ' yields a fail result',
    async () => {
        const db = setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performAddNodeAtPosition(
                db, snap, 'a', 0, 0,
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast, /failed to add state/i,
        );
    },
);

// -- performDeleteSelectedNodes ---------------

test(
    'performDeleteSelectedNodes: removes the'
    + ' selected intermediate node',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('s', { isCreate: true }),
            buildNode('a'),
            buildNode('e', { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                db, withNodeSelection(base, 'a'),
            );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.advanceHistory, true);
        assert.equal(
            op.nodes.some(n => n.id === 'a'),
            false,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);

test(
    'performDeleteSelectedNodes: keeps start/end'
    + ' when the selection mixes them with an'
    + ' intermediate',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('s', { isCreate: true }),
            buildNode('a'),
            buildNode('e', { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                db,
                withNodeSelection(
                    base, 's', 'a', 'e',
                ),
            );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        const ids = op.nodes.map(n => n.id).sort();
        assert.deepEqual(ids, ['e', 's']);
    },
);

test(
    'performDeleteSelectedNodes: locked flow'
    + ' fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op =
            await performDeleteSelectedNodes(
                db,
                locked(
                    withNodeSelection(base, 'a'),
                ),
            );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performDeleteSelectedNodes: an edge'
    + ' selection is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op =
            await performDeleteSelectedNodes(
                db, withEdgeSelection(base, 'e1'),
            );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteSelectedNodes: a selection of'
    + ' only start/end nodes is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('s', { isCreate: true }),
            buildNode('e', { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                db,
                withNodeSelection(base, 's', 'e'),
            );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteSelectedNodes: a commit'
    + ' failure yields a fail result',
    async () => {
        const db = setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performDeleteSelectedNodes(
                db, withNodeSelection(base, 'a'),
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast, /failed to delete state/i,
        );
    },
);

// -- performDeleteSelectedEdge ----------------

test(
    'performDeleteSelectedEdge: removes the'
    + ' selected edge',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op =
            await performDeleteSelectedEdge(
                db, withEdgeSelection(base, 'e1'),
            );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.edgeId, 'e1');
        assert.equal(op.advanceHistory, true);
        const g = await persistedGraph(db);
        assert.equal(g.edges.length, 0);
    },
);

test(
    'performDeleteSelectedEdge: locked flow'
    + ' fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op =
            await performDeleteSelectedEdge(
                db,
                locked(
                    withEdgeSelection(base, 'e1'),
                ),
            );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performDeleteSelectedEdge: a node selection'
    + ' is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op =
            await performDeleteSelectedEdge(
                db, withNodeSelection(base, 'a'),
            );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteSelectedEdge: a commit failure'
    + ' yields a fail result',
    async () => {
        const db = setupNoFlow();
        const base = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op = await silenceConsoleError(
            () => performDeleteSelectedEdge(
                db, withEdgeSelection(base, 'e1'),
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast,
            /failed to delete transition/i,
        );
    },
);

// -- performAddField --------------------------

test(
    'performAddField: appends a trimmed field at'
    + ' the next sort order',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                fields: [buildField('f0')],
            }),
        ]));
        const op = await performAddField(
            db, withNodeSelection(base, 'a'),
            '  Priority  ', 'text', true,
            ['low', 'high'],
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(op.field.name, 'Priority');
        assert.equal(op.field.sortOrder, 1);
        assert.equal(op.field.isRequired, true);
        assert.deepEqual(
            op.field.options, ['low', 'high'],
        );
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performAddField: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddField(
            db,
            locked(withNodeSelection(base, 'a')),
            'X', 'text', false, [],
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performAddField: no single selected node is'
    + ' a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const noneOp = await performAddField(
            db, withNoSelection(base),
            'X', 'text', false, [],
        );
        assert.equal(noneOp.kind, 'noop');
        const manyOp = await performAddField(
            db,
            withNodeSelection(base, 'a', 'b'),
            'X', 'text', false, [],
        );
        assert.equal(manyOp.kind, 'noop');
    },
);

test(
    'performAddField: a selected id that is not'
    + ' a node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddField(
            db, withNodeSelection(base, 'ghost'),
            'X', 'text', false, [],
        );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performAddField: a commit failure yields a'
    + ' fail result',
    async () => {
        const db = setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performAddField(
                db, withNodeSelection(base, 'a'),
                'X', 'text', false, [],
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast, /failed to add field/i,
        );
    },
);

// -- performDeleteField -----------------------

test(
    'performDeleteField: removes the field from'
    + ' the single selected node',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                fields: [buildField('f1')],
            }),
        ]));
        const op = await performDeleteField(
            db, withNodeSelection(base, 'a'), 'f1',
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(op.fieldId, 'f1');
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performDeleteField: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                fields: [buildField('f1')],
            }),
        ]));
        const op = await performDeleteField(
            db,
            locked(withNodeSelection(base, 'a')),
            'f1',
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performDeleteField: no single selected node'
    + ' is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                fields: [buildField('f1')],
            }),
        ]));
        const op = await performDeleteField(
            db, withNoSelection(base), 'f1',
        );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteField: a commit failure yields'
    + ' a fail result',
    async () => {
        const db = setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                fields: [buildField('f1')],
            }),
        ]));
        const op = await silenceConsoleError(
            () => performDeleteField(
                db, withNodeSelection(base, 'a'),
                'f1',
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast,
            /failed to delete field/i,
        );
    },
);

// -- performUndo ------------------------------

test(
    'performUndo: with no versions is a no-op'
    + ' that returns the same snapshot',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const op = await performUndo(
            db, snap,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.freshSnap, snap);
        assert.equal(
            op.newHistory.hasUndoHistory, false,
        );
    },
);

test(
    'performUndo: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode('a'),
        ])));
        const op = await performUndo(
            db, snap,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performUndo: restores the latest version,'
    + ' consumes it, and stages a redo entry',
    async () => {
        const { db, ctx } = await setupFlow();
        // Snapshot the 2-node baseline as v1.
        await ctx.commit({
            ops: [{
                method: 'put',
                resource: 'flow-versions/v1',
                body: {
                    flow_id: FLOW_ID,
                    name: 'Test Flow',
                    description: '',
                    is_locked: false,
                    is_auto_layout: true,
                    is_auto_fit: true,
                    lock_timeout:
                        DEFAULT_LOCK_TIMEOUT,
                    graph: JSON.stringify({
                        nodes: [
                            buildNode('a'),
                            buildNode('b'),
                        ],
                        edges: [],
                    }),
                    at:
                        '2026-01-01T00:00:00.000Z',
                },
            }],
        });
        // Current state has a third node.
        const snap = snapFrom(buildGraph([
            buildNode('a'),
            buildNode('b'),
            buildNode('c'),
        ]));
        const op = await performUndo(
            db, snap,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(
            op.freshSnap.nodes.length, 2,
        );
        assert.equal(
            op.newHistory.hasUndoHistory, false,
        );
        assert.equal(
            op.newHistory.redoStack.length, 1,
        );
        assert.equal(
            op.newHistory.redoStack[0]!
                .nodes.length,
            3,
        );
        assert.equal(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);

// -- performRedo ------------------------------

test(
    'performRedo: with an empty redo stack is a'
    + ' no-op that returns the same snapshot',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const op = await performRedo(
            db, snap,
            buildFlowHistorySnapshot(false),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.freshSnap, snap);
    },
);

test(
    'performRedo: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode('a'),
        ])));
        const op = await performRedo(
            db, snap,
            appendToRedoStack(
                buildFlowHistorySnapshot(false),
                buildFlowVersion(),
            ),
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performRedo: re-applies the popped version,'
    + ' snapshots the current state, and marks'
    + ' undo available',
    async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion({
                nodes: [
                    buildNode('a'),
                    buildNode('b'),
                ],
            }),
        );
        const op = await performRedo(
            db, snap, history,
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(
            op.freshSnap.nodes.length, 2,
        );
        assert.equal(
            op.newHistory.hasUndoHistory, true,
        );
        assert.equal(
            op.newHistory.redoStack.length, 0,
        );
        assert.equal(
            await flowVersionCount(db), 1,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);

test(
    'performRedo: a commit failure yields a fail'
    + ' result',
    async () => {
        const db = setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion(),
        );
        const op = await silenceConsoleError(
            () => performRedo(db, snap, history),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(settled.toast, /redo failed/i);
    },
);
