import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    initApi, resetApi,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    postWorkOrderCreation,
    postWorkOrderTransition,
    postWorkOrderClaim,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    UserEntity,
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
    WorkOrderClaimEntity,
} from '../api/types.ts';

function buildUser(
    name: string,
): Omit<UserEntity, 'id'> {
    return {
        first_name: name,
        last_name: 'Test',
        email: name.toLowerCase()
            + '@example.com',
        phone: '',
        role: 'product_manager',
        availability: 80,
        is_active: 1,
        bio: '',
        department: 'Product',
        created_at:
            '2026-01-01T00:00:00Z',
        updated_at:
            '2026-01-01T00:00:00Z',
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
        isStart: false,
        isComplete: false,
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
                { isStart: true },
            ),
            buildNode(
                'n-middle',
                'Doing work',
            ),
            buildNode(
                'n-finish',
                'Done',
                { isComplete: true },
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

function setupDb(): MemoryDbAdapter {
    const db = new MemoryDbAdapter();
    resetApi();
    initApi(db);
    return db;
}

// ── postWorkOrderCreation ─────────

test(
    'postWorkOrderCreation populates '
    + 'all five tables in one call',
    async () => {
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        const graph = buildLinearGraph();
        await db.flows.put(
            'f1', buildFlow(graph),
        );

        const woId =
            await postWorkOrderCreation(
                'f1', 'u1',
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
            claims[0]!.user_id, 'u1',
        );
    },
);

test(
    'postWorkOrderCreation throws '
    + 'when flow has no start node',
    async () => {
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        const graph: StoredGraph = {
            nodes: [
                buildNode('a', 'A'),
                buildNode('b', 'B'),
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
                postWorkOrderCreation(
                    'f1', 'u1',
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
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        const graph: StoredGraph = {
            nodes: [
                buildNode(
                    's', 'Start',
                    { isStart: true },
                ),
                buildNode('a', 'A'),
                buildNode('b', 'B'),
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
                postWorkOrderCreation(
                    'f1', 'u1',
                ),
            /exactly one outgoing edge/,
        );
    },
);

test(
    'postWorkOrderCreation increments '
    + 'position across calls',
    async () => {
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        await postWorkOrderCreation(
            'f1', 'u1',
        );
        await postWorkOrderCreation(
            'f1', 'u1',
        );
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

// ── postWorkOrderTransition ───────

test(
    'postWorkOrderTransition records '
    + 'transition and deletes claim',
    async () => {
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await postWorkOrderCreation(
                'f1', 'u1',
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

        await postWorkOrderTransition({
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            userId: 'u1',
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
        assert.equal(last.user_id, 'u1');

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
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await postWorkOrderCreation(
                'f1', 'u1',
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

        await postWorkOrderTransition({
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            userId: 'u1',
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
        const db = setupDb();
        await db.users.put(
            'u1', buildUser('Alice'),
        );
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await postWorkOrderCreation(
                'f1', 'u1',
            );
        await assert.rejects(
            () =>
                postWorkOrderTransition({
                    workOrderId: woId,
                    edgeId: 'no-such-edge',
                    values: {},
                    userId: 'u1',
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
        const db = setupDb();
        const before =
            await db.workOrderClaims
                .getAll();
        assert.equal(before.length, 0);

        const claimId =
            await postWorkOrderClaim(
                'w1', 'u1',
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
            claim.user_id, 'u1',
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
        const db = setupDb();
        await postWorkOrderClaim(
            'w1', 'u1',
        );
        await postWorkOrderClaim(
            'w1', 'u1',
        );
        const claims =
            await db.workOrderClaims
                .getAll();
        assert.equal(claims.length, 2);
        // Both rows reference the same
        // (work_order_id, user_id) pair.
        const woIds = new Set(
            claims.map(
                (c: WorkOrderClaimEntity) =>
                    c.work_order_id,
            ),
        );
        assert.equal(woIds.size, 1);
    },
);
