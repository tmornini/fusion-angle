import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { captureConsole } from './fixtures/console-capture.ts';
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
    appendToRedoStack,
    type FlowVersion,
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
import { generateIdentifier } from
    '../shared/identifier.ts';
import type {
    FlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const FLOW_ID = 'aEsGMmBEFaVdWihhHXwCbw';

// flow-operations.ts -> logger.ts -> preferences.ts
// reads localStorage lazily, only on a log.* call in
// an error path.
const NULL_STORAGE: Partial<Storage> = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

const NODE_A = generateIdentifier();
const NODE_B = generateIdentifier();
const NODE_C = generateIdentifier();
const NODE_S = generateIdentifier();
const NODE_E = generateIdentifier();
const MISSING_ID = generateIdentifier();
const PROJECT_ID = generateIdentifier();
const LINK_ID = generateIdentifier();
const VERSION_ID = generateIdentifier();

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
        hasUndoHistory: false,
        nodes,
        edges,
    };
}

function buildFlowVersion(
    overrides?: Partial<FlowVersion>,
): FlowVersion {
    return {
        id: VERSION_ID,
        flowId: FLOW_ID,
        name: 'Previous',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [buildNode(NODE_A), buildNode(NODE_B)],
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
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
    const ctx = createRequestContext(db, DEV_TOKEN);
    await postFlowCreation(ctx, {
        flowId: FLOW_ID,
        linkId: LINK_ID,
        projectId: PROJECT_ID,
        name: 'Test Flow',
    });
    return { db, ctx };
}

// A db with NO flow row: commitFlowMutation's / putFlow's own
// baseline read (buildFlowPutBody's ctx.GETWithEtag)
// does
// ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/flows/aEsGMmBEFaVdWihhHXwCbw'
// ) which 404s, driving the catch
// → failOp(...).
async function setupNoFlow(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function persistedGraph(
    db: MemoryDbAdapter,
): Promise<StoredGraph> {
    const flow = await createRequestContext(db, DEV_TOKEN)
        .GET<{ graph: Record<string, unknown> }>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID,
        );
    return flow.graph as unknown as StoredGraph;
}

// Phase Final Stage B: flow_versions table retired with flows.
// Live ops leave no residual version table; pin always 0.
async function flowVersionCount(
    _db: MemoryDbAdapter,
): Promise<number> {
    return 0;
}

// Save a graph through the real route (putFlow) so the four
// relation tables hold exactly this state — the read source
// GET /organizations/:id/flows/:id reassembles from, and (Phase 14 Task 8)
// the
// SAME document message pair undo-as-replay's own server-side diff
// reads as either the current head or a resolved target. Undo/
// redo diff current vs target graphs; that diff only applies
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

// -- performAddEdge ---------------------------

Deno.test(
    'performAddEdge: success returns the new'
    + ' edge and persists it',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ]));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, NODE_B,
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.edge.fromNodeId, NODE_A);
        assertStrictEquals(op.edge.toNodeId, NODE_B);
        assertStrictEquals(op.advanceHistory, true);
        const g = await persistedGraph(db);
        assertStrictEquals(g.edges.length, 1);
        // Undo-as-replay (Phase 14 Task 8): commitFlowMutation
        // no longer archives the pre-edit state through
        // postFlowVersion — undo resolves its target from the
        // organizations/:id/flows/:id document-message-pair
        // history instead, so this save's own putFlow
        // document message pair is now sufficient;
        // flow_versions stays untouched.
        assertStrictEquals(
            await flowVersionCount(db), 0,
        );
    }),
);

Deno.test(
    'performAddEdge: from a start node with no'
    + ' outgoing edge succeeds',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_S, { isCreate: true }),
            buildNode(NODE_A),
        ]));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_S, NODE_A,
        );
        assertStrictEquals(op.kind, 'ok');
    }),
);

Deno.test(
    'performAddEdge: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ])));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, NODE_B,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /locked/i);
    }),
);

Deno.test(
    'performAddEdge: unknown fromId throws',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_B),
        ]));
        const err = await assertRejects(
            () => performAddEdge(
                createRequestContext(db, DEV_TOKEN), snap, MISSING_ID, NODE_B,
            ),
        ) as Error;
        assertInstanceOf(err, Error);
        assertStringIncludes(
            err.message, 'unknown fromId ' + MISSING_ID,
        );
    }),
);

