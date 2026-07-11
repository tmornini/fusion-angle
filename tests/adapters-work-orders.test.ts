import { test } from 'node:test';
import { deriveStatesFor } from
    '../api/derive-states.ts';
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
    putWorkOrder,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    getWorkOrder,
} from
'../web-app/app/adapters/work-orders-queries.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    generateCryptoSafeBase62,
} from
'../shared/crypto-safe-base62.ts';
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
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
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

// Seed (or re-save) a flow through the SAME gate-driven create/
// document-PUT idiom the live route uses (postFlowCreation +
// putFlow), so a message pair exists at this flow's address —
// required for the flipped GET flows/:id route (Phase 4 Task
// 8), which postWorkOrderCreation reads before creating, to
// derive it. A first call creates (postFlowCreation seeds a
// default start/complete graph; the immediate putFlow overwrites
// it with the caller's own graph); a REPEAT call on the same
// flowId (the "freezes flow_graph against subsequent flow
// edits" case re-seeds 'f1' to simulate an edit) instead saves
// straight over the existing flow via putFlow alone — postFlowCreation
// is genesis-only.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = createRequestContext(db, await devToken());
    const save = {
        name: 'Test flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    };
    // Phase Final Stage B: flows table retired — probe
    // existence via GET; create on miss.
    try {
        await ctx.GET('flows/' + flowId);
        await putFlow(ctx, flowId, save);
        return;
    } catch {
        // missing — create below
    }
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'p-' + flowId,
        name: save.name,
    });
    await putFlow(ctx, flowId, save);
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

// Work-order claim lifecycle rides the named ops
// (states/:id retired). Helpers mint claimAt/releaseAt so
// lock-window pins can backdate.
async function seedClaim(
    ctx: RequestContext,
    workOrderId: string,
    claimAt: string,
): Promise<void> {
    await ctx.POST(`work-orders/${workOrderId}/claim`, {
        claimEventId: generateCryptoSafeBase62(),
        claimAt,
        expireEventId: generateCryptoSafeBase62(),
        expireAt: claimAt,
    });
}

async function seedRelease(
    ctx: RequestContext,
    workOrderId: string,
    releaseAt: string,
): Promise<void> {
    await ctx.POST(`work-orders/${workOrderId}/release`, {
        releaseEventId: generateCryptoSafeBase62(),
        releaseAt,
    });
}

async function seedBareWorkOrder(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await putWorkOrder(ctx, workOrderId, {
        displayId: 'WO-T',
        flowGraph: {
            name: 'test',
            nodes: [],
            edges: [],
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
        },
        position: 0,
    });
}

// ── postWorkOrderCreation ─────────

test(
    'postWorkOrderCreation seeds work order, '
    + 'flow link, and three state events in one '
    + 'call',
    async () => {
        const { db, ctx } = await setupDb();
        const graph = buildLinearGraph();
        await seedFlow(db, 'f1', graph);

        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );

        // Phase Final Task 2: WO + join on pair plane.
        const wo = await getWorkOrder(ctx, woId);
        assert.equal(wo.id, woId);
        assert.equal(wo.position, 1);
        // Phase Final Stage B: work_orders +
        // flow_work_orders tables retired — pair plane
        // is residual pin.

        const events =
            await deriveStatesFor(db, '1', woId);
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
        await seedFlow(db, 'f1', graph);

        const firstId =
            await createWorkOrder(ctx, 'f1');
        // NAMED re-pin (Task 7): putWorkOrder is the wire
        // PUT — it takes the DOMAIN shape ({displayId,
        // flowGraph, position} with flowGraph PARSED), not
        // the raw snake_case row, so the domain object is
        // fetched first (getWorkOrder) and only its position
        // is patched.
        const first = await getWorkOrder(ctx, firstId);
        await putWorkOrder(ctx, firstId, {
            ...first,
            position: 7.5,
        });

        const secondId = await createWorkOrder(ctx, 'f1');

        // Phase Final Task 2: position from pair-plane GET.
        const second = await getWorkOrder(ctx, secondId);
        assert.equal(second.position, 8.5);
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
        await seedFlow(db, 'f1', graph);
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
        await seedFlow(db, 'f1', graph);
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
        await seedFlow(db, 'f1', buildLinearGraph());
        const a = await createWorkOrder(ctx, 'f1');
        const b = await createWorkOrder(ctx, 'f1');
        // Phase Final Task 2: positions from pair-plane GET.
        const positions = [
            (await getWorkOrder(ctx, a)).position,
            (await getWorkOrder(ctx, b)).position,
        ].sort();
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
        await seedFlow(db, 'f1', buildLinearGraph());
        const woId = await createWorkOrder(ctx, 'f1');

        // Mutate source flow AFTER the
        // work order captured its
        // snapshot — overwrite the relation
        // rows too, so the edit is real in
        // the read source, not just the blob.
        const mutated = buildLinearGraph();
        mutated.nodes[1]!.name = 'EDITED';
        await seedFlow(db, 'f1', mutated);

        // Phase Final Task 2: frozen graph on pair-plane GET.
        const wo = await getWorkOrder(ctx, woId);
        assert.equal(
            wo.flowGraph.nodes[1]!.name, 'Doing work',
        );
        assert.notEqual(
            wo.flowGraph.nodes[1]!.name, 'EDITED',
        );
        assert.equal('flowId' in wo.flowGraph, false);
    },
);

