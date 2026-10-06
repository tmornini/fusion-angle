import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    organizationItem,
    type RequestContext,
} from '../client/request-context.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    postWorkOrderCreation,
    postWorkOrderTransition,
    putWorkOrderBinding,
    putWorkOrderClaim,
    putWorkOrderPosition,
} from
'../client/work-orders-mutations.ts';
import {
    createWorkOrderFromFlow,
} from
'../web-app/app/work-order-creation.ts';
import {
    putRecordInstance,
    getRecordInstance,
    patchRecordInstance,
} from
'../client/record-instances.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../shared/http-errors.ts';
import {
    postRecordChange,
} from
'../client/records.ts';
import {
    getWorkOrder,
    getWorkOrderVersions,
    workOrderEventsOf,
    projectTransitions,
} from
'../client/work-orders-queries.ts';
import {
    getFlowWithGraph,
} from
'../client/flow-queries.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../client/flow-mutations.ts';
import {
    generateIdentifier,
} from
'../shared/identifier.ts';
import {
    deleteWorkOrderClaim,
} from
'../client/work-orders-deletions.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../shared/types.ts';
import {
    isExpiresAtPassed,
} from '../shared/work-order-claims.ts';
import type {
    WorkOrderEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
    WorkOrderEventEntity,
} from '../shared/types.ts';
import {
    getWorkOrderEvents,
} from './fixtures/work-order-events.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';

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
    await createWorkOrderFromFlow(ctx, {
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
// putFlow), so a message pair exists at this flow's document —
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
    const ctx = inPageContext(db, await organizationToken());
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
    const ctx = inPageContext(db, await organizationToken());
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
    const read = await ctx.GET(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId,
    );
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId + '/claim',
        {
        claimEventId: generateIdentifier(),
        claimAt,
        expireEventId: generateIdentifier(),
        expireAt: claimAt,
    }, [read]);
}

async function seedRelease(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    const read = await ctx.GET(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId,
    );
    await ctx.DELETE(
        'organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/work-orders/' + workOrderId + '/claim',
        [read],
    );
}

async function seedBareWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    workOrderId: string,
): Promise<void> {
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        id: workOrderId,
        fields: {
            display_id: 'WO-T',
            flow_graph: {
                name: 'test',
                nodes: [],
                edges: [],
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
            },
            position: 0,
        },
        flowId: generateIdentifier(),
        births: [START_NODE, START_NODE],
        at: nowUtc(),
        token,
        claim: 'released',
    });
}

// ── postWorkOrderCreation ─────────

Deno.test(
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
        assertStrictEquals(wo.id, woId);
        assertStrictEquals(wo.position, 1);
        // Phase Final Stage B: work_orders +
        // flow_work_orders tables retired — message plane
        // is residual pin.

        const events =
            await getWorkOrderEvents(
                db, await organizationToken(),
                'AjdvjuECVZEgZoFajaIEkg', woId,
            );
        // start node, post-start, claimed
        assertStrictEquals(events.length, 3);
        const nonClaim = events.filter(
            (e: WorkOrderEventEntity) =>
                e.state !== 'claimed',
        );
        assertStrictEquals(nonClaim.length, 2);
        assertStrictEquals(
            nonClaim[0]!.state, START_NODE,
        );
        assertStrictEquals(
            nonClaim[1]!.state, MIDDLE_NODE,
        );
        const claims = events.filter(
            (e: WorkOrderEventEntity) =>
                e.state === 'claimed',
        );
        assertStrictEquals(claims.length, 1);
        assertStrictEquals(
            claims[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
        );
    },
);

Deno.test(
    'postWorkOrderCreation appends past a'
    + ' fractional baseline without renumbering',
    async () => {
        const { db, ctx } = await setupDb();
        const graph = buildLinearGraph();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', graph);

        const firstId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderPosition(
            ctx, await getWorkOrder(ctx, firstId), 7.5,
        );

        const secondId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');

        // Phase Final Task 2: position from message-plane GET.
        const second = await getWorkOrder(ctx, secondId);
        assertStrictEquals(second.position, 8.5);
    },
);

// Another writer's display id move: a conditional PUT of the
// work order's own fields with a new display id.
async function moveDisplayId(
    ctx: RequestContext,
    id: string,
): Promise<void> {
    const path = organizationItem(ctx, 'work-orders', id);
    const read = await ctx.GET<WorkOrderEntity>(path);
    const body = read.body().toValue();
    await ctx.PUT(path, {
        display_id: 'ffffffff',
        flow_graph: body.flow_graph,
        position: body.position,
    }, [read]);
}

