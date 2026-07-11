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
import { devToken } from './token-fixtures.ts';
import {
    postWorkOrderCreation,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    postFlowCreation,
    putFlow,
} from
'../web-app/app/adapters/flow-mutations.ts';
import {
    getMemberMap,
    generateCryptoSafeBase62,
    getTransitionEventsByWorkOrder,
    getWorkOrder,
    getWorkOrderActiveClaim,
    getWorkOrders,
    putWorkOrder,
    type WorkOrder,
} from '../web-app/app/adapters/index.ts';
import {
    buildInboxItems,
    type ActiveClaim,
} from
'../web-app/app/presenters/workbox-inbox.ts';
import type {
    TransitionEvent,
} from '../web-app/app/adapters/state-events.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    GraphNode,
    GraphEdge,
    StoredGraph,
    Member,
    MemberId,
    Id,
} from '../api/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

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
            buildNode('n-start', 'Start', {
                isCreate: true,
            }),
            buildNode('n-middle', 'Doing work', {
                memberIds: ['current'],
            }),
            buildNode('n-finish', 'Done', {
                isArchive: true,
            }),
        ],
        edges: [
            buildEdge('e1', 'n-start', 'n-middle'),
            buildEdge('e2', 'n-middle', 'n-finish'),
        ],
    };
}

// Seed a flow through the SAME gate-driven create/document-PUT
// idiom the live route uses (postFlowCreation + putFlow), so a
// message pair exists at this flow's address — required for the
// flipped GET flows/:id route (Phase 4 Task 8), which
// postWorkOrderCreation reads before creating (this file's own
// comment names that freeze dependency), to derive it.
// postFlowCreation seeds a default start/complete graph; the
// immediate putFlow overwrites it with the caller's own graph.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = createRequestContext(db, await devToken());
    await postFlowCreation(ctx, {
        flowId,
        linkId: flowId + '-link',
        projectId: 'p-' + flowId,
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

interface WoTables {
    workOrders: WorkOrder[];
    transitionsByWo:
        Map<Id, readonly TransitionEvent[]>;
    activeClaimsByWo: Map<Id, ActiveClaim>;
    memberMap: Map<MemberId, Member>;
}

async function collectTables(
    db: MemoryDbAdapter,
): Promise<WoTables> {
    const ctx = createRequestContext(db, await devToken());
    const workOrders = await getWorkOrders(ctx);
    const transitionsByWo =
        await getTransitionEventsByWorkOrder(ctx);
    const activeClaimsByWo =
        new Map<Id, ActiveClaim>();
    for (const wo of workOrders) {
        const claim = await getWorkOrderActiveClaim(
            ctx, wo.id, wo.flowGraph.lockTimeout,
        );
        if (claim !== null) {
            activeClaimsByWo.set(wo.id, claim);
        }
    }
    return {
        workOrders,
        transitionsByWo,
        activeClaimsByWo,
        memberMap: await getMemberMap(ctx),
    };
}

async function setupOneWorkOrder(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
    woId: string;
    tables: () => Promise<WoTables>;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'current', 'Demo Test');
    const ctx = createRequestContext(db, await devToken());
    await seedFlow(db, 'f1', buildLinearGraph());
    const woId = generateCryptoSafeBase62();
    await postWorkOrderCreation(ctx, {
        workOrderId: woId,
        flowLinkId: generateCryptoSafeBase62(),
        flowId: 'f1',
    });
    const tables = () => collectTables(db);
    return { db, ctx, woId, tables };
}

// -- Tests ------------------------------------

test(
    'buildInboxItems returns an empty array in'
    + ' active mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], new Map(), new Map(),
            new Map(), 'active',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems returns an empty array in'
    + ' archived mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], new Map(), new Map(),
            new Map(), 'archived',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems surfaces an unclaimed,'
    + ' in-progress work order as an active item',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, transitionsByWo, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'active',
        );
        assert.equal(items.length, 1);
        const item = items[0]!;
        assert.equal(item.flowName, 'Test flow');
        assert.equal(item.stateName, 'Doing work');
        assert.equal(item.completed, false);
        assert.equal(
            typeof item.displayId, 'string',
        );
        assert.notEqual(item.displayId, '');
        assert.equal(
            item.transitionerName, 'Demo Test',
        );
        assert.equal(
            typeof item.lastTransitionedAt,
            'string',
        );
    },
);

