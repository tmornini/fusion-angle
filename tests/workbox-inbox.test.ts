import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
    assertStringIncludes,
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
import { organizationToken } from './token-fixtures.ts';
import {
    createWorkOrderFromFlow,
} from
'../web-app/app/work-order-creation.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../client/flow-mutations.ts';
import {
    getWorkOrders,
    putWorkOrderPosition,
    type WorkOrder,
} from '../client/index.ts';
import {
    buildInboxItems,
    WorkboxInboxPresenter,
    type InboxLists,
} from
    '../web-app/app/presenters/workbox-inbox.ts';
import {
    getInboxRows,
    type InboxRows,
} from '../web-app/app/workbox-inbox-rows.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import type {
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../shared/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    postMembershipRemoval,
    getHumanMember,
} from '../client/members.ts';

const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const E2 = generateIdentifier();

// -- Fixtures ---------------------------------

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
    // n-middle carries one member so the flow
    // passes the publish gate (zero-member nodes
    // would mark the flow Not Ready).
    return {
        nodes: [
            buildNode(N_START, 'Start', {
                isCreate: true,
            }),
            buildNode(N_MIDDLE, 'Doing work', {
                memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
            }),
            buildNode(N_FINISH, 'Done', {
                isArchive: true,
            }),
        ],
        edges: [
            buildEdge('YiJPbufDpkyrZcZCYbUJpg', N_START, N_MIDDLE),
            buildEdge(E2, N_MIDDLE, N_FINISH),
        ],
    };
}

// Seed a flow through the SAME gate-driven create/document-PUT
// idiom the live route uses (postFlowCreation + putFlow), so a
// message pair exists at this flow's document — required for the
// flipped GET organizations/:id/flows/:id route (Phase 4 Task 8), which
// postWorkOrderCreation reads before creating (this file's own
// comment names that freeze dependency), to derive it.
// postFlowCreation seeds a default start/complete graph; the
// immediate putFlow overwrites it with the caller's own graph.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = inPageContext(db, await organizationToken());
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: 'Test flow',
    });
    await putFlow(ctx, flowId, {
        name: 'Test flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

type WoTables = InboxRows;

async function collectTables(
    db: MemoryDbAdapter,
): Promise<WoTables> {
    const ctx = inPageContext(db, await organizationToken());
    return await getInboxRows(ctx);
}

async function setupOneWorkOrder(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
    woId: string;
    tables: () => Promise<WoTables>;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test');
    const ctx = inPageContext(db, await organizationToken());
    await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
    const woId = generateIdentifier();
    await createWorkOrderFromFlow(ctx, {
        workOrderId: woId,
        flowLinkId: generateIdentifier(),
        flowId: 'ZOousbbnzpqlxJExVAruYQ',
    });
    const tables = () => collectTables(db);
    return { db, ctx, woId, tables };
}

const DEMO = 'XXZruirZyAOoRpNxaDnpSA';

function listsOf(
    workOrders: readonly WorkOrder[],
    claims: ReadonlyMap<string, { memberId: string; at: string }>,
    memberId: string,
): InboxLists {
    return buildInboxItems(
        workOrders, claims, memberId,
    );
}

function ids(
    items: readonly { id: string }[],
): string[] {
    return items.map(i => i.id);
}

// -- Tests ------------------------------------

Deno.test(
    'buildInboxItems returns three empty lists'
    + ' when there are no work orders',
    () => {
        const lists = buildInboxItems(
            [], new Map(), DEMO,
        );
        assertEquals(lists.available, []);
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test(
    'an unclaimed active work order is available',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, memberMap,
        } = await tables();
        const lists = listsOf(
            workOrders, new Map(), DEMO,
        );
        assertStrictEquals(
            lists.available.length, 1,
        );
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
        const item = lists.available[0]!;
        assert(item.kind === 'placed');
        assertStrictEquals(
            item.flowName, 'Test flow',
        );
        assertStrictEquals(
            item.stateName, 'Doing work',
        );
        assertStrictEquals(item.completed, false);
        assertNotStrictEquals(item.displayId, '');
        assertStrictEquals(
            typeof item.lastTransitionedAt,
            'string',
        );
        assertEquals(memberMap.size > 0, true);
    },
);

Deno.test(
    'this member\'s live claim is claimed',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        assertStrictEquals(
            t.activeClaimsByWo.size, 1,
        );
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), [woId]);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'another member\'s live claim is omitted',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const otherId = generateIdentifier();
        await seedHumanMember(
            db, otherId, 'Other Member',
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const other = inPageContext(
            db, await organizationToken(otherId),
        );
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(other, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'this member\'s archive transition is'
    + ' archived-by-me',
    async () => {
        const { ctx, woId, tables } =
            await setupOneWorkOrder();
        const read = await ctx.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId,
        );
        await ctx.POST(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId
            + '/transition', {
                transitionEventId: 'extra',
                targetState: N_FINISH,
                release: null,
                transitionAt:
                    '2030-01-01T00:00:00.000000Z',
            },
            [read],
        );
        const t = await tables();
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), [woId]);
        assert(lists.archivedByMe[0]!.kind === 'placed');
        assertStrictEquals(
            lists.archivedByMe[0]!.completed, true,
        );
    },
);