Deno.test(
    'putWorkOrderPosition keeps the held'
    + ' displayId and flow graph',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
        );
        const id = await createWorkOrder(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
        );
        const cached = await getWorkOrder(ctx, id);
        await moveDisplayId(ctx, id);
        // The page holds the head after another write moved
        // its displayId; the position PUT carries the held
        // fields, so the reorder keeps that displayId and the
        // flow graph.
        await putWorkOrderPosition(
            ctx, await getWorkOrder(ctx, id), 7.5,
        );
        const head = await getWorkOrder(ctx, id);
        assertStrictEquals(head.displayId, 'ffffffff');
        assertStrictEquals(head.position, 7.5);
        assertEquals(head.flowGraph, cached.flowGraph);
    },
);

Deno.test(
    'a stale work order position PUT surfaces 412',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
        );
        const id = await createWorkOrder(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
        );
        const held = await getWorkOrder(ctx, id);
        // Another write moves the head after the page's
        // read and before the reorder.
        await moveDisplayId(ctx, id);
        const error = await assertRejects(
            () => putWorkOrderPosition(ctx, held, 7.5),
            RequestError,
        );
        assertStrictEquals(
            error.status, HTTP_PRECONDITION_FAILED,
        );
        const head = await getWorkOrder(ctx, id);
        assertStrictEquals(head.displayId, 'ffffffff');
    },
);

Deno.test(
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
        await assertRejects(
            () =>
                createWorkOrder(
                    ctx, 'ZOousbbnzpqlxJExVAruYQ',
                ),
            Error,
            'no start node',
        );
    },
);

Deno.test(
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
        await assertRejects(
            () =>
                createWorkOrder(
                    ctx, 'ZOousbbnzpqlxJExVAruYQ',
                ),
            Error,
            'exactly one outgoing edge',
        );
    },
);

Deno.test(
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
        assertEquals(
            positions, [1, 2],
        );
    },
);

Deno.test(
    'postWorkOrderCreation posts the position it'
    + ' is handed',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
        );
        const ids = mintCreateIds();
        await postWorkOrderCreation(ctx, {
            ...ids,
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
            flow: await getFlowWithGraph(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            ),
            position: 42,
        });
        assertStrictEquals(
            (await getWorkOrder(ctx, ids.workOrderId)).position,
            42,
        );
    },
);

Deno.test(
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
        assertStrictEquals(middle!.name, 'Doing work');
        assertNotStrictEquals(middle!.name, 'EDITED');
        assertStrictEquals('flowId' in wo.flowGraph, false);
    },
);

// ── postWorkOrderTransition ───────

Deno.test(
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
            (await getWorkOrder(ctx, woId)).nodeId;
        assertStrictEquals(beforeNode, MIDDLE_NODE);
        const beforeClaim =
            (await getWorkOrder(ctx, woId)).claim;
        assert(
            beforeClaim.state === 'claimed'
            && !isExpiresAtPassed(beforeClaim.expiresAt),
        );

        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const afterNode =
            (await getWorkOrder(ctx, woId)).nodeId;
        assertStrictEquals(afterNode, FINISH_NODE);
        const afterClaim =
            (await getWorkOrder(ctx, woId)).claim;
        assertStrictEquals(
            afterClaim.state === 'claimed'
            && !isExpiresAtPassed(afterClaim.expiresAt),
            false,
        );
    },
);

Deno.test(
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
        await seedRelease(ctx, woId);

        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const events =
            projectTransitions(
                woId,
                workOrderEventsOf(
                    await getWorkOrderVersions(ctx, woId),
                ),
            );
        // start, post-start, after-transition
        assertStrictEquals(events.length, 3);
        assertStrictEquals(
            events.at(-1)!.toNodeId, FINISH_NODE,
        );
    },
);

Deno.test('a transition reads no history', async () => {
    const { db, ctx } = await setupDb();
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
    );
    const woId = await createWorkOrder(
        ctx, 'ZOousbbnzpqlxJExVAruYQ',
    );
    const held = await getWorkOrder(ctx, woId);
    const recorded = recordedContext(
        db, await organizationToken(),
    );
    await postWorkOrderTransition(recorded.ctx, {
        workOrder: held,
        edgeId: EDGE_MIDDLE_FINISH,
        values: {},
    });
    assertEquals(
        recorded.sent.filter(
            (r) => r.path.endsWith('/history')
                || r.path.includes('/versions/'),
        ),
        [],
    );
});