test(
    'buildInboxItems excludes an in-progress'
    + ' work order from archived mode',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, transitionsByWo, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'archived',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems hides a work order with an'
    + ' active claim that is not yet finished',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, transitionsByWo,
            activeClaimsByWo, memberMap,
        } = await tables();
        // postWorkOrderCreation already minted a
        // fresh claim event, so it is active.
        assert.equal(activeClaimsByWo.size, 1);
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            activeClaimsByWo, memberMap, 'active',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems shows a finished work order'
    + ' in archived mode and hides it from active',
    async () => {
        const { ctx, woId, tables } =
            await setupOneWorkOrder();
        // Hand-stitch a transition onto the complete node
        // via the named op (states/:id retired). Dated after
        // the create events so the inbox sees a finished WO.
        await ctx.POST(
            'work-orders/' + woId + '/transition', {
                transitionEventId: 'extra',
                targetState: 'n-finish',
                fieldValues: [],
                release: null,
                transitionAt: '2030-01-01T00:00:00.000000Z',
            },
        );
        const {
            workOrders, transitionsByWo, memberMap,
        } = await tables();
        assert.deepEqual(
            buildInboxItems(
                workOrders, transitionsByWo,
                new Map(), memberMap, 'active',
            ),
            [],
        );
        const archived = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'archived',
        );
        assert.equal(archived.length, 1);
        assert.equal(archived[0]!.completed, true);
    },
);

test(
    'buildInboxItems sorts items by work-order'
    + ' position with non-monotonic fractional'
    + ' values',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Demo Test',
        );
        const ctx = createRequestContext(db, await devToken());
        await seedFlow(db, 'f1', buildLinearGraph());
        for (let i = 0; i < 3; i++) {
            await postWorkOrderCreation(ctx, {
                workOrderId:
                    generateCryptoSafeBase62(),
                flowLinkId:
                    generateCryptoSafeBase62(),
                flowId: 'f1',
            });
        }
        // Mutate to explicit non-creation-order
        // fractional positions so the assertion
        // catches any caller that removes the sort.
        // NAMED re-pin (Task 7): putWorkOrder is the wire
        // PUT — it takes the DOMAIN shape ({displayId,
        // flowGraph, position} with flowGraph PARSED), not
        // the raw snake_case row, so the domain object is
        // fetched first (getWorkOrder) and only its position
        // is patched.
        // Phase Final Task 2: ids from pair-plane list.
        const created = await getWorkOrders(ctx);
        const explicit = [7.5, 2.5, 5];
        for (let i = 0; i < created.length; i++) {
            const id = created[i]!.id;
            const workOrder = await getWorkOrder(ctx, id);
            await putWorkOrder(ctx, id, {
                ...workOrder,
                position: explicit[i]!,
            });
        }
        const tables = await collectTables(db);
        const items = buildInboxItems(
            tables.workOrders,
            tables.transitionsByWo,
            new Map(),
            tables.memberMap,
            'active',
        );
        assert.deepEqual(
            items.map(i => i.position),
            [2.5, 5, 7.5],
        );
    },
);

test(
    'buildInboxItems throws when a work order'
    + ' has no transitions',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const { workOrders, memberMap } =
            await tables();
        assert.throws(
            () => buildInboxItems(
                workOrders, new Map(),
                new Map(), memberMap, 'active',
            ),
            /no transitions/,
        );
    },
);

test(
    'buildInboxItems carries the current'
    + " node's task instructions",
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Demo Test',
        );
        const ctx = createRequestContext(db, await devToken());
        await seedFlow(db, 'f1', {
            nodes: [
                buildNode('n-start', 'Start', {
                    isCreate: true,
                }),
                buildNode(
                    'n-middle', 'Doing work', {
                        memberIds: ['current'],
                        taskInstructions:
                            '# Verify totals',
                    },
                ),
                buildNode('n-finish', 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    'e1', 'n-start', 'n-middle',
                ),
                buildEdge(
                    'e2', 'n-middle', 'n-finish',
                ),
            ],
        });
        await postWorkOrderCreation(ctx, {
            workOrderId:
                generateCryptoSafeBase62(),
            flowLinkId:
                generateCryptoSafeBase62(),
            flowId: 'f1',
        });
        const {
            workOrders, transitionsByWo, memberMap,
        } = await collectTables(db);
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'active',
        );
        assert.equal(
            items[0]!.taskInstructions,
            '# Verify totals',
        );
    },
);

test(
    'buildInboxItems leaves taskInstructions'
    + ' empty when the node has none',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, transitionsByWo, memberMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'active',
        );
        assert.equal(
            items[0]!.taskInstructions, '',
        );
    },
);
