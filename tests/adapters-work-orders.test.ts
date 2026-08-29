import { test } from 'node:test';
import { workOrderLifecycleStatesFor } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    postWorkOrderCreation,
    postWorkOrderTransition,
    putWorkOrderBinding,
    putWorkOrderClaim,
    putWorkOrder,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    putRecordInstance,
    getRecordInstance,
    patchRecordInstance,
} from
'../web-app/app/adapters/record-instances.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../api/http-errors.ts';
import {
    postRecordChange,
} from
'../web-app/app/adapters/records.ts';
import {
    getWorkOrder,
    getWorkOrderActiveClaim,
    getWorkOrderCurrentNodeId,
    getWorkOrderTransitionEvents,
    getActiveClaimsByWorkOrder,
} from
'../web-app/app/adapters/work-orders-queries.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    generateIdentifier,
} from
'../shared/identifier.ts';
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
        workOrderId: generateIdentifier(),
        flowLinkId: generateIdentifier(),
    };
}

const START_NODE = generateIdentifier();
const MIDDLE_NODE = generateIdentifier();
const FINISH_NODE = generateIdentifier();
const EDGE_MIDDLE_FINISH = generateIdentifier();

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
                START_NODE,
                'Start',
                { isCreate: true },
            ),
            buildNode(
                MIDDLE_NODE,
                'Doing work',
                { memberIds: ['XXZruirZyAOoRpNxaDnpSA'] },
            ),
            buildNode(
                FINISH_NODE,
                'Done',
                { isArchive: true },
            ),
        ],
        edges: [
            buildEdge(
                'YiJPbufDpkyrZcZCYbUJpg',
                START_NODE,
                MIDDLE_NODE,
            ),
            buildEdge(
                EDGE_MIDDLE_FINISH,
                MIDDLE_NODE,
                FINISH_NODE,
            ),
        ],
    };
}

// Seed (or re-save) a flow through the SAME gate-driven create/
// document-PUT idiom the live route uses (postFlowCreation +
// putFlow), so a message pair exists at this flow's address —
// required for the flipped GET organizations/:id/flows/:id route (Phase 4
// Task
// 8), which postWorkOrderCreation reads before creating, to
// derive it. A first call creates (postFlowCreation seeds a
// default start/complete graph; the immediate putFlow overwrites
// it with the caller's own graph); a REPEAT call on the same
// flowId (the "freezes flow_graph against subsequent flow
// edits" case re-seeds 'ZOousbbnzpqlxJExVAruYQ' to simulate an edit) instead
// saves
// straight over the existing flow via putFlow alone — postFlowCreation
// is genesis-only.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = createRequestContext(db, await organizationToken());
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
        await ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId);
        await putFlow(ctx, flowId, save);
        return;
    } catch {
        // missing — create below
    }
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: save.name,
    });
    await putFlow(ctx, flowId, save);
}

async function setupDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test');
    const ctx = createRequestContext(db, await organizationToken());
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
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId + '/claim',
        {
        claimEventId: generateIdentifier(),
        claimAt,
        expireEventId: generateIdentifier(),
        expireAt: claimAt,
    });
}

async function seedRelease(
    ctx: RequestContext,
    workOrderId: string,
    _releaseAt: string,
): Promise<void> {
    await ctx.DELETE(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId + '/claim',
    );
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', graph);

        const woId =
            await createWorkOrder(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            );

        // Phase Final Task 2: WO + join on message plane.
        const wo = await getWorkOrder(ctx, woId);
        assert.equal(wo.id, woId);
        assert.equal(wo.position, 1);
        // Phase Final Stage B: work_orders +
        // flow_work_orders tables retired — message plane
        // is residual pin.

        const events =
            await workOrderLifecycleStatesFor(db, 'AjdvjuECVZEgZoFajaIEkg'
                , woId);
        // start node, post-start, claimed
        assert.equal(events.length, 3);
        const nonClaim = events.filter(
            (e: StateEntity) =>
                e.state !== 'claimed',
        );
        assert.equal(nonClaim.length, 2);
        assert.equal(
            nonClaim[0]!.state, START_NODE,
        );
        assert.equal(
            nonClaim[1]!.state, MIDDLE_NODE,
        );
        const claims = events.filter(
            (e: StateEntity) =>
                e.state === 'claimed',
        );
        assert.equal(claims.length, 1);
        assert.equal(
            claims[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
        );
    },
);

