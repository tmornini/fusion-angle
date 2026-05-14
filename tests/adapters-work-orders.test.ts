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
    postWorkOrderCreation,
    postWorkOrderTransition,
    postWorkOrderClaim,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    generateCryptoSafeBase62,
} from
'../web-app/app/adapters/crypto-safe-base62.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';

interface CreateIds {
    workOrderId: string;
    flowLinkId: string;
    initTransitionId: string;
    postStartTransitionId: string;
    claimId: string;
}

function mintCreateIds(): CreateIds {
    return {
        workOrderId: generateCryptoSafeBase62(),
        flowLinkId: generateCryptoSafeBase62(),
        initTransitionId:
            generateCryptoSafeBase62(),
        postStartTransitionId:
            generateCryptoSafeBase62(),
        claimId: generateCryptoSafeBase62(),
    };
}

async function createWorkOrder(
    ctx: RequestContext,
    flowId: string,
): Promise<string> {
    const ids = mintCreateIds();
    await postWorkOrderCreation(ctx, {
        ...ids, flowId,
    });
    return ids.workOrderId;
}
import type {
    HumanWorkerEntity,
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
    WorkOrderClaimEntity,
} from '../api/types.ts';

function buildHumanWorker(
    name: string,
): Omit<HumanWorkerEntity, 'id'> {
    return {
        first_name: name,
        last_name: 'Test',
        email: name.toLowerCase()
            + '@example.com',
        phone: '',
        title: 'product_manager',
        status: 'active',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        bio: '',
        department: 'Product',
    };
}

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
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
        name: '',
        description: '',
        fromNodeId,
        toNodeId,
    };
}

function buildFlow(
    graph: StoredGraph,
): Omit<FlowEntity, 'id'> {
    return {
        name: 'Test flow',
        description: 't',
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout:
            DEFAULT_LOCK_TIMEOUT,
        graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
        created_at:
            '2026-01-01T00:00:00Z',
        updated_at:
            '2026-01-01T00:00:00Z',
    };
}

function buildLinearGraph(): StoredGraph {
    return {
        nodes: [
            buildNode(
                'n-start',
                'Start',
                { isCreate: true },
            ),
            buildNode(
                'n-middle',
                'Doing work',
                { workerIds: ['current'] },
            ),
            buildNode(
                'n-finish',
                'Done',
                { isArchive: true },
            ),
        ],
        edges: [
            buildEdge(
                'e1',
                'n-start',
                'n-middle',
            ),
            buildEdge(
                'e2',
                'n-middle',
                'n-finish',
            ),
        ],
    };
}

async function setupDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.workers.put(
        'current', buildHumanWorker('Demo'),
    );
    const ctx = createRequestContext(db);
    return { db, ctx };
}

// ── postWorkOrderCreation ─────────

test(
    'postWorkOrderCreation populates '
    + 'all five tables in one call',
    async () => {
        const { db, ctx } = await setupDb();
        const graph = buildLinearGraph();
        await db.flows.put(
            'f1', buildFlow(graph),
        );

        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );

        const wos = await db.workOrders
            .getAll();
        assert.equal(wos.length, 1);
        assert.equal(wos[0]!.id, woId);
        assert.equal(
            wos[0]!.position, 1,
        );

        const links =
            await db.flowWorkOrders
                .getAll();
        assert.equal(links.length, 1);
        assert.equal(
            links[0]!.flow_id, 'f1',
        );
        assert.equal(
            links[0]!.work_order_id, woId,
        );

        const transitions =
            await db.workOrderTransitions
                .getAll();
        assert.equal(
            transitions.length, 2,
        );
        // Initial transition uses '' for
        // from_node_id today; Phase 1 will
        // model this as null. When that
        // lands, update the assertion.
        assert.equal(
            transitions[0]!.from_node_id,
            '',
        );
        assert.equal(
            transitions[0]!.to_node_id,
            'n-start',
        );
        assert.equal(
            transitions[1]!.from_node_id,
            'n-start',
        );
        assert.equal(
            transitions[1]!.to_node_id,
            'n-middle',
        );

        const claims =
            await db.workOrderClaims
                .getAll();
        assert.equal(claims.length, 1);
        assert.equal(
            claims[0]!.work_order_id,
            woId,
        );
        assert.equal(
            claims[0]!.person_id, 'current',
        );
    },
);

