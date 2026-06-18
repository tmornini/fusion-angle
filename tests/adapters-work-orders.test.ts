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
    postWorkOrderCreation,
    postWorkOrderTransition,
    postWorkOrderClaim,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    generateCryptoSafeBase62,
} from
'../api/crypto-safe-base62.ts';
import {
    getWorkOrderActiveClaim,
    getActiveClaimsByWorkOrder,
    getWorkOrderCurrentNodeId,
    getWorkOrderTransitionEvents,
} from
'../web-app/app/adapters/state-events.ts';
import {
    deleteWorkOrderClaim,
} from
'../web-app/app/adapters/work-orders-deletions.ts';
import {
    jsonObjectField,
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
    StateEntity,
} from '../api/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

interface CreateIds {
    workOrderId: string;
    flowLinkId: string;
}

function mintCreateIds(): CreateIds {
    return {
        workOrderId: generateCryptoSafeBase62(),
        flowLinkId: generateCryptoSafeBase62(),
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

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
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
        name: '',
        fromNodeId,
        toNodeId,
    };
}

function buildFlow(
    graph: StoredGraph,
): Omit<FlowEntity, 'id'> {
    return {
        organization_id: '1',
        name: 'Test flow',
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
                { memberIds: ['current'] },
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
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo Test');
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

// RFC-3339 timestamps from Date.now() share
// millisecond resolution; pause guarantees
// ordering on fast machines.
async function pause(ms: number): Promise<void> {
    return new Promise(resolve =>
        setTimeout(resolve, ms),
    );
}

// ── postWorkOrderCreation ─────────

test(
    'postWorkOrderCreation seeds work order, '
    + 'flow link, and three state events in one '
    + 'call',
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

        const events =
            await db.states.getAllFor(woId);
        // start node, post-start, claimed
        assert.equal(events.length, 3);
        const nonClaim = events.filter(
            (e: StateEntity) =>
                e.state !== 'claimed',
        );
        assert.equal(nonClaim.length, 2);
        assert.equal(
            nonClaim[0]!.state, 'n-start',
        );
        assert.equal(
            nonClaim[1]!.state, 'n-middle',
        );
        const claims = events.filter(
            (e: StateEntity) =>
                e.state === 'claimed',
        );
        assert.equal(claims.length, 1);
        assert.equal(
            claims[0]!.member_id, 'current',
        );
    },
);

test(
    'postWorkOrderCreation appends past a'
    + ' fractional baseline without renumbering',
    async () => {
        const { db, ctx } = await setupDb();
        const graph = buildLinearGraph();
        await db.flows.put(
            'f1', buildFlow(graph),
        );

        const firstId =
            await createWorkOrder(ctx, 'f1');
        const first = (
            await db.workOrders.getAll()
        )[0]!;
        await db.workOrders.put(firstId, {
            ...first,
            position: 7.5,
        });

        await createWorkOrder(ctx, 'f1');

        const all = await db.workOrders.getAll();
        const second = all.find(
            w => w.id !== firstId,
        );
        assert.equal(second!.position, 8.5);
    },
);

test(
    'postWorkOrderCreation throws '
    + 'when flow has no start node',
    async () => {
        const { db, ctx } = await setupDb();
        const graph: StoredGraph = {
            nodes: [
                buildNode('a', 'A', {
                    memberIds: ['current'],
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
        const graph: StoredGraph = {
            nodes: [
                buildNode(
                    's', 'Start',
                    { isCreate: true },
                ),
                buildNode('a', 'A', {
                    memberIds: ['current'],
                    isArchive: true,
                }),
                buildNode('b', 'B', {
                    memberIds: ['current'],
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
        assert.equal('flowId' in fg, false);
    },
);

// ── postWorkOrderTransition ───────

test(
    'postWorkOrderTransition records '
    + 'transition state event and releases the '
    + 'claim',
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
        await pause(2);

        const beforeNode =
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            );
        assert.equal(beforeNode, 'n-middle');
        const beforeClaim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.ok(beforeClaim !== null);

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            fieldValueIds: {},
        });

        const afterNode =
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            );
        assert.equal(afterNode, 'n-finish');
        const afterClaim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.equal(afterClaim, null);
    },
);

test(
    'postWorkOrderTransition succeeds '
    + 'when no live claim exists',
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
        await pause(2);
        // Record an explicit release so no live
        // claim remains, simulating an unclaimed
        // work order.
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: woId,
                state: 'claim_released',
                member_id: 'current',
                at: nowUtc(),
            },
        );

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            fieldValueIds: {},
        });

        const events =
            await getWorkOrderTransitionEvents(
                ctx, woId,
            );
        // start, post-start, after-transition
        assert.equal(events.length, 3);
        assert.equal(
            events.at(-1)!.toNodeId, 'n-finish',
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
                    workOrderId: woId,
                    edgeId: 'no-such-edge',
                    values: {},
                    fieldValueIds: {},
                }),
            /Edge not found/,
        );
    },
);