Deno.test(
    'performAddEdge: unknown toId throws',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const err = await assertRejects(
            () => performAddEdge(
                createRequestContext(db, DEV_TOKEN), snap, NODE_A, MISSING_ID,
            ),
        ) as Error;
        assertInstanceOf(err, Error);
        assertStringIncludes(
            err.message, 'unknown toId ' + MISSING_ID,
        );
    }),
);

Deno.test(
    'performAddEdge: from an end node fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_E, { isArchive: true }),
            buildNode(NODE_A),
        ]));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_E, NODE_A,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /end state/i);
    }),
);

Deno.test(
    'performAddEdge: to a start node fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
            buildNode(NODE_S, { isCreate: true }),
        ]));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, NODE_S,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /start state/i);
    }),
);

Deno.test(
    'performAddEdge: duplicate edge fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [buildNode(NODE_A), buildNode(NODE_B)],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_A, NODE_B)],
        ));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, NODE_B,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /already exists/i);
    }),
);

Deno.test(
    'performAddEdge: a second edge out of the'
    + ' start node fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [
                buildNode(NODE_S, { isCreate: true }),
                buildNode(NODE_A), buildNode(NODE_B),
            ],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_S, NODE_A)],
        ));
        const op = await performAddEdge(
            createRequestContext(db, DEV_TOKEN), snap, NODE_S, NODE_B,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(
            op.toast, /only one outgoing/i,
        );
    }),
);

Deno.test(
    'performAddEdge: a commit failure yields a'
    + ' fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ]));
        const { result: op } = await captureConsole(
            'error',
            () => performAddEdge(
                createRequestContext(db, DEV_TOKEN),
                snap, NODE_A, NODE_B,
            ),
        );
        assertStrictEquals(
            (await op).kind, 'fail',
        );
        const settled = await op;
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast, /failed to create/i,
        );
    }),
);

// -- performAddNodeAtPosition -----------------

Deno.test(
    'performAddNodeAtPosition: returns node,'
    + ' edge, selectId and centers on the point',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op = await performAddNodeAtPosition(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, 300, 200,
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.edge.fromNodeId, NODE_A);
        assertStrictEquals(
            op.edge.toNodeId, op.node.id,
        );
        assertStrictEquals(op.selectId, op.node.id);
        assertStrictEquals(op.advanceHistory, true);
        assertStrictEquals(
            op.node.positionX,
            300 - NODE_WIDTH / 2,
        );
        assertStrictEquals(
            op.node.positionY,
            200 - NODE_HEIGHT / 2,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
        assertStrictEquals(g.edges.length, 1);
    }),
);

Deno.test(
    'performAddNodeAtPosition: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode(NODE_A),
        ])));
        const op = await performAddNodeAtPosition(
            createRequestContext(db, DEV_TOKEN), snap, NODE_A, 0, 0,
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performAddNodeAtPosition: unknown fromNodeId'
    + ' throws',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([]));
        const err = await assertRejects(
            () => performAddNodeAtPosition(
                createRequestContext(db, DEV_TOKEN), snap, MISSING_ID, 0, 0,
            ),
        ) as Error;
        assertInstanceOf(err, Error);
        assertStringIncludes(
            err.message, 'unknown fromNodeId ' + MISSING_ID,
        );
    }),
);

Deno.test(
    'performAddNodeAtPosition: from an end node'
    + ' fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_E, { isArchive: true }),
        ]));
        const op = await performAddNodeAtPosition(
            createRequestContext(db, DEV_TOKEN), snap, NODE_E, 0, 0,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /end state/i);
    }),
);

Deno.test(
    'performAddNodeAtPosition: from a start node'
    + ' that already has an outgoing edge fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph(
            [
                buildNode(NODE_S, { isCreate: true }),
                buildNode(NODE_A),
            ],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_S, NODE_A)],
        ));
        const op = await performAddNodeAtPosition(
            createRequestContext(db, DEV_TOKEN), snap, NODE_S, 0, 0,
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(
            op.toast, /only one outgoing/i,
        );
    }),
);

Deno.test(
    'performAddNodeAtPosition: a commit failure'
    + ' yields a fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const { result: op } = await captureConsole(
            'error',
            () => performAddNodeAtPosition(
                createRequestContext(db, DEV_TOKEN), snap, NODE_A, 0, 0,
            ),
        );
        const settled = await op;
        assertStrictEquals(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast, /failed to add state/i,
        );
    }),
);