test(
    'postWorkOrderCreation throws '
    + 'when flow has no start node',
    async () => {
        const { db, ctx } = await setupDb();
        // Each regular node carries a worker so
        // the publish gate passes; the start-node
        // check is what we are exercising.
        const graph: StoredGraph = {
            nodes: [
                buildNode('a', 'A', {
                    workerIds: ['current'],
                }),
                buildNode('b', 'B', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge('e', 'a', 'b'),
            ],
        };
        await db.flows.put(
            'f1', buildFlow(graph),
        );
        await assert.rejects(
            () =>
                createWorkOrder(
                    ctx, 'f1',
                ),
            /no start node/,
        );
    },
);

test(
    'postWorkOrderCreation throws '
    + 'when start has multiple '
    + 'outgoing edges',
    async () => {
        const { db, ctx } = await setupDb();
        // Workers on regular nodes so the publish
        // gate passes; the multi-outgoing-edge
        // check on the start node is what we want
        // to exercise.
        const graph: StoredGraph = {
            nodes: [
                buildNode(
                    's', 'Start',
                    { isCreate: true },
                ),
                buildNode('a', 'A', {
                    workerIds: ['current'],
                    isArchive: true,
                }),
                buildNode('b', 'B', {
                    workerIds: ['current'],
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge('e1', 's', 'a'),
                buildEdge('e2', 's', 'b'),
            ],
        };
        await db.flows.put(
            'f1', buildFlow(graph),
        );
        await assert.rejects(
            () =>
                createWorkOrder(
                    ctx, 'f1',
                ),
            /exactly one outgoing edge/,
        );
    },
);

test(
    'postWorkOrderCreation increments '
    + 'position across calls',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        await createWorkOrder(ctx, 'f1');
        await createWorkOrder(ctx, 'f1');
        const wos = await db.workOrders
            .getAll();
        const positions = wos
            .map(w => w.position)
            .sort();
        assert.deepEqual(
            positions, [1, 2],
        );
    },
);

test(
    'postWorkOrderCreation freezes '
    + 'flow_graph against subsequent '
    + 'flow edits',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        await createWorkOrder(ctx, 'f1');

        // Mutate source flow AFTER the
        // work order captured its
        // snapshot.
        const mutated = buildLinearGraph();
        mutated.nodes[1]!.name = 'EDITED';
        await db.flows.put(
            'f1', buildFlow(mutated),
        );

        const wo = (
            await db.workOrders.getAll()
        )[0]!;
        const fg = JSON.parse(
            wo.flow_graph,
        );
        assert.equal(
            fg.nodes[1].name, 'Doing work',
        );
        assert.notEqual(
            fg.nodes[1].name, 'EDITED',
        );
    },
);

// ── postWorkOrderTransition ───────

test(
    'postWorkOrderTransition records '
    + 'transition and deletes claim',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );

        const before =
            await db.workOrderTransitions
                .getAll();
        assert.equal(before.length, 2);
        const claimsBefore =
            await db.workOrderClaims
                .getAll();
        assert.equal(
            claimsBefore.length, 1,
        );

        await postWorkOrderTransition(ctx, {
            transitionId:
                generateCryptoSafeBase62(),
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            fieldValueIds: {},
            currentNodeId: 'n-middle',
        });

        const after =
            await db.workOrderTransitions
                .getAll();
        assert.equal(after.length, 3);
        const last = after.find(
            t =>
                t.from_node_id
                    === 'n-middle'
                && t.to_node_id
                    === 'n-finish',
        );
        assert.ok(last);
        assert.equal(
            last.person_id, 'current',
        );

        const claimsAfter =
            await db.workOrderClaims
                .getAll();
        assert.equal(
            claimsAfter.length, 0,
        );
    },
);

