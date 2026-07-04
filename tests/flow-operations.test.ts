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
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    postFlowCreation,
    putFlow,
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
    performAddAttributeRef,
    performRemoveAttributeRef,
    performUpdateAttributeMode,
    performUpdateAttributeRequired,
    performUndo,
    performRedo,
} from '../web-app/app/flow-operations.ts';
import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const FLOW_ID = 'flow-1';

// -- Builders ---------------------------------

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

function buildAttributeRef(
    attributeId: string,
    overrides?: Partial<NodeAttribute>,
): NodeAttribute {
    return {
        attributeId,
        mode: 'editable',
        isRequired: false,
        ...overrides,
    };
}

function buildGraph(
    nodes: GraphNode[],
    edges: GraphEdge[] = [],
): FlowGraph {
    return {
        id: FLOW_ID,
        name: 'Test Flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        createdAt: '2026-01-01T00:00:00.000000Z',
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
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [buildNode('a'), buildNode('b')],
        edges: [],
        createdAt: '2026-01-01T00:00:00.000000Z',
        ...overrides,
    };
}

function snapFrom(graph: FlowGraph): FlowSnapshot {
    return buildInitialFlowSnapshot(
        graph, 800, 600, [], [], [],
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
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    const ctx = createRequestContext(db, DEV_TOKEN);
    await postFlowCreation(ctx, {
        flowId: FLOW_ID,
        linkId: FLOW_ID + '-link',
        projectId: 'project-1',
        name: 'Test Flow',
    });
    return { db, ctx };
}

// A db with NO flow row: commitFlowMutation's
// postFlowVersion does ctx.GET('flows/flow-1')
// which 404s, driving the catch → failOp(...).
async function setupNoFlow(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function persistedGraph(
    db: MemoryDbAdapter,
): Promise<StoredGraph> {
    const flow = await createRequestContext(db, DEV_TOKEN)
        .GET<{ graph: string }>(
            'flows/' + FLOW_ID,
        );
    return JSON.parse(flow.graph) as StoredGraph;
}

async function flowVersionCount(
    db: MemoryDbAdapter,
): Promise<number> {
    const rows = await createRequestContext(db, DEV_TOKEN)
        .GET<unknown[]>('flows/' + FLOW_ID + '/versions');
    return rows.length;
}

// Save a graph through the real route (putFlow) so the four
// relation tables hold exactly this state — the read source
// GET /flows/:id reassembles from. Undo/redo diff their
// in-memory snap against a version; that diff only applies
// correctly when the relations already carry the snap's graph.
async function seedCurrentGraph(
    ctx: RequestContext,
    nodes: GraphNode[],
    edges: GraphEdge[] = [],
): Promise<void> {
    await putFlow(ctx, FLOW_ID, {
        name: 'Test Flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes,
        edges,
    });
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 'b',
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
            createRequestContext(db, DEV_TOKEN), snap, 's', 'a',
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 'b',
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
                createRequestContext(db, DEV_TOKEN), snap, 'missing', 'b',
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
                createRequestContext(db, DEV_TOKEN), snap, 'a', 'missing',
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
            createRequestContext(db, DEV_TOKEN), snap, 'e', 'a',
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 's',
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 'b',
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
            createRequestContext(db, DEV_TOKEN), snap, 's', 'b',
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
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const op = await silenceConsoleError(
            () => performAddEdge(
                createRequestContext(db, DEV_TOKEN),
                snap, 'a', 'b',
            ),
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 300, 200,
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
            createRequestContext(db, DEV_TOKEN), snap, 'a', 0, 0,
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
                createRequestContext(db, DEV_TOKEN), snap, 'missing', 0, 0,
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
            createRequestContext(db, DEV_TOKEN), snap, 'e', 0, 0,
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
            createRequestContext(db, DEV_TOKEN), snap, 's', 0, 0,
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
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performAddNodeAtPosition(
                createRequestContext(db, DEV_TOKEN), snap, 'a', 0, 0,
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
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
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
                createRequestContext(db, DEV_TOKEN),
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
                createRequestContext(db, DEV_TOKEN),
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
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'e1'),
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
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 's', 'e'),
            );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteSelectedNodes: a commit'
    + ' failure yields a fail result',
    async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
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
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'e1'),
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
                createRequestContext(db, DEV_TOKEN),
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
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
            );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performDeleteSelectedEdge: a commit failure'
    + ' yields a fail result',
    async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph(
            [buildNode('a'), buildNode('b')],
            [buildEdge('e1', 'a', 'b')],
        ));
        const op = await silenceConsoleError(
            () => performDeleteSelectedEdge(
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'e1'),
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

// -- performAddAttributeRef -------------------

test(
    'performAddAttributeRef: appends a ref to the'
    + ' single selected node',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'a'),
            'attr-1', 'editable', true,
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(
            op.ref.attributeId, 'attr-1',
        );
        assert.equal(op.ref.mode, 'editable');
        assert.equal(op.ref.isRequired, true);
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performAddAttributeRef: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, 'a')),
            'attr-1', 'editable', false,
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performAddAttributeRef: no single selected'
    + ' node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'), buildNode('b'),
        ]));
        const noneOp = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN), withNoSelection(base),
            'attr-1', 'editable', false,
        );
        assert.equal(noneOp.kind, 'noop');
        const manyOp = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'a', 'b'),
            'attr-1', 'editable', false,
        );
        assert.equal(manyOp.kind, 'noop');
    },
);