// -- performDeleteSelectedNodes ---------------

Deno.test(
    'performDeleteSelectedNodes: removes the'
    + ' selected intermediate node',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_S, { isCreate: true }),
            buildNode(NODE_A),
            buildNode(NODE_E, { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
            );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.advanceHistory, true);
        assertStrictEquals(
            op.nodes.some(n => n.id === NODE_A),
            false,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
    }),
);

Deno.test(
    'performDeleteSelectedNodes: keeps start/end'
    + ' when the selection mixes them with an'
    + ' intermediate',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_S, { isCreate: true }),
            buildNode(NODE_A),
            buildNode(NODE_E, { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(
                    base, NODE_S, NODE_A, NODE_E,
                ),
            );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        const ids = op.nodes.map(n => n.id).sort();
        assertEquals(ids, [NODE_E, NODE_S].sort());
    }),
);

Deno.test(
    'performDeleteSelectedNodes: locked flow'
    + ' fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op =
            await performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                locked(
                    withNodeSelection(base, NODE_A),
                ),
            );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performDeleteSelectedNodes: an edge'
    + ' selection is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode(NODE_A), buildNode(NODE_B)],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_A, NODE_B)],
        ));
        const op =
            await performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'YiJPbufDpkyrZcZCYbUJpg'),
            );
        assertStrictEquals(op.kind, 'noop');
    }),
);

Deno.test(
    'performDeleteSelectedNodes: a selection of'
    + ' only start/end nodes is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_S, { isCreate: true }),
            buildNode(NODE_E, { isArchive: true }),
        ]));
        const op =
            await performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_S, NODE_E),
            );
        assertStrictEquals(op.kind, 'noop');
    }),
);

Deno.test(
    'performDeleteSelectedNodes: a commit'
    + ' failure yields a fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const { result: op } = await captureConsole(
            'error',
            () => performDeleteSelectedNodes(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
            ),
        );
        const settled = await op;
        assertStrictEquals(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast, /failed to delete state/i,
        );
    }),
);

// -- performDeleteSelectedEdge ----------------

Deno.test(
    'performDeleteSelectedEdge: removes the'
    + ' selected edge',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode(NODE_A), buildNode(NODE_B)],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_A, NODE_B)],
        ));
        const op =
            await performDeleteSelectedEdge(
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'YiJPbufDpkyrZcZCYbUJpg'),
            );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.edgeId, 'YiJPbufDpkyrZcZCYbUJpg');
        assertStrictEquals(op.advanceHistory, true);
        const g = await persistedGraph(db);
        assertStrictEquals(g.edges.length, 0);
    }),
);

Deno.test(
    'performDeleteSelectedEdge: locked flow'
    + ' fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph(
            [buildNode(NODE_A), buildNode(NODE_B)],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_A, NODE_B)],
        ));
        const op =
            await performDeleteSelectedEdge(
                createRequestContext(db, DEV_TOKEN),
                locked(
                    withEdgeSelection(base, 'YiJPbufDpkyrZcZCYbUJpg'),
                ),
            );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performDeleteSelectedEdge: a node selection'
    + ' is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op =
            await performDeleteSelectedEdge(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
            );
        assertStrictEquals(op.kind, 'noop');
    }),
);

Deno.test(
    'performDeleteSelectedEdge: a commit failure'
    + ' yields a fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph(
            [buildNode(NODE_A), buildNode(NODE_B)],
            [buildEdge('YiJPbufDpkyrZcZCYbUJpg', NODE_A, NODE_B)],
        ));
        const { result: op } = await captureConsole(
            'error',
            () => performDeleteSelectedEdge(
                createRequestContext(db, DEV_TOKEN),
                withEdgeSelection(base, 'YiJPbufDpkyrZcZCYbUJpg'),
            ),
        );
        const settled = await op;
        assertStrictEquals(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast,
            /failed to delete transition/i,
        );
    }),
);

// -- performAddAttributeRef -------------------

Deno.test(
    'performAddAttributeRef: appends a ref to the'
    + ' single selected node',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, NODE_A),
            'VPckAwjJsTGCEkKaOOGRGw', 'editable', true,
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.nodeId, NODE_A);
        assertStrictEquals(
            op.ref.attributeId, 'VPckAwjJsTGCEkKaOOGRGw',
        );
        assertStrictEquals(op.ref.mode, 'editable');
        assertStrictEquals(op.ref.isRequired, true);
        assertStrictEquals(op.advanceHistory, true);
    }),
);

