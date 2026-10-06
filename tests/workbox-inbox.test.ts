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
} from '../client/index.ts';
import {
    buildInboxItems,
    WorkboxInboxPresenter,
} from
'../web-app/app/presenters/workbox-inbox.ts';
import {
    getInboxRows,
    type InboxRows,
} from '../web-app/app/workbox-inbox-rows.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    FORMER_MEMBER_NAME,
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

// -- Tests ------------------------------------

Deno.test(
    'buildInboxItems returns an empty array in'
    + ' active mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], new Map(), new Map(), 'active',
        );
        assertEquals(items, []);
    },
);

Deno.test(
    'buildInboxItems returns an empty array in'
    + ' archived mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], new Map(), new Map(), 'archived',
        );
        assertEquals(items, []);
    },
);

Deno.test(
    'buildInboxItems surfaces an unclaimed,'
    + ' in-progress work order as an active item',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, new Map(), memberMap, 'active',
        );
        assertStrictEquals(items.length, 1);
        const item = items[0]!;
        assert(item.kind === 'placed');
        assertStrictEquals(item.flowName, 'Test flow');
        assertStrictEquals(item.stateName, 'Doing work');
        assertStrictEquals(item.completed, false);
        assertStrictEquals(
            typeof item.displayId, 'string',
        );
        assertNotStrictEquals(item.displayId, '');
        assertStrictEquals(
            item.transitionerName,
            'Demo Test',
        );
        assertStrictEquals(
            typeof item.lastTransitionedAt,
            'string',
        );
        assertStrictEquals(item.claimedByName, null);
    },
);

Deno.test(
    'buildInboxItems excludes an in-progress'
    + ' work order from archived mode',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, new Map(), memberMap, 'archived',
        );
        assertEquals(items, []);
    },
);

Deno.test(
    'buildInboxItems surfaces a claimed,'
    + ' unfinished work order as an active item'
    + ' naming its claimant',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders,
            activeClaimsByWo, memberMap,
        } = await tables();
        // postWorkOrderCreation already minted a
        // fresh claim event, so it is active.
        assertStrictEquals(activeClaimsByWo.size, 1);
        const items = buildInboxItems(
            workOrders, activeClaimsByWo, memberMap, 'active',
        );
        assertStrictEquals(items.length, 1);
        assertStrictEquals(
            items[0]!.claimedByName, 'Demo Test',
        );
    },
);

Deno.test(
    'buildInboxItems shows a finished work order'
    + ' in archived mode and hides it from active',
    async () => {
        const { ctx, woId, tables } =
            await setupOneWorkOrder();
        // Hand-stitch a transition onto the complete node
        // via the named op (states/:id retired). Dated after
        // the create events so the inbox sees a finished WO.
        const read = await ctx.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId,
        );
        await ctx.POST(
            'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
                + '/transition', {
                transitionEventId: 'extra',
                targetState: N_FINISH,
                release: null,
                transitionAt: '2030-01-01T00:00:00.000000Z',
            },
            [read],
        );
        const {
            workOrders, memberMap,
        } = await tables();
        assertEquals(
            buildInboxItems(
                workOrders, new Map(), memberMap, 'active',
            ),
            [],
        );
        const archived = buildInboxItems(
            workOrders, new Map(), memberMap, 'archived',
        );
        assertStrictEquals(archived.length, 1);
        assert(archived[0]!.kind === 'placed');
        assertStrictEquals(archived[0]!.completed, true);
    },
);

Deno.test(
    'buildInboxItems sorts items by work-order'
    + ' position with non-monotonic fractional'
    + ' values',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const ctx = inPageContext(db, await organizationToken());
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
        for (let i = 0; i < 3; i++) {
            await createWorkOrderFromFlow(ctx, {
                workOrderId:
                    generateIdentifier(),
                flowLinkId:
                    generateIdentifier(),
                flowId: 'ZOousbbnzpqlxJExVAruYQ',
            });
        }
        // Mutate to explicit non-creation-order
        // fractional positions so the assertion
        // catches any caller that removes the sort.
        // Phase Final Task 2: ids from message-plane list.
        const created = await getWorkOrders(ctx);
        const explicit = [7.5, 2.5, 5];
        for (let i = 0; i < created.length; i++) {
            await putWorkOrderPosition(
                ctx, created[i]!, explicit[i]!,
            );
        }
        const tables = await collectTables(db);
        const items = buildInboxItems(
            tables.workOrders,
            new Map(),
            tables.memberMap,
            'active',
        );
        assertEquals(
            items.map(i => i.position),
            [2.5, 5, 7.5],
        );
    },
);