Deno.test(
    'another member\'s archive is omitted',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const otherId = generateIdentifier();
        await seedHumanMember(
            db, otherId, 'Other Member',
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const other = inPageContext(
            db, await organizationToken(otherId),
        );
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(other, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const read = await other.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId,
        );
        await other.POST(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId
            + '/transition', {
                transitionEventId: 'extra',
                targetState: N_FINISH,
                release: null,
                transitionAt:
                    '2030-01-01T00:00:00.000000Z',
            },
            [read],
        );
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'an unplaced unclaimed head is available',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const placed = t.workOrders.find(
            w => w.id === woId,
        )!;
        const unplaced = {
            ...placed,
            id: generateIdentifier(),
            displayId: 'unplaced-7',
            nodeId: generateIdentifier(),
            position: placed.position + 1,
            claim: { state: 'unclaimed' as const },
        };
        const lists = listsOf(
            [placed, unplaced],
            new Map(),
            DEMO,
        );
        assertEquals(
            lists.available.map(i => [i.id, i.kind]),
            [
                [placed.id, 'placed'],
                [unplaced.id, 'unplaced'],
            ],
        );
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test(
    'available sorts by transition.at ascending',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const first = generateIdentifier();
        const second = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: first,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: second,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assertEquals(ids(lists.available), [
            first, second,
        ]);
    },
);

Deno.test(
    'claimed sorts by position',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        for (let i = 0; i < 3; i++) {
            await createWorkOrderFromFlow(ctx, {
                workOrderId: generateIdentifier(),
                flowLinkId: generateIdentifier(),
                flowId: 'ZOousbbnzpqlxJExVAruYQ',
            });
        }
        const created = await getWorkOrders(ctx);
        const explicit = [7.5, 2.5, 5];
        for (let i = 0; i < created.length; i++) {
            await putWorkOrderPosition(
                ctx, created[i]!, explicit[i]!,
            );
        }
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(
            lists.claimed.map(i => i.position),
            [2.5, 5, 7.5],
        );
    },
);

Deno.test(
    'archived-by-me sorts by transition.at'
    + ' descending',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const older = generateIdentifier();
        const newer = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: older,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: newer,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        async function finish(
            id: string, at: string,
        ): Promise<void> {
            const read = await ctx.GET(
                'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/work-orders/' + id,
            );
            await ctx.POST(
                'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/work-orders/' + id
                + '/transition', {
                    transitionEventId: generateIdentifier(),
                    targetState: N_FINISH,
                    release: null,
                    transitionAt: at,
                },
                [read],
            );
        }
        await finish(
            older, '2030-01-01T00:00:00.000000Z',
        );
        await finish(
            newer, '2031-01-01T00:00:00.000000Z',
        );
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.archivedByMe), [
            newer, older,
        ]);
    },
);

Deno.test(
    'buildInboxItems carries the current'
    + " node's task instructions",
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', {
            nodes: [
                buildNode(N_START, 'Start', {
                    isCreate: true,
                }),
                buildNode(N_MIDDLE, 'Doing work', {
                    memberIds: [DEMO],
                    taskInstructions:
                        '# Verify totals',
                }),
                buildNode(N_FINISH, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    'YiJPbufDpkyrZcZCYbUJpg',
                    N_START, N_MIDDLE,
                ),
                buildEdge(E2, N_MIDDLE, N_FINISH),
            ],
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assert(lists.available[0]!.kind === 'placed');
        assertStrictEquals(
            lists.available[0]!.taskInstructions,
            '# Verify totals',
        );
    },
);

Deno.test(
    'buildInboxItems leaves taskInstructions'
    + ' empty when the node has none',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const t = await tables();
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assert(lists.available[0]!.kind === 'placed');
        assertStrictEquals(
            lists.available[0]!.taskInstructions, '',
        );
    },
);