Deno.test(
    'postWorkOrderTransition throws '
    + 'when edge id does not exist',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(
                ctx, 'ZOousbbnzpqlxJExVAruYQ',
            );
        const workOrder = await getWorkOrder(ctx, woId);
        await assertRejects(
            () =>
                postWorkOrderTransition(ctx, {
                    workOrder,
                    edgeId: generateIdentifier(),
                    values: {},
                }),
            Error,
            'Edge not found',
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
    const ctx = inPageContext(
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

Deno.test(
    'postWorkOrderTransition value-bearing sets'
    + ' only changed values on the instance head',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, await getWorkOrder(ctx, woId), INST_ID, RT_ID,
        );
        await pause(2);

        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            // ATTR changed; no other keys → set only.
            values: { [ATTR_ID]: 'xDyDkxEPwtcNmJVknUHDsg' },
        });

        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assertStrictEquals(
            head.values.get(ATTR_ID),
            'xDyDkxEPwtcNmJVknUHDsg',
        );
        assertStrictEquals(
            (await getWorkOrder(ctx, woId)).nodeId,
            FINISH_NODE,
        );
    },
);

Deno.test(
    'postWorkOrderTransition 412s when the snapshot'
    + ' etag is stale against a concurrent PATCH',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, await getWorkOrder(ctx, woId), INST_ID, RT_ID,
        );
        // The binding moved the head, so the page holds the
        // work order it read after the binding.
        const workOrder = await getWorkOrder(ctx, woId);
        const loaded = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        const beforeNode =
            (await getWorkOrder(ctx, woId)).nodeId;
        await patchRecordInstance(
            ctx, RT_ID, INST_ID, loaded.message, {
                set: [{
                    attributeId: ATTR_ID,
                    value: 'vB',
                }],
            },
        );
        const err = await assertRejects(
            () => postWorkOrderTransition(ctx, {
                workOrder,
                edgeId: EDGE_MIDDLE_FINISH,
                values: { [ATTR_ID]: 'vStale' },
                instance: loaded.message,
            }),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, HTTP_PRECONDITION_FAILED);
        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assertStrictEquals(
            head.values.get(ATTR_ID), 'vB',
        );
        assertStrictEquals(
            (await getWorkOrder(ctx, woId)).nodeId,
            beforeNode,
        );
    },
);

Deno.test(
    'postWorkOrderTransition blank pending clears'
    + ' a set head value',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, await getWorkOrder(ctx, woId), INST_ID, RT_ID,
        );
        await pause(2);

        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            values: { [ATTR_ID]: '' },
        });

        const head = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assertStrictEquals(
            head.values.has(ATTR_ID), false,
        );
    },
);

Deno.test(
    'postWorkOrderTransition pure move when'
    + ' pending equals head omits set/clear',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ', 'v0');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, await getWorkOrder(ctx, woId), INST_ID, RT_ID,
        );
        const before = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        await pause(2);

        // Unchanged values → pure move (no If-Match
        // path; instance etag must not advance).
        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            values: { [ATTR_ID]: 'v0' },
        });

        const after = await getRecordInstance(
            ctx, RT_ID, INST_ID,
        );
        assertStrictEquals(
            after.message.query('header.etag').toText(),
            before.message.query('header.etag').toText(),
        );
        assertStrictEquals(
            after.values.get(ATTR_ID), 'v0',
        );
        assertStrictEquals(
            (await getWorkOrder(ctx, woId)).nodeId,
            FINISH_NODE,
        );
    },
);