test(
    'postWorkOrderCreation appends past a'
    + ' fractional baseline without renumbering',
    async () => {
        const { db, ctx } = await setupDb();
        const graph = buildLinearGraph();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', graph);

        const firstId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
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

        const secondId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');

        // Phase Final Task 2: position from message-plane GET.
        const second = await getWorkOrder(ctx, secondId);
        assert.equal(second.position, 8.5);
    },
);

test(
    'postWorkOrderCreation throws '
    + 'when flow has no start node',
    async () => {
        const { db, ctx } = await setupDb();
        const nodeA = generateIdentifier();
        const nodeB = generateIdentifier();
        const graph: StoredGraph = {
            nodes: [
                buildNode(nodeA, 'A', {
                    memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
                }),
                buildNode(nodeB, 'B', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(generateIdentifier(), nodeA, nodeB),
            ],
        };
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', graph);
        await assert.rejects(
            () =>
                createWorkOrder(
                    ctx, 'ZOousbbnzpqlxJExVAruYQ',
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
        const startId = generateIdentifier();
        const nodeA = generateIdentifier();
        const nodeB = generateIdentifier();
        const graph: StoredGraph = {
            nodes: [
                buildNode(
                    startId, 'Start',
                    { isCreate: true },
                ),
                buildNode(nodeA, 'A', {
                    memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
                    isArchive: true,
                }),
                buildNode(nodeB, 'B', {
                    memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    'YiJPbufDpkyrZcZCYbUJpg', startId, nodeA,
                ),
                buildEdge(
                    generateIdentifier(), startId, nodeB,
                ),
            ],
        };
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', graph);
        await assert.rejects(
            () =>
                createWorkOrder(
                    ctx, 'ZOousbbnzpqlxJExVAruYQ',
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const a = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        const b = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        // Phase Final Task 2: positions from message-plane GET.
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');

        // Mutate source flow AFTER the
        // work order captured its
        // snapshot — overwrite the relation
        // rows too, so the edit is real in
        // the read source, not just the blob.
        const mutated = buildLinearGraph();
        mutated.nodes[1]!.name = 'EDITED';
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', mutated);

        // Phase Final Task 2: frozen graph on message-plane GET.
        const wo = await getWorkOrder(ctx, woId);
        const middle = wo.flowGraph.nodes.find(
            n => n.id === MIDDLE_NODE,
        );
        assert.equal(middle!.name, 'Doing work');
        assert.notEqual(middle!.name, 'EDITED');
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            );
        await pause(2);

        const beforeNode =
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            );
        assert.equal(beforeNode, MIDDLE_NODE);
        const beforeClaim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.ok(beforeClaim !== null);

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const afterNode =
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            );
        assert.equal(afterNode, FINISH_NODE);
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            );
        await pause(2);
        // Record an explicit release so no live
        // claim remains, simulating an unclaimed
        // work order.
        await seedRelease(ctx, woId, nowUtc());

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const events =
            await getWorkOrderTransitionEvents(
                ctx, woId,
            );
        // start, post-start, after-transition
        assert.equal(events.length, 3);
        assert.equal(
            events.at(-1)!.toNodeId, FINISH_NODE,
        );
    },
);

test(
    'postWorkOrderTransition throws '
    + 'when edge id does not exist',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            );
        await assert.rejects(
            () =>
                postWorkOrderTransition(ctx, {
                    workOrderId: woId,
                    edgeId: generateIdentifier(),
                    values: {},
                }),
            /Edge not found/,
        );
    },
);

// Value-bearing instance-head transitions: seed a
// record type + instance, join the flow, bind the
// WO, then assert set/clear/omit and pure-move.
const RT_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INST_ID = generateIdentifier();

// Instance adapters need an org-scoped token
// (activeOrganization on the vessel).
async function setupScopedDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
    );
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    return { db, ctx };
}