// ── postWorkOrderClaim ────────────

test(
    'postWorkOrderClaim records a fresh '
    + 'claimed state event',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1', buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(ctx, 'f1');
        // Release the creation-time claim so this
        // test exercises pure claim-creation
        // without the expiration-notice branch.
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: woId,
                state: 'claim_released',
                member_id: 'current',
                at: nowUtc(),
            },
        );
        await pause(2);
        await postWorkOrderClaim(ctx, woId);

        const claim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.ok(claim !== null);
        assert.equal(claim.memberId, 'current');
    },
);

test(
    'postWorkOrderClaim is idempotent — a repeat '
    + 'claim by the holder appends no duplicate',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1', buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(ctx, 'f1');
        // Release the creation-time claim so the
        // two explicit claim calls below are the
        // only contributors to the count.
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: woId,
                state: 'claim_released',
                member_id: 'current',
                at: nowUtc(),
            },
        );
        await pause(2);
        await postWorkOrderClaim(ctx, woId);
        await pause(2);
        await postWorkOrderClaim(ctx, woId);
        const events =
            await db.states.getAllFor(woId);
        const claimed = events.filter(
            (e: StateEntity) =>
                e.state === 'claimed',
        );
        // Initial creation claim plus exactly ONE
        // from the two explicit calls: the claim
        // route reads and appends in one
        // transaction, so the holder's repeat
        // claim is a no-op.
        assert.equal(
            claimed.length, 2,
            'expected exactly 2 claimed events,'
            + ' got ' + claimed.length,
        );
    },
);

// ── getFlowWorkOrderEntities ──────────

import {
    getFlowWorkOrderEntities,
} from
'../web-app/app/adapters/work-orders-queries.ts';

test(
    'getFlowWorkOrderEntities returns the seeded '
    + 'flow-work-order rows for the asked flow only',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.flowWorkOrders.put(
            'fwo1',
            {
                flow_id: 'flow1',
                work_order_id: 'wo1',
                at:
                    '2024-01-01T00:00:00.000000Z',
            },
        );
        await db.flowWorkOrders.put(
            'fwo2',
            {
                flow_id: 'flow2',
                work_order_id: 'wo2',
                at:
                    '2024-01-01T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        // The server now filters the nested collection to its
        // parent flow — each flow surfaces only its own join.
        const flow1 =
            await getFlowWorkOrderEntities(ctx, 'flow1');
        assert.equal(flow1.length, 1);
        assert.equal(flow1[0]!.work_order_id, 'wo1');
        const flow2 =
            await getFlowWorkOrderEntities(ctx, 'flow2');
        assert.equal(flow2.length, 1);
        assert.equal(flow2[0]!.work_order_id, 'wo2');
    },
);

// ── lockTimeout-aware getWorkOrderActiveClaim ────

test(
    'getWorkOrderActiveClaim treats a stale '
    + 'claimed event as implicitly expired',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Demo Test',
        );
        const ctx = createRequestContext(db, await devToken());
        const woId = generateCryptoSafeBase62();
        // Backdate ten seconds; lockTimeout=1s
        // means this is past the live window.
        const longAgo = new Date(
            Date.now() - 10_000,
        ).toISOString()
        .replace('Z', '000Z');
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: woId,
                state: 'claimed',
                member_id: 'current',
                at: longAgo,
            },
        );
        const claim = await getWorkOrderActiveClaim(
            ctx, woId, 1,
        );
        assert.equal(claim, null);
    },
);