test(
    'performAddAttributeRef: a selected id that'
    + ' is not a node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'ghost'),
            'attr-1', 'editable', false,
        );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performAddAttributeRef: a commit failure'
    + ' yields a fail result',
    async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const op = await silenceConsoleError(
            () => performAddAttributeRef(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
                'attr-1', 'editable', false,
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast,
            /failed to add attribute/i,
        );
    },
);

// -- performRemoveAttributeRef ----------------

test(
    'performRemoveAttributeRef: removes the ref'
    + ' from the single selected node',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'a'),
            'attr-1',
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(op.attributeId, 'attr-1');
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performRemoveAttributeRef: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, 'a')),
            'attr-1',
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performRemoveAttributeRef: no single selected'
    + ' node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNoSelection(base), 'attr-1',
        );
        assert.equal(op.kind, 'noop');
    },
);

test(
    'performRemoveAttributeRef: a commit failure'
    + ' yields a fail result',
    async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await silenceConsoleError(
            () => performRemoveAttributeRef(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
                'attr-1',
            ),
        );
        const settled = await op;
        assert.equal(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assert.match(
            settled.toast,
            /failed to remove attribute/i,
        );
    },
);

// -- performUpdateAttributeMode ---------------

test(
    'performUpdateAttributeMode: updates the mode'
    + ' on the matching ref',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1', {
                        mode: 'editable',
                    }),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'a'),
            'attr-1', 'readonly',
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(op.attributeId, 'attr-1');
        assert.equal(op.mode, 'readonly');
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performUpdateAttributeMode: locked flow fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, 'a')),
            'attr-1', 'readonly',
        );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performUpdateAttributeMode: no single selected'
    + ' node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN), withNoSelection(base),
            'attr-1', 'readonly',
        );
        assert.equal(op.kind, 'noop');
    },
);

// -- performUpdateAttributeRequired -----------

test(
    'performUpdateAttributeRequired: updates the'
    + ' isRequired flag on the matching ref',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1', {
                        isRequired: false,
                    }),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, 'a'),
                'attr-1', true,
            );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(op.nodeId, 'a');
        assert.equal(op.attributeId, 'attr-1');
        assert.equal(op.isRequired, true);
        assert.equal(op.advanceHistory, true);
    },
);

test(
    'performUpdateAttributeRequired: locked flow'
    + ' fails',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN),
                locked(
                    withNodeSelection(base, 'a'),
                ),
                'attr-1', true,
            );
        assert.equal(op.kind, 'fail');
    },
);