Deno.test(
    'buildInboxItems carries the current'
    + " node's task instructions",
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const ctx = inPageContext(db, await organizationToken());
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', {
            nodes: [
                buildNode(N_START, 'Start', {
                    isCreate: true,
                }),
                buildNode(
                    N_MIDDLE, 'Doing work', {
                        memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
                        taskInstructions:
                            '# Verify totals',
                    },
                ),
                buildNode(N_FINISH, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    'YiJPbufDpkyrZcZCYbUJpg', N_START, N_MIDDLE,
                ),
                buildEdge(
                    E2, N_MIDDLE, N_FINISH,
                ),
            ],
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId:
                generateIdentifier(),
            flowLinkId:
                generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const {
            workOrders, memberMap,
        } = await collectTables(db);
        const items = buildInboxItems(
            workOrders, new Map(), memberMap, 'active',
        );
        assert(items[0]!.kind === 'placed');
        assertStrictEquals(
            items[0]!.taskInstructions,
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
        const {
            workOrders, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, new Map(), memberMap, 'active',
        );
        assert(items[0]!.kind === 'placed');
        assertStrictEquals(
            items[0]!.taskInstructions, '',
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
        // Delete the N_MIDDLE -> N_FINISH edge
        // the way the designer toolbar does: a
        // putFlow whose graph omits it.
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
        // Undo the way performUndo does: the
        // named POST flows/:id/undo replay (the
        // server restores the prior body's graph
        // verbatim, same edge id).
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
        // A work order born AFTER the restore —
        // WB5a's most damning witness.
        await createWorkOrderFromFlow(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const {
            workOrders, memberMap,
        } = await tables();
        assertStrictEquals(workOrders.length, 2);
        // Claims ignored: the graph-derivation
        // path alone. Both work orders derive.
        const items = buildInboxItems(
            workOrders, new Map(), memberMap, 'active',
        );
        assertStrictEquals(items.length, 2);
    },
);

// WB3: a work order's transitioner and claimant are names
// resolved through the member map. A member who created a
// work order and then left must read as a former member,
// never take the Archive tab down as an unknown id.
Deno.test(
    'buildInboxItems names a creator who left'
    + ' Former member (WB3)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
        );
        const leaverId = generateIdentifier();
        await seedHumanMember(db, leaverId, 'Lisa Leaver');
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
                    generateIdentifier(), N_START, N_MIDDLE,
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
        const {
            workOrders,
            activeClaimsByWo, memberMap,
        } = await collectTables(db);
        const items = buildInboxItems(
            workOrders, activeClaimsByWo, memberMap, 'active',
        );
        assertStrictEquals(items.length, 1);
        assertStrictEquals(
            items[0]!.transitionerName, FORMER_MEMBER_NAME,
        );
        assertStrictEquals(
            items[0]!.claimedByName, FORMER_MEMBER_NAME,
        );
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

Deno.test('an inbox item names the head\'s node and last'
+ ' mover', async () => {
    const { tables, woId } = await setupOneWorkOrder();
    const t = await tables();
    const wo = t.workOrders.find((w) => w.id === woId)!;
    const [item] = buildInboxItems(
        [wo], t.activeClaimsByWo, t.memberMap, 'active',
    );
    const node = wo.flowGraph.nodes.find(
        (n) => n.id === wo.nodeId,
    )!;
    assert(item!.kind === 'placed');
    assertStrictEquals(item!.stateName, node.name);
    assertStrictEquals(
        item!.lastTransitionedAt, wo.transition.at,
    );
});

// A zero lockTimeout lapses the birth claim at once: the head
// stores it, and the page's clock judges it not active.
Deno.test('a lapsed claim is not an active claim in the'
+ ' inbox', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
    );
    const ctx = inPageContext(db, await organizationToken());
    await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph());
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
    const wo = t.workOrders.find((w) => w.id === woId)!;
    assertStrictEquals(wo.claim.state, 'claimed');
    assertEquals(t.activeClaimsByWo.has(woId), false);
    const [item] = buildInboxItems(
        [wo], t.activeClaimsByWo, t.memberMap, 'active',
    );
    assertStrictEquals(item!.claimedByName, null);
});

// A head whose node is gone from its flow graph cannot be
// placed. Its row degrades in place, static, so the rest of
// the inbox still renders and nothing navigates or drags it.
Deno.test('an unplaced head renders as a degraded row and'
+ ' the inbox still renders', async () => {
    const { tables, woId } = await setupOneWorkOrder();
    const t = await tables();
    const placed = t.workOrders.find((w) => w.id === woId)!;
    const unplaced = {
        ...placed,
        id: generateIdentifier(),
        displayId: 'unplaced-7',
        nodeId: generateIdentifier(),
        position: placed.position + 1,
    };
    const items = buildInboxItems(
        [placed, unplaced], t.activeClaimsByWo, t.memberMap,
        'active',
    );
    assertEquals(
        items.map((i) => [i.id, i.kind]),
        [[placed.id, 'placed'], [unplaced.id, 'unplaced']],
    );
    assertEquals(
        buildInboxItems(
            [unplaced], t.activeClaimsByWo, t.memberMap,
            'archived',
        ),
        [],
    );
    let captured = '';
    const container = {
        set innerHTML(value: string) {
            captured = value;
        },
    };
    new WorkboxInboxPresenter(items, true).renderList(
        container as unknown as HTMLElement,
    );
    const [, placedRow, unplacedRow] =
        captured.split('class="card p-4');
    assert(placedRow !== undefined);
    assert(unplacedRow !== undefined);
    for (const present of [
        'data-work-order-card="' + placed.id + '"',
        'href=', 'drag-handle', 'cursor-pointer',
        'Doing work',
    ]) {
        assertStringIncludes(placedRow, present);
    }
    for (const present of [
        'class="badge badge-warning"',
        'State unknown', 'Test flow', '#unplaced-7',
        'from Demo Test',
    ]) {
        assertStringIncludes(unplacedRow, present);
    }
    for (const absent of [
        'data-work-order-card', 'href=', 'drag-handle',
        'cursor-pointer',
    ]) {
        assertEquals(
            unplacedRow.includes(absent), false, absent,
        );
    }
});