Deno.test(
    'putWorkOrderBinding embeds instance on'
    + ' the work-order GET',
    async () => {
        const { db, ctx } = await setupScopedDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        await seedTypeInstanceAndJoin(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await putWorkOrderBinding(
            ctx, await getWorkOrder(ctx, woId), INST_ID, RT_ID,
        );
        const wo = await getWorkOrder(ctx, woId);
        assertStrictEquals(wo.instanceId, INST_ID);
        assertStrictEquals(wo.recordTypeId, RT_ID);
    },
);

// ── putWorkOrderClaim ────────────

Deno.test(
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
        await seedRelease(ctx, woId);
        await pause(2);
        await putWorkOrderClaim(
            ctx, await getWorkOrder(ctx, woId),
        );

        const claim = (await getWorkOrder(ctx, woId)).claim;
        assert(
            claim.state === 'claimed'
            && !isExpiresAtPassed(claim.expiresAt),
        );
        assertStrictEquals(claim.memberId, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'putWorkOrderClaim by the holder renews its claim'
    + ' and records the renewal',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        const woId =
            await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        // Release the creation-time claim so the
        // two explicit claim calls below are the
        // only contributors to the count.
        await seedRelease(ctx, woId);
        await pause(2);
        await putWorkOrderClaim(
            ctx, await getWorkOrder(ctx, woId),
        );
        await pause(2);
        await putWorkOrderClaim(
            ctx, await getWorkOrder(ctx, woId),
        );
        const events =
            await getWorkOrderEvents(
                db, await organizationToken(),
                'AjdvjuECVZEgZoFajaIEkg', woId,
            );
        const claimed = events.filter(
            (e: WorkOrderEventEntity) =>
                e.state === 'claimed',
        );
        // Initial creation claim plus ONE per explicit
        // call: each mints a fresh claimAt, so the
        // holder's repeat renews its claim.
        assertStrictEquals(
            claimed.length, 3,
            'expected exactly 3 claimed events,'
            + ' got ' + claimed.length,
        );
    },
);

Deno.test(
    'a claim and its release latch the work order they'
    + ' hold',
    async () => {
        const { db } = await setupDb();
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
        );
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        const workOrderId = await createWorkOrder(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
        );
        const workOrder = await getWorkOrder(ctx, workOrderId);
        sent.length = 0;
        const claimed = await putWorkOrderClaim(ctx, workOrder);
        const released = await deleteWorkOrderClaim(
            ctx, claimed,
        );
        assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
            ['PUT', workOrder.message.query('header.etag').toText()],
            ['DELETE', claimed.message.query('header.etag').toText()],
        ]);
        assertStrictEquals(
            released.message.body().toValue().claim, undefined,
        );
    },
);

Deno.test(
    'a binding sends no GET before its PUT',
    async () => {
        const { db } = await setupScopedDb();
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
        );
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        await seedTypeInstanceAndJoin(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
        );
        const workOrderId = await createWorkOrder(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
        );
        const workOrder = await getWorkOrder(ctx, workOrderId);
        sent.length = 0;
        const bound = await putWorkOrderBinding(
            ctx, workOrder, INST_ID, RT_ID,
        );
        assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
            ['PUT', workOrder.message.query('header.etag').toText()],
        ]);
        assertStrictEquals(bound.instanceId, INST_ID);
    },
);

// ── getFlowWorkOrderEntities ──────────

import {
    getFlowWorkOrderEntities,
} from
'../client/work-orders-queries.ts';

Deno.test(
    'getFlowWorkOrderEntities returns the seeded '
    + 'flow-work-order rows for the asked flow only',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = inPageContext(db, await organizationToken());
        // NAMED re-pin (Task 7, the organizations/:id/projects/:id/flows
        // precedent in tests/adapters-flow-queries.test.ts): the
        // flipped GET organizations/:id/flows/:id/work-orders derives from
        // the
        // message ledger, not the raw flow_work_orders table —
        // a raw db.flowWorkOrders.put leaves no pair at this
        // document, so each join must land through the SAME
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
        assertStrictEquals(flow1Rows.length, 1);
        assertStrictEquals(
            flow1Rows[0]!.body().toValue().work_order_id,
            'yNSSnbrpacodQTzUEcdEVA',
        );
        const flow2Rows =
            await getFlowWorkOrderEntities(ctx, flow2);
        assertStrictEquals(flow2Rows.length, 1);
        assertStrictEquals(
            flow2Rows[0]!.body().toValue().work_order_id,
            'yNXXsTEwShOozlQCEWKIIw',
        );
    },
);

// ── the twin's claim, judged as the pages judge it ────

Deno.test(
    'the twin treats a stale '
    + 'claimed event as implicitly expired',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const token = await organizationToken();
        const ctx = inPageContext(db, token);
        const woId = generateIdentifier();
        await seedBareWorkOrder(db, token, woId);
        // Backdate past the graph's lockTimeout, so the
        // claim's expires_at is already behind us.
        const longAgo = new Date(
            Date.now()
            - (DEFAULT_LOCK_TIMEOUT + 1) * 1000,
        ).toISOString()
        .replace('Z', '000Z');
        await seedClaim(ctx, woId, longAgo);
        const claim = (await getWorkOrder(ctx, woId)).claim;
        assertStrictEquals(
            claim.state === 'claimed'
            && !isExpiresAtPassed(claim.expiresAt),
            false,
        );
    },
);