test(
    'performUpdateAttributeRequired: no single'
    + ' selected node is a no-op',
    async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode('a', {
                attributes: [
                    buildAttributeRef('attr-1'),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN), withNoSelection(base),
                'attr-1', true,
            );
        assert.equal(op.kind, 'noop');
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
            createRequestContext(db, DEV_TOKEN), snap,
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
            createRequestContext(db, DEV_TOKEN), snap,
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
        await ctx.PUT('flows/' + FLOW_ID + '/versions/v1', {
            flow_id: FLOW_ID,
            name: 'Test Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: JSON.stringify({
                nodes: [
                    buildNode('a'),
                    buildNode('b'),
                ],
                edges: [],
            }),
            at: '2026-01-01T00:00:00.000000Z',
        });
        // Current state has a third node. Seed the relations
        // with that same graph so GET /flows/:id (the read
        // source) reflects what the snap claims is current —
        // the undo diff (current → version) then applies
        // against real rows, not an empty graph.
        const currentNodes = [
            buildNode('a'),
            buildNode('b'),
            buildNode('c'),
        ];
        await seedCurrentGraph(ctx, currentNodes);
        const snap = snapFrom(buildGraph(currentNodes));
        const op = await performUndo(
            createRequestContext(db, DEV_TOKEN), snap,
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
            createRequestContext(db, DEV_TOKEN), snap,
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
            createRequestContext(db, DEV_TOKEN), snap,
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
        const { db, ctx } = await setupFlow();
        // Seed the relations with the current single-node graph
        // so GET /flows/:id reflects the snap; redo diffs this
        // current graph against the popped (a,b) version.
        const currentNodes = [buildNode('a')];
        await seedCurrentGraph(ctx, currentNodes);
        const snap = snapFrom(buildGraph(currentNodes));
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
            createRequestContext(db, DEV_TOKEN), snap, history,
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

// Fix wave 1 (Task 4 review): redo's write sequence now rides
// ONE covenant catch (postFlowVersion, then putFlow — see the
// tests below), matching every OTHER perform* mutation's
// commitFlowMutation precedent, where a missing flow ALREADY
// degrades to a graceful failOp ('a commit failure yields a
// fail result', throughout this file). Base's original split —
// buildFlowVersionSnapshot's read OUTSIDE any catch, only the
// POST /flows/:id/redo write guarded — no longer exists once the
// read and the archive-write share ONE opaque call
// (postFlowVersion); keeping redo the lone sibling that crashes
// on a missing flow would leave it inconsistent with the family
// the fold set out to match. So the read now shares the same
// covenant as every other mutation's read-then-write.
test(
    'performRedo: a missing flow fails gracefully —'
    + ' postFlowVersion\'s own read shares the redo'
    + ' sequence\'s one covenant catch, matching every'
    + ' sibling perform* mutation',
    async () => {
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode('a'),
        ]));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion(),
        );
        const op = await silenceConsoleError(
            () => performRedo(
                createRequestContext(db, DEV_TOKEN),
                snap, history,
            ),
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /redo failed/i);
    },
);

// A ctx whose POST to a named operation faults. For
// performUndo, the composing flow-write + version-op still
// ride ONE named POST /flows/:id/undo, so this proves the
// one-transaction covenant: when that POST rejects, the
// underlying transaction applied NOTHING. Task 4 folded redo
// into the locked save, so redo no longer has a single named
// POST to fault this way for its WHOLE composition — see
// faultingPutCtx below for its PUT-side sibling, used to
// fault redo's second (now-independent) write. GET/PUT/DELETE
// pass through to the real db. POST to any OTHER resource
// passes through, so only the operation under test is
// faulted.
function faultingPostCtx(
    ctx: RequestContext,
    faultResource: string,
): {
    ctx: RequestContext;
    posts: () => number;
} {
    let count = 0;
    const wrapped: RequestContext = {
        ...ctx,
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ): Promise<T> => {
            if (resource === faultResource) {
                count += 1;
                return Promise.reject(
                    new Error('injected POST fault'),
                );
            }
            return ctx.POST<T>(resource, body);
        },
    };
    return { ctx: wrapped, posts: () => count };
}

// The PUT-side sibling of faultingPostCtx. Task 4's redo
// composes postFlowVersion (a POST) then putFlow (a PUT) as
// two INDEPENDENT writes — this lets a test fault the SECOND
// write specifically, after the first has already landed,
// proving the fold is no longer atomic across both writes
// (the named R1/E5 trade-off). GET/POST/DELETE pass through
// to the real db; PUT to any OTHER resource passes through
// too, so only the operation under test is faulted.
function faultingPutCtx(
    ctx: RequestContext,
    faultResource: string,
): {
    ctx: RequestContext;
    puts: () => number;
} {
    let count = 0;
    const wrapped: RequestContext = {
        ...ctx,
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields?:
                readonly (readonly [string, string])[],
        ): Promise<T> => {
            if (resource === faultResource) {
                count += 1;
                return Promise.reject(
                    new Error('injected PUT fault'),
                );
            }
            return ctx.PUT<T>(resource, body, headerFields);
        },
    };
    return { ctx: wrapped, puts: () => count };
}

