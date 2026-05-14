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
} from '../web-app/app/adapters/index.ts';
import {
    buildInboxItems,
} from
'../web-app/app/presenters/workbox-inbox.ts';
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
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    Worker,
    WorkerId,
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
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: jsonObjectField(
            graph as unknown as Record<
                string, unknown
            >,
        ),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
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
    transitions: WorkOrderTransitionEntity[];
    claims: WorkOrderClaimEntity[];
    workerMap: Map<WorkerId, Worker>;
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
    const ctx = createRequestContext(db);
    await db.flows.put(
        'f1', buildFlow(buildLinearGraph()),
    );
    const woId = generateCryptoSafeBase62();
    await postWorkOrderCreation(ctx, {
        workOrderId: woId,
        flowLinkId: generateCryptoSafeBase62(),
        initTransitionId:
            generateCryptoSafeBase62(),
        postStartTransitionId:
            generateCryptoSafeBase62(),
        claimId: generateCryptoSafeBase62(),
        flowId: 'f1',
    });
    const tables = async (): Promise<WoTables> => {
        const fresh = createRequestContext(db);
        return {
            workOrders: await db.workOrders
                .getAll(),
            transitions: await db
                .workOrderTransitions.getAll(),
            claims: await db.workOrderClaims
                .getAll(),
            workerMap: await getWorkerMap(fresh),
        };
    };
    return { db, ctx, woId, tables };
}

// -- Tests ------------------------------------

test(
    'buildInboxItems returns an empty array in'
    + ' active mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], [], [], new Map(), 'active',
        );
        assert.deepEqual(items, []);
    },
);

test(
    'buildInboxItems returns an empty array in'
    + ' archived mode with no work orders',
    () => {
        const items = buildInboxItems(
            [], [], [], new Map(), 'archived',
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
        const { workOrders, transitions } =
            await tables();
        const { workerMap } = await tables();
        const items = buildInboxItems(
            workOrders, transitions, [],
            workerMap, 'active',
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
        const { workOrders, transitions } =
            await tables();
        const { workerMap } = await tables();
        const items = buildInboxItems(
            workOrders, transitions, [],
            workerMap, 'archived',
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
            workOrders, transitions, claims,
            workerMap,
        } = await tables();
        // postWorkOrderCreation already minted a
        // fresh claim, so it is active.
        assert.equal(claims.length, 1);
        const items = buildInboxItems(
            workOrders, transitions, claims,
            workerMap, 'active',
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
        // Hand-stitch a transition onto the
        // complete node, dated after the others.
        await db.workOrderTransitions.put(
            'extra', {
                work_order_id: woId,
                from_node_id: 'n-middle',
                to_node_id: 'n-finish',
                person_id: 'current',
                transitioned_at:
                    '2030-01-01T00:00:00.000Z',
            },
        );
        const {
            workOrders, transitions, workerMap,
        } = await tables();
        assert.deepEqual(
            buildInboxItems(
                workOrders, transitions, [],
                workerMap, 'active',
            ),
            [],
        );
        const archived = buildInboxItems(
            workOrders, transitions, [],
            workerMap, 'archived',
        );
        assert.equal(archived.length, 1);
        assert.equal(archived[0]!.completed, true);
    },
);

test(
    'buildInboxItems sorts items by work-order'
    + ' position',
    async () => {
        const db = new MemoryDbAdapter();
        await db.workers.put(
            'current', buildHumanWorker('Demo'),
        );
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
                initTransitionId:
                    generateCryptoSafeBase62(),
                postStartTransitionId:
                    generateCryptoSafeBase62(),
                claimId:
                    generateCryptoSafeBase62(),
                flowId: 'f1',
            });
        }
        const items = buildInboxItems(
            await db.workOrders.getAll(),
            await db.workOrderTransitions.getAll(),
            [],
            await getWorkerMap(
                createRequestContext(db),
            ),
            'active',
        );
        assert.equal(items.length, 3);
        const positions =
            items.map(i => i.position);
        assert.deepEqual(
            positions,
            [...positions].toSorted(
                (a, b) => a - b,
            ),
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
                workOrders, [], [],
                workerMap, 'active',
            ),
            /no transitions/,
        );
    },
);