Deno.test(
    'the twin shows the fresh '
    + 'claim when within the lock window',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const token = await organizationToken();
        const ctx = inPageContext(db, token);
        const woId = generateIdentifier();
        await seedBareWorkOrder(db, token, woId);
        await seedClaim(ctx, woId, nowUtc());
        const claim = (await getWorkOrder(ctx, woId)).claim;
        assert(
            claim.state === 'claimed'
            && !isExpiresAtPassed(claim.expiresAt),
        );
        assertStrictEquals(claim.memberId, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'deleteWorkOrderClaim DELETEs claim and '
    + 'derives claim_released',
    async () => {
        const { db, ctx } = await setupDb();
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        // Birth create leaves a live claim; DELETE
        // on the claim path ends it.
        const woId = await createWorkOrder(ctx, 'ZOousbbnzpqlxJExVAruYQ');
        await deleteWorkOrderClaim(
            ctx, await getWorkOrder(ctx, woId),
        );
        const released = workOrderEventsOf(
            await getWorkOrderVersions(ctx, woId),
        ).filter((e) => e.state === 'claim_released');
        assertStrictEquals(released.length, 1);
        assert(released[0]!.id.length > 0);
        assert(released[0]!.at.length > 0);
    },
);

// Regression: transitionAt must be minted before release.at
// so the at-ordered ledger puts claim_released last (latest
// event wins for current-state derivation).
Deno.test(
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
            (await getWorkOrder(ctx, woId)).claim;
        assert(
            beforeClaim.state === 'claimed'
            && !isExpiresAtPassed(beforeClaim.expiresAt),
            'expected a live claim before transition',
        );

        await postWorkOrderTransition(ctx, {
            workOrder: await getWorkOrder(ctx, woId),
            edgeId: EDGE_MIDDLE_FINISH,
            values: {},
        });

        const allEvents =
            await getWorkOrderEvents(
                db, await organizationToken(),
                'AjdvjuECVZEgZoFajaIEkg', woId,
            );
        const transitionEvt = allEvents.find(
            (e: WorkOrderEventEntity) =>
                e.state === FINISH_NODE,
        );
        const releaseEvt = allEvents.find(
            (e: WorkOrderEventEntity) =>
                e.state === 'claim_released',
        );
        assert(
            transitionEvt !== undefined,
            'expected a transition (finish) event',
        );
        assert(
            releaseEvt !== undefined,
            'expected a claim_released event',
        );
        // The route emits transition first, then
        // release — so transitionAt < release.at must
        // hold in the at-ordered ledger, making
        // claim_released the latest (winning) event.
        assert(
            transitionEvt.at < releaseEvt.at,
            'transitionAt must be strictly less than'
            + ' release.at; got transition='
            + transitionEvt.at
            + ' release=' + releaseEvt.at,
        );
    },
);

Deno.test('a work order\'s events fold from its versions in'
+ ' chain order', async () => {
    const { db, ctx } = await setupDb();
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
    );
    const id = await createWorkOrder(
        ctx, 'ZOousbbnzpqlxJExVAruYQ',
    );
    await seedRelease(ctx, id);
    const versions = await getWorkOrderVersions(ctx, id);
    assertStrictEquals(versions.length, 2);
    assertEquals(
        workOrderEventsOf(versions).map((e) => e.state),
        [START_NODE, MIDDLE_NODE, 'claimed',
            'claim_released'],
    );
});

Deno.test('projectTransitions keeps chain order for two'
+ ' events at one at', () => {
    const at = '2026-01-01T00:00:00.000000Z';
    const event = (id: string, state: string) => ({
        id, state, member_id: 'XXZruirZyAOoRpNxaDnpSA', at,
        field_values: [],
    });
    const moves = projectTransitions('wo', [
        event('z-first', 'n-1'),
        event('a-second', 'n-2'),
    ]);
    assertEquals(moves.map((m) => m.id), [
        'z-first', 'a-second',
    ]);
    assertEquals(moves.map((m) => m.toNodeId), [
        'n-1', 'n-2',
    ]);
});