test(
    'performUndo: restore + consume ride ONE'
    + ' transaction; a faulted POST /flows/:id/undo'
    + ' applies nothing',
    async () => {
        const { db, ctx } = await setupFlow();
        await ctx.PUT('flows/' + FLOW_ID + '/versions/v1', {
            flow_id: FLOW_ID,
            name: 'Test Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: JSON.stringify({
                nodes: [
                    buildNode('a'),
                    buildNode('b'),
                ],
                edges: [],
            }),
            at: '2026-01-01T00:00:00.000000Z',
        });
        const snap = snapFrom(buildGraph([
            buildNode('a'),
            buildNode('b'),
            buildNode('c'),
        ]));
        const faulting = faultingPostCtx(
            ctx, 'flows/' + FLOW_ID + '/undo',
        );
        const op = await silenceConsoleError(
            () => performUndo(
                faulting.ctx, snap,
                buildFlowHistorySnapshot(true),
            ),
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /undo failed/i);
        assert.equal(faulting.posts(), 1);
        // nothing applied: the consumed version row
        // survives AND the persisted graph keeps the
        // seeded start + complete pair (the revert
        // never landed; the 3-node snap was only ever
        // the client's view, never persisted)
        assert.equal(
            await flowVersionCount(db), 1,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);

// Task 4 (R1/E5): redo's retired POST /flows/:id/redo carried
// its own one-transaction covenant; the fold splits it into
// postFlowVersion (a POST) then putFlow (a PUT), two
// INDEPENDENT writes — the same non-atomic shape every OTHER
// perform* mutation (commitFlowMutation) already carries. The
// two tests below fault each write in turn. performRedo wraps
// BOTH writes in one catch (mirroring performUndo's single
// covenant for its own one-call write) — a faulted write
// degrades to the SAME visible failOp('Redo failed', ...),
// exactly like the missing-flow case above, never an unhandled
// rejection (Swallowed Failures guard honored: the failure
// surfaces via the toast channel every other perform* mutation
// already uses). putFlow's OWN internal loop separately absorbs
// a 412 (up to 3 attempts) before ever reaching this catch.

test(
    'performRedo: a faulted version-POST fails'
    + ' gracefully; nothing lands (postFlowVersion'
    + ' runs FIRST, before putFlow)',
    async () => {
        const { db, ctx } = await setupFlow();
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
        const faulting = faultingPostCtx(
            ctx, 'flows/' + FLOW_ID + '/versions',
        );
        const op = await silenceConsoleError(
            () => performRedo(
                faulting.ctx, snap, history,
            ),
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /redo failed/i);
        assert.equal(faulting.posts(), 1);
        // nothing applied: no new version row, and
        // the persisted graph stays the seeded
        // start + complete pair (putFlow never ran)
        assert.equal(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);

test(
    'performRedo: a faulted document-PUT fails'
    + ' gracefully AFTER the version already'
    + ' landed — the fold\'s two writes are no'
    + ' longer one transaction (named R1/E5'
    + ' trade-off)',
    async () => {
        const { db, ctx } = await setupFlow();
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
        const faulting = faultingPutCtx(
            ctx, 'flows/' + FLOW_ID,
        );
        const op = await silenceConsoleError(
            () => performRedo(
                faulting.ctx, snap, history,
            ),
        );
        assert.equal(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assert.match(op.toast, /redo failed/i);
        assert.equal(faulting.puts(), 1);
        // the version-POST already landed — it runs
        // FIRST and is not itself faulted, so the two
        // now-independent writes leave the version
        // archived even though the document save fails.
        assert.equal(
            await flowVersionCount(db), 1,
        );
        // the document PUT never applied: the graph
        // stays the seeded start + complete pair.
        const g = await persistedGraph(db);
        assert.equal(g.nodes.length, 2);
    },
);