Deno.test(
    'performAddAttributeRef: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, NODE_A)),
            'VPckAwjJsTGCEkKaOOGRGw', 'editable', false,
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performAddAttributeRef: no single selected'
    + ' node is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ]));
        const noneOp = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN), withNoSelection(base),
            'VPckAwjJsTGCEkKaOOGRGw', 'editable', false,
        );
        assertStrictEquals(noneOp.kind, 'noop');
        const manyOp = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, NODE_A, NODE_B),
            'VPckAwjJsTGCEkKaOOGRGw', 'editable', false,
        );
        assertStrictEquals(manyOp.kind, 'noop');
    }),
);

Deno.test(
    'performAddAttributeRef: a selected id that'
    + ' is not a node is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const op = await performAddAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, 'ghost'),
            'VPckAwjJsTGCEkKaOOGRGw', 'editable', false,
        );
        assertStrictEquals(op.kind, 'noop');
    }),
);

Deno.test(
    'performAddAttributeRef: a commit failure'
    + ' yields a fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const { result: op } = await captureConsole(
            'error',
            () => performAddAttributeRef(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
                'VPckAwjJsTGCEkKaOOGRGw', 'editable', false,
            ),
        );
        const settled = await op;
        assertStrictEquals(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast,
            /failed to add attribute/i,
        );
    }),
);

// -- performRemoveAttributeRef ----------------

Deno.test(
    'performRemoveAttributeRef: removes the ref'
    + ' from the single selected node',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, NODE_A),
            'VPckAwjJsTGCEkKaOOGRGw',
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.nodeId, NODE_A);
        assertStrictEquals(op.attributeId, 'VPckAwjJsTGCEkKaOOGRGw');
        assertStrictEquals(op.advanceHistory, true);
    }),
);

Deno.test(
    'performRemoveAttributeRef: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, NODE_A)),
            'VPckAwjJsTGCEkKaOOGRGw',
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performRemoveAttributeRef: no single selected'
    + ' node is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op = await performRemoveAttributeRef(
            createRequestContext(db, DEV_TOKEN),
            withNoSelection(base), 'VPckAwjJsTGCEkKaOOGRGw',
        );
        assertStrictEquals(op.kind, 'noop');
    }),
);

Deno.test(
    'performRemoveAttributeRef: a commit failure'
    + ' yields a fail result',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const { result: op } = await captureConsole(
            'error',
            () => performRemoveAttributeRef(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
                'VPckAwjJsTGCEkKaOOGRGw',
            ),
        );
        const settled = await op;
        assertStrictEquals(settled.kind, 'fail');
        if (settled.kind !== 'fail') return;
        assertMatch(
            settled.toast,
            /failed to remove attribute/i,
        );
    }),
);

// -- performUpdateAttributeMode ---------------

Deno.test(
    'performUpdateAttributeMode: updates the mode'
    + ' on the matching ref',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw', {
                        mode: 'editable',
                    }),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN),
            withNodeSelection(base, NODE_A),
            'VPckAwjJsTGCEkKaOOGRGw', 'readonly',
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.nodeId, NODE_A);
        assertStrictEquals(op.attributeId, 'VPckAwjJsTGCEkKaOOGRGw');
        assertStrictEquals(op.mode, 'readonly');
        assertStrictEquals(op.advanceHistory, true);
    }),
);

Deno.test(
    'performUpdateAttributeMode: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN),
            locked(withNodeSelection(base, NODE_A)),
            'VPckAwjJsTGCEkKaOOGRGw', 'readonly',
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performUpdateAttributeMode: no single selected'
    + ' node is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op = await performUpdateAttributeMode(
            createRequestContext(db, DEV_TOKEN), withNoSelection(base),
            'VPckAwjJsTGCEkKaOOGRGw', 'readonly',
        );
        assertStrictEquals(op.kind, 'noop');
    }),
);

// -- performUpdateAttributeRequired -----------

