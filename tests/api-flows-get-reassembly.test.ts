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
    buildFlowBody,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    postFlowVersion,
} from
'../web-app/app/adapters/flow-versions.ts';
import {
    postWorkOrderCreation,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import type {
    FlowWithGraph,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../api/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
    storedGraphField,
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
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';

async function setupMemDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo User');
    await seedHumanMember(db, 'm1', 'Member One');
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

// Read the relation tables for a flow and call
// reassembleStoredGraph — the ground-truth source.
async function reassembleFromDb(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<StoredGraph> {
    const nodeRows =
        await db.flowNodes.getAllWhere('flow_id', flowId);
    const edgeRows =
        await db.flowEdges.getAllWhere('flow_id', flowId);
    const memberRows =
        await db.flowNodeMembers.getAll();
    const attrRows =
        await db.flowNodeAttributes.getAll();
    return reassembleStoredGraph(
        nodeRows, edgeRows, memberRows, attrRows,
    );
}

// Build a non-trivial graph: start→mid→end, mid has a
// member and an attribute, start/end are plain.
function buildNonTrivialGraph(): StoredGraph {
    return {
        nodes: [
            buildNode('start', { isCreate: true }),
            buildNode('mid', {
                memberIds: ['m1'],
                attributes: [{
                    attributeId: 'attr-x',
                    mode: 'editable',
                    isRequired: true,
                }],
            }),
            buildNode('end', { isArchive: true }),
        ],
        edges: [
            buildEdge('e1', 'start', 'mid'),
            buildEdge('e2', 'mid', 'end'),
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
        linkId: flowId + '-link',
        projectId: 'proj-1',
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

// ── 1. ROUND-TRIP: GET derives the graph from relations ──

test(
    'GET /flows/:id returns the graph reassembled'
    + ' from relations',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-get-rt';
        const intended = buildNonTrivialGraph();
        await seedFlowWithGraph(ctx, flowId, intended);

        // GET must return the intended graph (from relations) —
        // the flow row carries no graph blob; the four relation
        // tables are the sole graph truth.
        const fetched =
            await ctx.GET<FlowWithGraph>('flows/' + flowId);
        const got = asStoredGraph(
            JSON.parse(fetched.graph), 'flow.graph',
        );
        const fromRelations =
            await reassembleFromDb(db, flowId);

        // The returned graph equals the relation-derived truth.
        assert.deepEqual(
            norm(got),
            norm(fromRelations),
            'GET derives graph from relations',
        );
        // It also equals the intended graph.
        assert.deepEqual(
            norm(got),
            norm(intended),
            'GET graph equals intended',
        );
    },
);

// ── 2. FREEZE auto-derives: published version captures ────
//    the reassembled graph, not the blob.

test(
    'postFlowVersion freeze captures the'
    + ' reassembled graph from relations',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-freeze-rt';
        const intended = buildNonTrivialGraph();
        await seedFlowWithGraph(ctx, flowId, intended);

        // Freeze captures the relation-derived graph via
        // GET /flows/:id — there is no stored blob to read.
        await postFlowVersion(ctx, 'ver-freeze', flowId);

        const versionRows =
            await db.flowVersions.getAll();
        assert.equal(versionRows.length, 1);
        const frozenGraph = asStoredGraph(
            JSON.parse(versionRows[0]!.graph),
            'flow_versions.graph',
        );
        const fromRelations =
            await reassembleFromDb(db, flowId);

        assert.deepEqual(
            norm(frozenGraph),
            norm(fromRelations),
            'frozen version graph equals relations',
        );
        assert.deepEqual(
            norm(frozenGraph),
            norm(intended),
            'frozen version graph equals intended',
        );
    },
);

// 3. WORK ORDER auto-derives: creation captures the
//    reassembled graph from relations.

test(
    'postWorkOrderCreation freezes flow_graph'
    + ' from the reassembled relations',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-wo-rt';
        // Use a graph that satisfies work-order readiness
        // (has isCreate, a post-start node, one outgoing edge).
        const graph = buildNonTrivialGraph();
        await seedFlowWithGraph(ctx, flowId, graph);

        // Work-order creation reads the relation-derived graph
        // via GET /flows/:id — there is no stored blob.
        const woId = generateCryptoSafeBase62();
        await postWorkOrderCreation(ctx, {
            workOrderId: woId,
            flowLinkId: generateCryptoSafeBase62(),
            flowId,
        });

        const wos = await db.workOrders.getAll();
        const wo = wos.find(w => w.id === woId)!;
        assert.ok(wo, 'work order created');

        // The frozen flow_graph on the work order must carry
        // the relation-derived nodes, not the empty blob.
        const frozenWoGraph = JSON.parse(wo.flow_graph) as {
            nodes: unknown[];
            edges: unknown[];
        };
        assert.ok(
            frozenWoGraph.nodes.length > 0,
            'work order flow_graph has nodes from relations',
        );
        assert.ok(
            frozenWoGraph.edges.length > 0,
            'work order flow_graph has edges from relations',
        );
    },
);

// ── 4. UNDO round-trip: GET returns the target graph ──────

test(
    'after undo GET /flows/:id returns the'
    + ' target (undone) graph from relations',
    async () => {
        const { db, ctx } = await setupMemDb();
        const flowId = 'flow-undo-rt';

        // Step 1: create flow with an empty graph.
        await postFlowCreation(ctx, {
            flowId,
            linkId: flowId + '-link',
            projectId: 'proj-1',
            name: 'Undo Test Flow',
        });

        // Step 2: save the target graph, then capture a
        // version to undo back to.
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
        const verId = 'ver-undo-target';
        await postFlowVersion(ctx, verId, flowId);

        // Step 3: advance to a different (smaller) graph.
        const advancedGraph: StoredGraph = {
            nodes: [
                buildNode('start', { isCreate: true }),
                buildNode('end', { isArchive: true }),
            ],
            edges: [buildEdge('ex1', 'start', 'end')],
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

        // Step 4: issue an undo that reverts to the target
        // graph and consumes the version row. The delta
        // re-introduces the nodes/edges the target carries
        // that the advanced graph dropped.
        // Use nowUtc() so the undo timestamps are always
        // after the advance's deletion events.
        const now = nowUtc();
        await ctx.POST('flows/' + flowId + '/undo', {
            flow: buildFlowBody({
                name: 'Undo Test Flow',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: targetGraph.nodes,
                edges: targetGraph.edges,
            }),
            eventId: 'undo-ev-1',
            at: now,
            // Task 5: the post-undo reduced graph — REQUIRED
            // plumbing, consumed only by the undo route's own
            // synthesized document pair.
            graph: storedGraphField(targetGraph),
            consumedVersionId: verId,
            graphDelta: {
                nodes: targetGraph.nodes.map(n => ({
                    id: n.id,
                    flow_id: flowId,
                    name: n.name,
                    position_x: n.positionX,
                    position_y: n.positionY,
                    is_create: n.isCreate,
                    is_archive: n.isArchive,
                    task_instructions: n.taskInstructions,
                    at: now,
                })),
                edges: targetGraph.edges.map(e => ({
                    id: e.id,
                    flow_id: flowId,
                    name: e.name,
                    from_node_id: e.fromNodeId,
                    to_node_id: e.toNodeId,
                    at: now,
                })),
                memberEvents: targetGraph.nodes
                    .filter(n => n.memberIds.length > 0)
                    .flatMap(n =>
                        n.memberIds.map(mid => ({
                            id: generateCryptoSafeBase62(),
                            flow_node_id: n.id,
                            member_id: mid,
                            action: 'added' as const,
                            at: now,
                        })),
                    ),
                attributeEvents: targetGraph.nodes
                    .filter(n => n.attributes.length > 0)
                    .flatMap(n =>
                        n.attributes.map(a => ({
                            id: generateCryptoSafeBase62(),
                            flow_node_id: n.id,
                            attribute_id: a.attributeId,
                            mode: a.mode,
                            is_required: a.isRequired,
                            action: 'added' as const,
                            at: now,
                        })),
                    ),
                // ex1 was introduced by the advance but is
                // absent in the target — the undo deletes it.
                deletions: [
                    {
                        eventId: generateCryptoSafeBase62(),
                        entityId: 'ex1',
                        at: now,
                    },
                ],
            },
            revivals: [
                // mid was in the target but not the advanced;
                // it was soft-deleted by the advance. Restore.
                {
                    eventId: generateCryptoSafeBase62(),
                    entityId: 'mid',
                    at: now,
                },
                {
                    eventId: generateCryptoSafeBase62(),
                    entityId: 'e1',
                    at: now,
                },
                {
                    eventId: generateCryptoSafeBase62(),
                    entityId: 'e2',
                    at: now,
                },
            ],
        });

        // Step 5: GET must return the target (undone) graph.
        const fetched =
            await ctx.GET<FlowWithGraph>('flows/' + flowId);
        const got = asStoredGraph(
            JSON.parse(fetched.graph), 'flow.graph',
        );
        const fromRelations =
            await reassembleFromDb(db, flowId);

        assert.deepEqual(
            norm(got),
            norm(fromRelations),
            'GET after undo matches relations',
        );
        // The target had 3 nodes; after undo we should
        // see the target shape again (start, mid, end).
        const nodeIds = got.nodes.map(n => n.id).sort();
        assert.ok(
            nodeIds.includes('mid'),
            'undone graph contains mid node',
        );
        assert.ok(
            nodeIds.includes('start'),
            'undone graph contains start node',
        );
        assert.ok(
            nodeIds.includes('end'),
            'undone graph contains end node',
        );
    },
);