async function seedTypeInstanceAndJoin(
    ctx: RequestContext,
    flowId: string,
    headValue: string = 'v0',
): Promise<void> {
    await postRecordChange(ctx, RT_ID, {
        kind: 'create',
        record: {
            name: 'WO Adapter Type',
            description: '',
            position: 1,
        },
        attributes: [
            {
                id: ATTR_ID,
                record_id: RT_ID,
                name: 'Title',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            },
        ],
        initialState: 'active',
    });
    await putRecordInstance(
        ctx, RT_ID, INST_ID, [
            {
                attributeId: ATTR_ID,
                value: headValue,
            },
        ],
    );
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/records/' + generateIdentifier(),
        {
            flow_id: flowId,
            record_id: RT_ID,
            at: nowUtc(),
        },
    );
}

test(
    'postWorkOrderTransition value-bearing sets'
    + ' only changed values on the instance head',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, woId, INST_ID, RT_ID,
        );
        await pause(2);

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: EDGE_MIDDLE_FINISH,
            // ATTR changed; no other keys → set only.
            values: { [ATTR_ID]: 'xDyDkxEPwtcNmJVknUHDsg' },
        });

        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assert.equal(
            head.values.get(ATTR_ID), 'xDyDkxEPwtcNmJVknUHDsg',
        );
        assert.equal(
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            ),
            FINISH_NODE,
        );
    },
);

test(
    'postWorkOrderTransition 412s when the snapshot'
    + ' etag is stale against a concurrent PATCH',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, woId, INST_ID, RT_ID,
        );
        const loaded = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        const beforeNode =
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            );
        await patchRecordInstance(
            ctx, RT_ID, INST_ID, loaded.etag, {
                set: [{
                    attributeId: ATTR_ID,
                    value: 'vB',
                }],
            },
        );
        await assert.rejects(
            () => postWorkOrderTransition(ctx, {
                workOrderId: woId,
                edgeId: EDGE_MIDDLE_FINISH,
                values: { [ATTR_ID]: 'vStale' },
                instanceEtag: loaded.etag,
            }),
            (err: unknown) =>
                err instanceof RequestError
                && err.status
                    === HTTP_PRECONDITION_FAILED,
        );
        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assert.equal(
            head.values.get(ATTR_ID), 'vB',
        );
        assert.equal(
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            ),
            beforeNode,
        );
    },
);

test(
    'postWorkOrderTransition blank pending clears'
    + ' a set head value',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, woId, INST_ID, RT_ID,
        );
        await pause(2);

        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: EDGE_MIDDLE_FINISH,
            values: { [ATTR_ID]: '' },
        });

        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assert.equal(
            head.values.has(ATTR_ID), false,
        );
    },
);

test(
    'postWorkOrderTransition pure move when'
    + ' pending equals head omits set/clear',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, woId, INST_ID, RT_ID,
        );
        const before = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        await pause(2);

        // Unchanged values → pure move (no If-Match
        // path; instance etag must not advance).
        await postWorkOrderTransition(ctx, {
            workOrderId: woId,
            edgeId: EDGE_MIDDLE_FINISH,
            values: { [ATTR_ID]: 'v0' },
        });

        const after = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assert.equal(after.etag, before.etag);
        assert.equal(
            after.values.get(ATTR_ID), 'v0',
        );
        assert.equal(
            await getWorkOrderCurrentNodeId(
                ctx, woId,
            ),
            FINISH_NODE,
        );
    },
);

test(
    'putWorkOrderBinding embeds instance on'
    + ' the work-order GET',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, woId, INST_ID, RT_ID,
        );
        const wo = await getWorkOrder(ctx, woId);
        assert.equal(wo.instanceId, INST_ID);
        assert.equal(wo.recordTypeId, RT_ID);
    },
);

// ── putWorkOrderClaim ────────────