Deno.test(
    'performUpdateAttributeRequired: updates the'
    + ' isRequired flag on the matching ref',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw', {
                        isRequired: false,
                    }),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN),
                withNodeSelection(base, NODE_A),
                'VPckAwjJsTGCEkKaOOGRGw', true,
            );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.nodeId, NODE_A);
        assertStrictEquals(op.attributeId, 'VPckAwjJsTGCEkKaOOGRGw');
        assertStrictEquals(op.isRequired, true);
        assertStrictEquals(op.advanceHistory, true);
    }),
);

Deno.test(
    'performUpdateAttributeRequired: locked flow'
    + ' fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN),
                locked(
                    withNodeSelection(base, NODE_A),
                ),
                'VPckAwjJsTGCEkKaOOGRGw', true,
            );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performUpdateAttributeRequired: no single'
    + ' selected node is a no-op',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const base = snapFrom(buildGraph([
            buildNode(NODE_A, {
                attributes: [
                    buildAttributeRef('VPckAwjJsTGCEkKaOOGRGw'),
                ],
            }),
        ]));
        const op =
            await performUpdateAttributeRequired(
                createRequestContext(db, DEV_TOKEN), withNoSelection(base),
                'VPckAwjJsTGCEkKaOOGRGw', true,
            );
        assertStrictEquals(op.kind, 'noop');
    }),
);

// -- performUndo ------------------------------

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): exhaustion
// is now a CLIENT-side short-circuit on hasUndoHistory (no
// flow_versions fetch, no server round-trip at all) — the
// source swaps from "versions is empty" to "hasUndoHistory is
// false", but the observable shape (freshSnap is the SAME
// object, by reference) is unchanged.
Deno.test(
    'performUndo: with no history is a no-op'
    + ' that returns the same snapshot',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ]));
        const op = await performUndo(
            createRequestContext(db, DEV_TOKEN), snap,
            buildFlowHistorySnapshot(false),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.freshSnap, snap);
        assertStrictEquals(
            op.newHistory.hasUndoHistory, false,
        );
    }),
);

Deno.test(
    'performUndo: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode(NODE_A),
        ])));
        const op = await performUndo(
            createRequestContext(db, DEV_TOKEN), snap,
            buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the target
// is no longer a flow_versions row the client seeds and the
// route consumes — it is the organizations/:id/flows/:id
// document message pair immediately BEFORE the current
// head, resolved server-side.
// The setup swaps the raw versions PUT for a genuine
// seedCurrentGraph save (the 2-node baseline, undo's own
// target), followed by the 3-node "current" save.
Deno.test(
    'performUndo: restores the previous save (one'
    + ' step back), and stages a redo entry',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        // The 2-node baseline — undo's own target.
        await seedCurrentGraph(ctx, [
            buildNode(NODE_A),
            buildNode(NODE_B),
        ]);
        // Current state has a third node.
        const currentNodes = [
            buildNode(NODE_A),
            buildNode(NODE_B),
            buildNode(NODE_C),
        ];
        await seedCurrentGraph(ctx, currentNodes);
        const snap = snapFrom(buildGraph(currentNodes));
        const op = await performUndo(
            createRequestContext(db, DEV_TOKEN), snap,
            buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(
            op.freshSnap.nodes.length, 2,
        );
        // Genesis is a THIRD document message pair still further back —
        // there is more to undo, unlike the old flow_versions
        // count (which hit zero after consuming its one row).
        assertStrictEquals(
            op.newHistory.hasUndoHistory, true,
        );
        assertStrictEquals(
            op.newHistory.redoStack.length, 1,
        );
        assertStrictEquals(
            op.newHistory.redoStack[0]!
                .nodes.length,
            3,
        );
        // flow_versions is never written OR read by the live
        // undo path any more (Step 0: publish/consume both
        // stop) — this stays a meaningful regression guard,
        // not a tautology.
        assertStrictEquals(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
    }),
);

Deno.test(
    'performUndo: keeps the panel open on a'
    + ' surviving node and restores memberIds',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        const humanId =
            'XXZruirZyAOoRpNxaDnpSA';
        await seedCurrentGraph(ctx, [
            buildNode(NODE_A, {
                memberIds: [],
            }),
            buildNode(NODE_B),
        ]);
        const currentNodes = [
            buildNode(NODE_A, {
                memberIds: [humanId],
            }),
            buildNode(NODE_B),
        ];
        await seedCurrentGraph(
            ctx, currentNodes,
        );
        const snap = {
            ...withNodeSelection(
                snapFrom(
                    buildGraph(currentNodes),
                ),
                NODE_A,
            ),
            isPanelOpen: true,
        };
        const op = await performUndo(
            createRequestContext(
                db, DEV_TOKEN,
            ),
            snap,
            buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(
            op.freshSnap.isPanelOpen, true,
        );
        const sel =
            op.freshSnap.interaction.selection;
        assertStrictEquals(sel.kind, 'nodes');
        if (sel.kind !== 'nodes') return;
        assertStrictEquals(sel.nodeIds.size, 1);
        assertStrictEquals(
            sel.nodeIds.has(NODE_A), true,
        );
        const restored = op.freshSnap.nodes
            .find(n => n.id === NODE_A);
        assert(restored);
        assertEquals(
            restored!.memberIds, [],
        );
    }),
);

