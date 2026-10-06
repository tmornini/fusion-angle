import { assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
} from '../shared/types.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';
import { apiRequest } from './http-fixtures.ts';

// A work order's history is its versions (ARCHITECTURE.md
// § Do not resurrect): `…/history` is not a route, so the
// router answers 404 whatever the work order holds.

const NODE_START = generateIdentifier();
const NODE_MIDDLE = generateIdentifier();
const NODE_FINISH = generateIdentifier();
const FLOW_ID = generateIdentifier();
const EDGE_2 = generateIdentifier();

function req(
    method: string,
    path: string,
    token?: string,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
    });
}

function flowGraph(): Record<string, unknown> {
    const graph: WorkOrderFlowGraph = {
        name: 'History fixture flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: NODE_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: NODE_MIDDLE, name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: NODE_FINISH, name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
                fromNodeId: NODE_START, toNodeId: NODE_MIDDLE,
            },
            {
                id: EDGE_2, name: '',
                fromNodeId: NODE_MIDDLE, toNodeId: NODE_FINISH,
            },
        ],
    };
    return graph as unknown as Record<string, unknown>;
}

Deno.test('a work order\'s /history is a router 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = DEV_TOKEN;
    const id = generateIdentifier();
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: {
            display_id: 'WO-H',
            flow_graph: flowGraph(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [NODE_START, NODE_MIDDLE], at: nowUtc(),
        token, claim: 'kept',
    });
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + id + '/history',
        token,
    }));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
});

// Bulk GET work-orders/history is deleted.

Deno.test(
    'an unknown work-order id under /work-orders/ is 404,'
    + ' with and without a stored work order',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg',
            id: generateIdentifier(),
            fields: {
                display_id: 'WO-H',
                flow_graph: flowGraph(),
                position: 1,
            },
            flowId: FLOW_ID,
            births: [NODE_START, NODE_MIDDLE], at: nowUtc(),
            token: DEV_TOKEN, claim: 'kept',
        });
        const collection = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + generateIdentifier(),
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(collection.status, 404);

        const emptyDb = memoryDbAdapter();
        await seedAdminSchema(emptyDb);
        const empty = await handleRequest(
            emptyDb,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + generateIdentifier(),
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(empty.status, 404);
    },
);