test(
    'postWorkOrderTransition succeeds '
    + 'when no claim exists',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );
        // Manually clear any claim to
        // simulate an unclaimed
        // work order.
        const claims =
            await db.workOrderClaims
                .getAll();
        for (const c of claims) {
            await db.workOrderClaims
                .delete(c.id);
        }

        await postWorkOrderTransition(ctx, {
            transitionId:
                generateCryptoSafeBase62(),
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            fieldValueIds: {},
            currentNodeId: 'n-middle',
        });

        const transitions =
            await db.workOrderTransitions
                .getAll();
        assert.equal(
            transitions.length, 3,
        );
    },
);

test(
    'postWorkOrderTransition throws '
    + 'when edge id does not exist',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );
        await assert.rejects(
            () =>
                postWorkOrderTransition(ctx, {
                    transitionId:
                        generateCryptoSafeBase62(),
                    workOrderId: woId,
                    edgeId: 'no-such-edge',
                    values: {},
                    fieldValueIds: {},
                    currentNodeId:
                        'n-middle',
                }),
            /Edge not found/,
        );
    },
);

// ── postWorkOrderClaim ────────────

test(
    'postWorkOrderClaim creates a '
    + 'claim row with correct fields',
    async () => {
        const { db, ctx } = await setupDb();
        const before =
            await db.workOrderClaims
                .getAll();
        assert.equal(before.length, 0);

        const claimId =
            generateCryptoSafeBase62();
        await postWorkOrderClaim(
            ctx, claimId, 'w1',
        );

        const after =
            await db.workOrderClaims
                .getAll();
        assert.equal(after.length, 1);
        const claim = after[0]!;
        assert.equal(claim.id, claimId);
        assert.equal(
            claim.work_order_id, 'w1',
        );
        assert.equal(
            claim.person_id, 'current',
        );
        assert.ok(claim.claimed_at);
    },
);

test(
    'postWorkOrderClaim does NOT '
    + 'enforce uniqueness — race is '
    + 'unfixable in localStorage; '
    + 'structural fix is the Postgres '
    + 'migration (UNIQUE partial '
    + 'index). When that migration '
    + 'lands, this test changes to '
    + 'assert that the second call '
    + 'either throws or returns the '
    + 'existing claim id.',
    async () => {
        const { db, ctx } = await setupDb();
        await postWorkOrderClaim(
            ctx,
            generateCryptoSafeBase62(),
            'w1',
        );
        await postWorkOrderClaim(
            ctx,
            generateCryptoSafeBase62(),
            'w1',
        );
        const claims =
            await db.workOrderClaims
                .getAll();
        assert.equal(claims.length, 2);
        // Both rows reference the same
        // (work_order_id, person_id) pair.
        const woIds = new Set(
            claims.map(
                (c: WorkOrderClaimEntity) =>
                    c.work_order_id,
            ),
        );
        assert.equal(woIds.size, 1);
    },
);

// ── getFlowWorkOrderRows ──────────

import {
    getFlowWorkOrderRows,
} from
'../web-app/app/adapters/work-orders-queries.ts';

test(
    'getFlowWorkOrderRows returns seeded '
    + 'flow-work-order rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.flowWorkOrders.put(
            'fwo1',
            {
                flow_id: 'flow1',
                work_order_id: 'wo1',
                created_at:
                    '2024-01-01T00:00:00Z',
            },
        );
        await db.flowWorkOrders.put(
            'fwo2',
            {
                flow_id: 'flow2',
                work_order_id: 'wo2',
                created_at:
                    '2024-01-01T00:00:00Z',
            },
        );
        const ctx = createRequestContext(db);
        const rows =
            await getFlowWorkOrderRows(ctx);
        assert.equal(rows.length, 2);
        assert.ok(
            rows.some(
                r => r.work_order_id === 'wo1',
            ),
        );
        assert.ok(
            rows.some(
                r => r.work_order_id === 'wo2',
            ),
        );
    },
);