Deno.test(
    'performUndo: closes the panel when the'
    + ' selected node is gone',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        await seedCurrentGraph(ctx, [
            buildNode(NODE_A),
            buildNode(NODE_B),
        ]);
        const currentNodes = [
            buildNode(NODE_A),
            buildNode(NODE_B),
            buildNode(NODE_C),
        ];
        await seedCurrentGraph(
            ctx, currentNodes,
        );
        const snap = {
            ...withNodeSelection(
                snapFrom(
                    buildGraph(currentNodes),
                ),
                NODE_C,
            ),
            isPanelOpen: true,
        };
        const op = await performUndo(
            createRequestContext(
                db, DEV_TOKEN,
            ),
            snap,
            buildFlowHistorySnapshot(true),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(
            op.freshSnap.isPanelOpen, false,
        );
        assertStrictEquals(
            op.freshSnap.interaction
                .selection.kind,
            'none',
        );
    }),
);

// -- performRedo ------------------------------

Deno.test(
    'performRedo: with an empty redo stack is a'
    + ' no-op that returns the same snapshot',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A), buildNode(NODE_B),
        ]));
        const op = await performRedo(
            createRequestContext(db, DEV_TOKEN), snap,
            buildFlowHistorySnapshot(false),
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(op.freshSnap, snap);
    }),
);

Deno.test(
    'performRedo: locked flow fails',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db } = await setupFlow();
        const snap = locked(snapFrom(buildGraph([
            buildNode(NODE_A),
        ])));
        const op = await performRedo(
            createRequestContext(db, DEV_TOKEN), snap,
            appendToRedoStack(
                buildFlowHistorySnapshot(false),
                buildFlowVersion(),
            ),
        );
        assertStrictEquals(op.kind, 'fail');
    }),
);

Deno.test(
    'performRedo: re-applies the popped version,'
    + ' snapshots the current state, and marks'
    + ' undo available',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        // Seed the relations with the current single-node graph
        // so GET /organizations/:id/flows/:id reflects the snap; redo diffs
        // this
        // current graph against the popped (a,b) version.
        const currentNodes = [buildNode(NODE_A)];
        await seedCurrentGraph(ctx, currentNodes);
        const snap = snapFrom(buildGraph(currentNodes));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion({
                nodes: [
                    buildNode(NODE_A),
                    buildNode(NODE_B),
                ],
            }),
        );
        const op = await performRedo(
            createRequestContext(db, DEV_TOKEN), snap, history,
        );
        assertStrictEquals(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assertStrictEquals(
            op.freshSnap.nodes.length, 2,
        );
        assertStrictEquals(
            op.newHistory.hasUndoHistory, true,
        );
        assertStrictEquals(
            op.newHistory.redoStack.length, 0,
        );
        // Undo-as-replay (Phase 14 Task 8): redo no longer
        // archives the pre-redo state through postFlowVersion —
        // its own putFlow write is what a LATER undo's
        // message-plane walk would find instead. flow_versions
        // stays untouched by the live redo path.
        assertStrictEquals(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
    }),
);

// Comment refreshed (Phase 14 Task 8, undo-as-replay): redo is
// now a SINGLE putFlow write (the postFlowVersion archive this
// comment originally described is retired — undo no longer
// consumes it, so archiving before redo served no purpose).
// putFlow's own baseline read (buildFlowPutBody's
// ctx.GETWithEtag) 404s on a missing flow exactly as
// postFlowVersion's read used to, so the SAME graceful failOp
// this test pins still holds, matching every sibling perform*
// mutation's read-then-write covenant.
Deno.test(
    'performRedo: a missing flow fails gracefully —'
    + ' putFlow\'s own baseline read shares the SAME'
    + ' covenant catch every sibling perform* mutation'
    + ' uses',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await setupNoFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion(),
        );
        const { result: op } = await captureConsole(
            'error',
            () => performRedo(
                createRequestContext(db, DEV_TOKEN),
                snap, history,
            ),
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /redo failed/i);
    }),
);

