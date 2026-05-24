import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postWorkOrderCreation,
} from
'../web-app/app/adapters/work-orders-mutations.ts';
import {
    getWorkerMap,
    generateCryptoSafeBase62,
    getTransitionEventsByWorkOrder,
    getWorkOrderActiveClaim,
    validateWorkOrderFlowGraph,
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
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    HumanWorkerEntity,
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
    WorkOrderEntity,
    Worker,
    WorkerId,
    Id,
} from '../api/types.ts';

// -- Fixtures ---------------------------------

function buildHumanWorker(
    name: string,
): Omit<HumanWorkerEntity, 'id'> {
    return {
        first_name: name,
        last_name: 'Test',
        email: name.toLowerCase() + '@example.com',
        phone: '',
        title: 'product_manager',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        bio: '',
        department: 'Product',
    };
}

async function seedWorkerState(
    db: MemoryDbAdapter,
    workerId: WorkerId,
): Promise<void> {
    await db.states.record(
        `st-${workerId}`,
        workerId,
        'active',
        'system',
    );
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
        attributes: [],
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
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
    };
}

function buildLinearGraph(): StoredGraph {
    // n-middle carries one worker so the flow
    // passes the publish gate (zero-worker nodes
    // would mark the flow Not Ready).
    return {
        nodes: [
            buildNode('n-start', 'Start', {
                isCreate: true,
            }),
            buildNode('n-middle', 'Doing work', {
                workerIds: ['current'],
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

interface WoTables {
    workOrders: WorkOrderEntity[];
    transitionsByWo:
        Map<Id, readonly TransitionEvent[]>;
    activeClaimsByWo: Map<Id, ActiveClaim>;
    workerMap: Map<WorkerId, Worker>;
}

async function collectTables(
    db: MemoryDbAdapter,
): Promise<WoTables> {
    const ctx = createRequestContext(db);
    const workOrders = await db.workOrders.getAll();
    const transitionsByWo =
        await getTransitionEventsByWorkOrder(ctx);
    const activeClaimsByWo =
        new Map<Id, ActiveClaim>();
    for (const wo of workOrders) {
        const fg = validateWorkOrderFlowGraph(
            wo.flow_graph,
        );
        const claim = await getWorkOrderActiveClaim(
            ctx, wo.id, fg.lockTimeout,
        );
        if (claim !== null) {
            activeClaimsByWo.set(wo.id, claim);
        }
    }
    return {
        workOrders,
        transitionsByWo,
        activeClaimsByWo,
        workerMap: await getWorkerMap(ctx),
    };
}

async function setupOneWorkOrder(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
    woId: string;
    tables: () => Promise<WoTables>;
}> {
    const db = new MemoryDbAdapter();
    await db.workers.put(
        'current', buildHumanWorker('Demo'),
    );
    await seedWorkerState(db, 'current');
    const ctx = createRequestContext(db);
    await db.flows.put(
        'f1', buildFlow(buildLinearGraph()),
    );
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
            workOrders, transitionsByWo, workerMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), workerMap, 'active',
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
            workOrders, transitionsByWo, workerMap,
        } = await tables();
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), workerMap, 'archived',
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
            activeClaimsByWo, workerMap,
        } = await tables();
        // postWorkOrderCreation already minted a
        // fresh claim event, so it is active.
        assert.equal(activeClaimsByWo.size, 1);
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            activeClaimsByWo, workerMap, 'active',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems shows a finished work order'
    + ' in archived mode and hides it from active',
    async () => {
        const { db, woId, tables } =
            await setupOneWorkOrder();
        // Hand-stitch a state event on the
        // complete node, dated after the others.
        await db.states.put('extra', {
            entity_id: woId,
            state: 'n-finish',
            worker_id: 'current',
            at: '2030-01-01T00:00:00.000Z',
        });
        const {
            workOrders, transitionsByWo, workerMap,
        } = await tables();
        assert.deepEqual(
            buildInboxItems(
                workOrders, transitionsByWo,
                new Map(), workerMap, 'active',
            ),
            [],
        );
        const archived = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), workerMap, 'archived',
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
        const db = new MemoryDbAdapter();
        await db.workers.put(
            'current', buildHumanWorker('Demo'),
        );
        await seedWorkerState(db, 'current');
        const ctx = createRequestContext(db);
        await db.flows.put(
            'f1', buildFlow(buildLinearGraph()),
        );
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
        const created = await db.workOrders.getAll();
        const explicit = [7.5, 2.5, 5];
        for (let i = 0; i < created.length; i++) {
            await db.workOrders.put(created[i]!.id, {
                ...created[i]!,
                position: explicit[i]!,
            });
        }
        const tables = await collectTables(db);
        const items = buildInboxItems(
            tables.workOrders,
            tables.transitionsByWo,
            new Map(),
            tables.workerMap,
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
        const { workOrders, workerMap } =
            await tables();
        assert.throws(
            () => buildInboxItems(
                workOrders, new Map(),
                new Map(), workerMap, 'active',
            ),
            /no transitions/,
        );
    },
);