Deno.test(
    'buildInboxItems keeps deriving after an'
    + ' edge delete and undo restore the graph',
    async () => {
        const { ctx, tables } =
            await setupOneWorkOrder();
        const graph = buildLinearGraph();
        await putFlow(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
            {
                name: 'Test flow',
                isLocked: false,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: graph.nodes,
                edges: graph.edges.filter(
                    e => e.id !== E2,
                ),
            },
        );
        const undoHead = await ctx.GET<unknown>(
            organizationItem(
                ctx, 'flows',
                'ZOousbbnzpqlxJExVAruYQ',
            ),
        );
        await ctx.POST(
            organizationItem(
                ctx, 'flows',
                'ZOousbbnzpqlxJExVAruYQ',
            ) + '/undo',
            {
                eventId: generateIdentifier(),
                at: nowUtc(),
            },
            [undoHead],
        );
        await createWorkOrderFromFlow(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await tables();
        assertStrictEquals(t.workOrders.length, 2);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assertStrictEquals(
            lists.available.length, 2,
        );
    },
);

Deno.test(
    'a former member\'s live claim is omitted'
    + ' and derivation does not throw (WB3)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const leaverId = generateIdentifier();
        await seedHumanMember(
            db, leaverId, 'Lisa Leaver',
        );
        const flowId = generateIdentifier();
        await seedFlow(db, flowId, {
            nodes: [
                buildNode(N_START, 'Start', {
                    isCreate: true,
                }),
                buildNode(N_MIDDLE, 'Doing work', {
                    memberIds: [leaverId],
                }),
                buildNode(N_FINISH, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(),
                    N_START, N_MIDDLE,
                ),
                buildEdge(E2, N_MIDDLE, N_FINISH),
            ],
        });
        const leaverCtx = inPageContext(
            db, await organizationToken(leaverId),
        );
        await createWorkOrderFromFlow(leaverCtx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId,
        });
        const admin = inPageContext(
            db, await organizationToken(),
        );
        const leaver = await getHumanMember(
            admin, leaverId,
        );
        assert(leaver !== null);
        await postMembershipRemoval(admin, leaver);
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(lists.available, []);
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test('the inbox reads heads only', async () => {
    const { db } = await setupOneWorkOrder();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await getInboxRows(ctx);
    assertEquals(
        sent.filter((request) =>
            /\/work-orders\/[^/]+\//.test(request.path)),
        [],
    );
});

Deno.test(
    'an inbox item names the head\'s node and'
    + ' last transition time',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const wo = t.workOrders.find(
            w => w.id === woId,
        )!;
        const lists = listsOf(
            [wo], t.activeClaimsByWo, DEMO,
        );
        const item = lists.claimed[0]!;
        const node = wo.flowGraph.nodes.find(
            n => n.id === wo.nodeId,
        )!;
        assert(item.kind === 'placed');
        assertStrictEquals(item.stateName, node.name);
        assertStrictEquals(
            item.lastTransitionedAt, wo.transition.at,
        );
    },
);

Deno.test(
    'a lapsed claim is available, not claimed',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const graph = buildLinearGraph();
        await putFlow(ctx, 'ZOousbbnzpqlxJExVAruYQ', {
            name: 'Test flow',
            isLocked: false,
            isAutoLayout: true,
            isAutoFit: true,
            lockTimeout: 0,
            nodes: graph.nodes,
            edges: graph.edges,
        });
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await getInboxRows(ctx);
        const wo = t.workOrders.find(
            w => w.id === woId,
        )!;
        assertStrictEquals(wo.claim.state, 'claimed');
        assertEquals(
            t.activeClaimsByWo.has(woId), false,
        );
        const lists = listsOf(
            [wo], t.activeClaimsByWo, DEMO,
        );
        assertEquals(ids(lists.available), [woId]);
        assertEquals(ids(lists.claimed), []);
    },
);

Deno.test(
    'an unplaced head renders as a degraded row'
    + ' and the inbox still renders',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const placed = t.workOrders.find(
            w => w.id === woId,
        )!;
        const unplaced = {
            ...placed,
            id: generateIdentifier(),
            displayId: 'unplaced-7',
            nodeId: generateIdentifier(),
            position: placed.position + 1,
            claim: { state: 'unclaimed' as const },
        };
        const lists = listsOf(
            [placed, unplaced],
            new Map(),
            DEMO,
        );
        const items = [
            ...lists.available,
            ...lists.claimed,
        ];
        let captured = '';
        const container = {
            set innerHTML(value: string) {
                captured = value;
            },
        };
        new WorkboxInboxPresenter(items, 'available')
            .renderList(
                container as unknown as HTMLElement,
            );
        const [, firstRow, secondRow] =
            captured.split('class="card p-4');
        assert(firstRow !== undefined);
        assert(secondRow !== undefined);
        const placedRow = firstRow.includes(
            'data-work-order-card="' + placed.id + '"',
        ) ? firstRow : secondRow;
        const unplacedRow = placedRow === firstRow
            ? secondRow : firstRow;
        for (const present of [
            'data-work-order-card="' + placed.id + '"',
            'href=', 'cursor-pointer',
            'Doing work',
        ]) {
            assertStringIncludes(placedRow, present);
        }
        for (const present of [
            'class="badge badge-warning"',
            'State unknown', 'Test flow',
            '#unplaced-7',
        ]) {
            assertStringIncludes(unplacedRow, present);
        }
        for (const absent of [
            'data-work-order-card', 'href=',
            'cursor-pointer',
        ]) {
            assertEquals(
                unplacedRow.includes(absent),
                false, absent,
            );
        }
    },
);