test(
    'putWorkOrderClaim records a fresh '
    + 'claimed state event',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        // Release the creation-time claim so this
        // test exercises pure claim-creation
        // without the expiration-notice branch.
        await seedRelease(ctx, woId, nowUtc());
        await pause(2);
        await putWorkOrderClaim(ctx, woId);

        const claim =
            await getWorkOrderActiveClaim(
                ctx, woId, DEFAULT_LOCK_TIMEOUT,
            );
        assert.ok(claim !== null);
        assert.equal(claim.memberId, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

test(
    'putWorkOrderClaim is idempotent — a repeat '
    + 'claim by the holder appends no duplicate',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        // Release the creation-time claim so the
        // two explicit claim calls below are the
        // only contributors to the count.
        await seedRelease(ctx, woId, nowUtc());
        await pause(2);
        await putWorkOrderClaim(ctx, woId);
        await pause(2);
        await putWorkOrderClaim(ctx, woId);
        const events =
            await workOrderLifecycleStatesFor(db, 'AjdvjuECVZEgZoFajaIEkg'
                , woId);
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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        // NAMED re-pin (Task 7, the organizations/:id/projects/:id/flows
        // precedent in tests/adapters-flow-queries.test.ts): the
        // flipped GET organizations/:id/flows/:id/work-orders derives from
        // the
        // message ledger, not the raw flow_work_orders table —
        // a raw db.flowWorkOrders.put leaves no pair at this
        // address, so each join must land through the SAME
        // wire-reachable PUT the live route serves.
        const flow1 = generateIdentifier();
        const flow2 = generateIdentifier();
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flow1 + '/work-orders/'
                + generateIdentifier(),
            {
            flow_id: flow1,
            work_order_id: 'yNSSnbrpacodQTzUEcdEVA',
            at: '2024-01-01T00:00:00.000000Z',
        });
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + flow2 + '/work-orders/'
                + generateIdentifier(),
            {
            flow_id: flow2,
            work_order_id: 'yNXXsTEwShOozlQCEWKIIw',
            at: '2024-01-01T00:00:00.000000Z',
        });
        // The server now filters the nested collection to its
        // parent flow — each flow surfaces only its own join.
        const flow1Rows =
            await getFlowWorkOrderEntities(ctx, flow1);
        assert.equal(flow1Rows.length, 1);
        assert.equal(
            flow1Rows[0]!.work_order_id, 'yNSSnbrpacodQTzUEcdEVA',
        );
        const flow2Rows =
            await getFlowWorkOrderEntities(ctx, flow2);
        assert.equal(flow2Rows.length, 1);
        assert.equal(
            flow2Rows[0]!.work_order_id, 'yNXXsTEwShOozlQCEWKIIw',
        );
    },
);

// ── lockTimeout-aware getWorkOrderActiveClaim ────

test(
    'getWorkOrderActiveClaim treats a stale '
    + 'claimed event as implicitly expired',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const woId = generateIdentifier();
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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const woId = generateIdentifier();
        await seedBareWorkOrder(ctx, woId);
        await seedClaim(ctx, woId, nowUtc());
        const claim = await getWorkOrderActiveClaim(
            ctx, woId, DEFAULT_LOCK_TIMEOUT,
        );
        assert.ok(claim !== null);
        assert.equal(claim.memberId, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

// ── fan-in getActiveClaimsByWorkOrder ────

test(
    'getActiveClaimsByWorkOrder resolves every '
    + 'order claim via per-item history, honoring '
    + 'per-order lockTimeout and the work-order set',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const fresh1 = generateIdentifier();
        const fresh2 = generateIdentifier();
        const stale = generateIdentifier();
        const released = generateIdentifier();
        const orphan = generateIdentifier();
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
            claims.get(fresh1)!.memberId, 'XXZruirZyAOoRpNxaDnpSA',
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
    'deleteWorkOrderClaim DELETEs claim and '
    + 'derives claim_released',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        // Birth create leaves a live claim; DELETE
        // on the claim address ends it.
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await deleteWorkOrderClaim(ctx, woId);
        const events = await ctx.GET<StateEntity[]>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
                + '/history',
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
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
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
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const allEvents =
            await workOrderLifecycleStatesFor(db, 'AjdvjuECVZEgZoFajaIEkg'
                , woId);
        const transitionEvt = allEvents.find(
            (e: StateEntity) =>
                e.state === FINISH_NODE,
        );
        const releaseEvt = allEvents.find(
            (e: StateEntity) =>
                e.state === 'claim_released',
        );
        assert.ok(
            transitionEvt !== undefined,
            'expected a transition (finish) event',
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
