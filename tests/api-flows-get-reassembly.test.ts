import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
    postWorkOrderCreation,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    getWorkOrder,
} from
'../web-app/app/adapters/work-orders-queries.ts';
import type {
    FlowWithGraph,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import {
    asStoredGraph,
} from '../api/validators.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';

const NODE_START = generateIdentifier();
const NODE_MID = generateIdentifier();
const NODE_END = generateIdentifier();
const EDGE_START_MID = generateIdentifier();
const EDGE_MID_END = generateIdentifier();
const EDGE_START_END = generateIdentifier();
const ATTR_X = generateIdentifier();

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
    await seedHumanMember(db, 'mFNSxZqywTSMXhgUTdTqtA', 'Member One');
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

// Normalise a StoredGraph for order-insensitive comparison.
function norm(g: StoredGraph): StoredGraph {
    return {
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
    };
}

// Phase Final Task 2: graph relation ROW halves stripped.
// Message-plane document graph (GET) is the sole graph truth.

// Build a non-trivial graph: start→mid→end, mid has a
// member and an attribute, start/end are plain.
function buildNonTrivialGraph(): StoredGraph {
    return {
        nodes: [
            buildNode(NODE_START, { isCreate: true }),
            buildNode(NODE_MID, {
                memberIds: ['mFNSxZqywTSMXhgUTdTqtA'],
                attributes: [{
                    attributeId: ATTR_X,
                    mode: 'editable',
                    isRequired: true,
                }],
            }),
            buildNode(NODE_END, { isArchive: true }),
        ],
        edges: [
            buildEdge(EDGE_START_MID, NODE_START, NODE_MID),
            buildEdge(EDGE_MID_END, NODE_MID, NODE_END),
        ],
    };
}

async function seedFlowWithGraph(
    ctx: RequestContext,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: 'Reassembly Test Flow',
    });
    await putFlow(ctx, flowId, {
        name: 'Reassembly Test Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

// ── 1. ROUND-TRIP: GET returns the message-plane graph ──

test(
    'GET /organizations/:id/flows/:id returns the graph from the'
    + ' document message plane',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        const intended = buildNonTrivialGraph();
        await seedFlowWithGraph(ctx, flowId, intended);

        // GET must return the intended graph from the
        // document message pair's graph field (message-plane truth).
        const fetched =
            await ctx.GET<FlowWithGraph>('organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/flows/' + flowId);
        const got = asStoredGraph(
            fetched.graph, 'flow.graph',
        );
        assert.deepEqual(
            norm(got),
            norm(intended),
            'GET graph equals intended',
        );
    },
);

// postFlowVersion freeze RETIRED (Phase 15 Task 7). Work-
// order freeze below still proves GET graph is frozen.

// WORK ORDER auto-derives: creation captures the message-plane
// graph via GET /organizations/:id/flows/:id.

test(
    'postWorkOrderCreation freezes flow_graph'
    + ' from the message-plane GET graph',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();
        // Use a graph that satisfies work-order readiness
        // (has isCreate, a post-start node, one outgoing edge).
        const graph = buildNonTrivialGraph();
        await seedFlowWithGraph(ctx, flowId, graph);

        // Work-order creation reads the message-plane graph
        // via GET /organizations/:id/flows/:id.
        const woId = generateIdentifier();
        await postWorkOrderCreation(ctx, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId,
        });

        // Phase Final Task 2: frozen graph on message-plane GET.
        const wo = await getWorkOrder(ctx, woId);
        assert.ok(wo, 'work order created');

        // The frozen flow_graph on the work order must carry
        // the message-plane nodes, not an empty blob.
        assert.ok(
            wo.flowGraph.nodes.length > 0,
            'work order flow_graph has nodes from message plane',
        );
        assert.ok(
            wo.flowGraph.edges.length > 0,
            'work order flow_graph has edges from message plane',
        );
    },
);

// ── 4. UNDO round-trip: GET returns the target graph ──────

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): undo
// resolves its own restore target from the organizations/:id/flows/:id
// document-message-pair history, and computes graphDelta/revivals
// SERVER-SIDE (SIDECAR-KEEP). Phase Final Task 2: no row-
// plane graph writer remains.
test(
    'after undo GET /organizations/:id/flows/:id returns the'
    + ' target (undone) graph from the message plane',
    async () => {
        const { ctx } = await setupMemDb();
        const flowId = generateIdentifier();

        // Step 1: create flow with an empty graph.
        await postFlowCreation(ctx, {
            flowId,
            linkId: generateIdentifier(),
            projectId: generateIdentifier(),
            name: 'Undo Test Flow',
        });

        // Step 2: save the target graph — undo's own
        // message-plane walk will resolve back to THIS state.
        const targetGraph = buildNonTrivialGraph();
        await putFlow(ctx, flowId, {
            name: 'Undo Test Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: targetGraph.nodes,
            edges: targetGraph.edges,
        });

        // Step 3: advance to a different (smaller) graph.
        const advancedGraph: StoredGraph = {
            nodes: [
                buildNode(NODE_START, { isCreate: true }),
                buildNode(NODE_END, { isArchive: true }),
            ],
            edges: [buildEdge(EDGE_START_END, NODE_START, NODE_END)],
        };
        await putFlow(ctx, flowId, {
            name: 'Undo Test Flow',
            isLocked: false,
            isAutoLayout: false,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: advancedGraph.nodes,
            edges: advancedGraph.edges,
        });

        // Step 4: issue the undo — the server resolves the
        // target (targetGraph, above) and computes its own
        // graphDelta/revivals from CURRENT (advancedGraph) vs
        // TARGET, re-introducing what the advance dropped and
        // deleting what it added.
        const undoHead = await ctx.GETWithEtag<unknown>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId,
        );
        await ctx.POSTWithHeaders(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flowId + '/undo',
            {
                eventId: generateIdentifier(),
                at: nowUtc(),
            },
            undoHead.etag === undefined
                ? []
                : [['if-match', '"' + undoHead.etag + '"']],
        );

        // Step 5: GET must return the target (undone) graph.
        const fetched =
            await ctx.GET<FlowWithGraph>('organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/flows/' + flowId);
        const got = asStoredGraph(
            fetched.graph, 'flow.graph',
        );
        assert.deepEqual(
            norm(got),
            norm(targetGraph),
            'GET after undo matches target graph',
        );
        // The target had 3 nodes; after undo we should
        // see the target shape again (start, mid, end).
        const nodeIds = got.nodes.map(n => n.id).sort();
        assert.ok(
            nodeIds.includes(NODE_MID),
            'undone graph contains mid node',
        );
        assert.ok(
            nodeIds.includes(NODE_START),
            'undone graph contains start node',
        );
        assert.ok(
            nodeIds.includes(NODE_END),
            'undone graph contains end node',
        );
    },
);