// ── postWorkOrderTransition ───────

test(
    'postWorkOrderTransition records '
    + 'transition state event and releases the '
    + 'claim',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'f1', buildLinearGraph());
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
        await seedFlow(db, 'f1', buildLinearGraph());
        const woId =
            await createWorkOrder(
                ctx, 'f1',
            );
        await pause(2);
        // Record an explicit release so no live
        // claim remains, simulating an unclaimed
        // work order.
        await seedRelease(ctx, woId, nowUtc());

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
        await seedFlow(db, 'f1', buildLinearGraph());
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
        await seedFlow(db, 'f1', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'f1');
        // Release the creation-time claim so this
        // test exercises pure claim-creation
        // without the expiration-notice branch.
        await seedRelease(ctx, woId, nowUtc());
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
        await seedFlow(db, 'f1', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'f1');
        // Release the creation-time claim so the
        // two explicit claim calls below are the
        // only contributors to the count.
        await seedRelease(ctx, woId, nowUtc());
        await pause(2);
        await postWorkOrderClaim(ctx, woId);
        await pause(2);
        await postWorkOrderClaim(ctx, woId);
        const events =
            await deriveStatesFor(db, '1', woId);
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
        const ctx = createRequestContext(db, await devToken());
        // NAMED re-pin (Task 7, the projects/:id/flows
        // precedent in tests/adapters-flow-queries.test.ts): the
        // flipped GET flows/:id/work-orders derives from the
        // message ledger, not the raw flow_work_orders table —
        // a raw db.flowWorkOrders.put leaves no pair at this
        // address, so each join must land through the SAME
        // wire-reachable PUT the live route serves.
        await ctx.PUT('flows/flow1/work-orders/fwo1', {
            flow_id: 'flow1',
            work_order_id: 'wo1',
            at: '2024-01-01T00:00:00.000000Z',
        });
        await ctx.PUT('flows/flow2/work-orders/fwo2', {
            flow_id: 'flow2',
            work_order_id: 'wo2',
            at: '2024-01-01T00:00:00.000000Z',
        });
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
        await seedBareWorkOrder(ctx, woId);
        // Backdate ten seconds; lockTimeout=1s
        // means this is past the live window.
        const longAgo = new Date(
            Date.now() - 10_000,
        ).toISOString()
        .replace('Z', '000Z');
        await seedClaim(ctx, woId, longAgo);
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
        await seedBareWorkOrder(ctx, woId);
        await seedClaim(ctx, woId, nowUtc());
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
        for (const id of [
            fresh1, fresh2, stale, released, orphan,
        ]) {
            await seedBareWorkOrder(ctx, id);
        }
        await seedClaim(ctx, fresh1, now);
        await seedClaim(ctx, fresh2, now);
        await seedClaim(ctx, stale, longAgo);
        await seedClaim(ctx, orphan, now);
        await seedClaim(ctx, released, now);
        // releaseAt strictly after claimAt so the replay
        // sees a live prior claim and emits claim_released.
        const later = new Date(Date.now() + 1_000)
            .toISOString()
            .replace('Z', '000Z');
        await seedRelease(ctx, released, later);
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

test(
    'deleteWorkOrderClaim posts release with releaseEventId'
    + ' + releaseAt and derives claim_released',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'f1', buildLinearGraph());
        // Birth create leaves a live claim; the named release
        // op ends it. Body shape is {releaseEventId,
        // releaseAt} — both caller-minted.
        const woId = await createWorkOrder(ctx, 'f1');
        await deleteWorkOrderClaim(ctx, woId);
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/' + woId + '/history',
        );
        const released = events.filter(
            (e) => e.state === 'claim_released',
        );
        assert.equal(released.length, 1);
        assert.ok(released[0]!.id.length > 0);
        assert.ok(released[0]!.at.length > 0);
    },
);

// Regression: transitionAt must be minted before release.at
// so the at-ordered ledger puts claim_released last (latest
// event wins for current-state derivation).
test(
    'postWorkOrderTransition mints transitionAt before '
    + 'release.at — latest by at is claim_released',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'f1', buildLinearGraph());
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
            await deriveStatesFor(db, '1', woId);
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