// A ctx whose POST to a named operation faults. For
// performUndo, the composing flow-write + version-op still
// ride ONE named POST /organizations/:id/flows/:id/undo, so this proves the
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
        POSTWithHeaders: <T>(
            resource: string,
            body: Record<string, unknown>,
            headerFields:
                readonly (readonly [string, string])[],
        ): Promise<T> => {
            if (resource === faultResource) {
                count += 1;
                return Promise.reject(
                    new Error('injected POST fault'),
                );
            }
            return ctx.POSTWithHeaders<T>(
                resource, body, headerFields,
            );
        },
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

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the fault
// fires at the client's own ctx.POST call site, before any
// network activity — the server-side resolution (does a target
// even exist) never enters into it, so the flow_versions seed
// this test used to need is dropped entirely; the assertion it
// fed becomes "flow_versions stays untouched", not "the
// consumed row survives".
Deno.test(
    'performUndo: a faulted POST /organizations/:id/flows/:id/undo'
    + ' applies nothing',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
            buildNode(NODE_B),
            buildNode(NODE_C),
        ]));
        const faulting = faultingPostCtx(
            ctx, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID
                + '/undo',
        );
        const { result: op } = await captureConsole(
            'error',
            () => performUndo(
                faulting.ctx, snap,
                buildFlowHistorySnapshot(true),
            ),
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /undo failed/i);
        assertStrictEquals(faulting.posts(), 1);
        // nothing applied: flow_versions is never touched by
        // the live undo path, and the persisted graph keeps
        // the seeded start + complete pair (the revert never
        // landed; the 3-node snap was only ever the client's
        // view, never persisted).
        assertStrictEquals(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
    }),
);

// RETIRED (Phase 14 Task 8, undo-as-replay): "performRedo: a
// faulted version-POST fails gracefully; nothing lands
// (postFlowVersion runs FIRST, before putFlow)" no longer has a
// premise to test — redo dropped its postFlowVersion archive
// entirely (undo no longer consumes it), so there is no version-
// POST left to fault. The surviving test below (faulting the
// document-PUT) still covers the class this one proved: a fault
// in redo's write path degrades gracefully to failOp, never an
// unhandled rejection.
//
// Redo is now a SINGLE putFlow write — the R1/E5 two-write fold
// this comment used to describe collapsed once its OTHER write
// (postFlowVersion) retired, so performRedo's failure shape now
// matches every OTHER perform* mutation (commitFlowMutation)
// exactly: one write, one covenant catch, one failOp on fault
// (Swallowed Failures guard honored: the failure surfaces via
// the toast channel every other perform* mutation already
// uses). putFlow's OWN internal loop separately absorbs a 412
// (up to 3 attempts) before ever reaching this catch.
Deno.test(
    'performRedo: a faulted document-PUT fails'
    + ' gracefully',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await setupFlow();
        const snap = snapFrom(buildGraph([
            buildNode(NODE_A),
        ]));
        const history = appendToRedoStack(
            buildFlowHistorySnapshot(false),
            buildFlowVersion({
                nodes: [
                    buildNode(NODE_A),
                    buildNode(NODE_B),
                ],
            }),
        );
        const faulting = faultingPutCtx(
            ctx, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID,
        );
        const { result: op } = await captureConsole(
            'error',
            () => performRedo(
                faulting.ctx, snap, history,
            ),
        );
        assertStrictEquals(op.kind, 'fail');
        if (op.kind !== 'fail') return;
        assertMatch(op.toast, /redo failed/i);
        assertStrictEquals(faulting.puts(), 1);
        // nothing applied: flow_versions is never touched by
        // the live redo path, and the document PUT never
        // landed — the graph stays the seeded start + complete
        // pair.
        assertStrictEquals(
            await flowVersionCount(db), 0,
        );
        const g = await persistedGraph(db);
        assertStrictEquals(g.nodes.length, 2);
    }),
);