test(
    'getWorkOrderActiveClaim returns the fresh '
    + 'claim when within the lock window',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Demo Test',
        );
        const ctx = createRequestContext(db, await devToken());
        const woId = generateCryptoSafeBase62();
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: woId,
                state: 'claimed',
                member_id: 'current',
                at: nowUtc(),
            },
        );
        const claim = await getWorkOrderActiveClaim(
            ctx, woId, DEFAULT_LOCK_TIMEOUT,
        );
        assert.ok(claim !== null);
        assert.equal(claim.memberId, 'current');
    },
);

// ── bulk getActiveClaimsByWorkOrder ────

test(
    'getActiveClaimsByWorkOrder resolves every '
    + 'order claim in one read, honoring per-order '
    + 'lockTimeout and the work-order set',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Demo Test',
        );
        const ctx = createRequestContext(db, await devToken());
        const fresh1 = generateCryptoSafeBase62();
        const fresh2 = generateCryptoSafeBase62();
        const stale = generateCryptoSafeBase62();
        const released = generateCryptoSafeBase62();
        const orphan = generateCryptoSafeBase62();
        const now = nowUtc();
        const longAgo = new Date(
            Date.now() - 10_000,
        ).toISOString()
        .replace('Z', '000Z');
        const claimed = (entityId: string, at: string) =>
            db.states.put(generateCryptoSafeBase62(), {
                entity_id: entityId,
                state: 'claimed',
                member_id: 'current',
                at,
            });
        await claimed(fresh1, now);
        await claimed(fresh2, now);
        await claimed(stale, longAgo);
        await claimed(orphan, now);
        await db.states.put(
            generateCryptoSafeBase62(),
            {
                entity_id: released,
                state: 'claim_released',
                member_id: 'current',
                at: now,
            },
        );
        const timeouts = new Map<string, number>([
            [fresh1, DEFAULT_LOCK_TIMEOUT],
            [fresh2, DEFAULT_LOCK_TIMEOUT],
            [stale, 1],
            [released, DEFAULT_LOCK_TIMEOUT],
        ]);
        const claims =
            await getActiveClaimsByWorkOrder(
                ctx, timeouts,
            );
        assert.equal(claims.size, 2);
        assert.equal(
            claims.get(fresh1)!.memberId, 'current',
        );
        assert.ok(claims.has(fresh2));
        // Stale claim past its lockTimeout: excluded.
        assert.equal(claims.has(stale), false);
        // Released claim: excluded.
        assert.equal(claims.has(released), false);
        // Claimed but outside the work-order set:
        // excluded (no timeout entry).
        assert.equal(claims.has(orphan), false);
    },
);

test('deleteWorkOrderClaim appends a claim_released event',
async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo Test');
    const ctx = createRequestContext(db, await devToken());
    await deleteWorkOrderClaim(ctx, 'wo-release-1');
    const events = await db.states.getAllFor('wo-release-1');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'claim_released');
});

// Regression: transitionAt must be minted before release.at
// so the at-ordered ledger puts claim_released last (latest
// event wins for current-state derivation).
test(
    'postWorkOrderTransition mints transitionAt before '
    + 'release.at — latest by at is claim_released',
    async () => {
        const { db, ctx } = await setupDb();
        await db.flows.put(
            'f1',
            buildFlow(buildLinearGraph()),
        );
        const woId =
            await createWorkOrder(ctx, 'f1');
        await pause(2);

        // Verify a live claim exists before transition.
        const beforeClaim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.ok(
            beforeClaim !== null,
            'expected a live claim before transition',
        );

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: 'e2',
            values: {},
            fieldValueIds: {},
        });

        const allEvents =
            await db.states.getAllFor(woId);
        const transitionEvt = allEvents.find(
            (e: StateEntity) =>
                e.state === 'n-finish',
        );
        const releaseEvt = allEvents.find(
            (e: StateEntity) =>
                e.state === 'claim_released',
        );
        assert.ok(
            transitionEvt !== undefined,
            'expected a transition (n-finish) event',
        );
        assert.ok(
            releaseEvt !== undefined,
            'expected a claim_released event',
        );
        // The route emits transition first, then
        // release — so transitionAt < release.at must
        // hold in the at-ordered ledger, making
        // claim_released the latest (winning) event.
        assert.ok(
            transitionEvt.at < releaseEvt.at,
            'transitionAt must be strictly less than'
            + ' release.at; got transition='
            + transitionEvt.at
            + ' release=' + releaseEvt.at,
        );
    },
);
