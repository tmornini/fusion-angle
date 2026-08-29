import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
} from '../api/types.ts';
import {
    ORGANIZATION_TWO,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { buildWorkOrders } from
    '../api/mock-data/work-orders.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// GET organizations/:id/work-orders/:id/history — Phase A1 of states-URI
// elimination. Lifecycle events DESC (index 0 = current),
// with transition field_values folded inline; claim/birth/
// release rows carry []. Miss posture: empty lifecycle →
// missedReadError → 404 miss at this address / 404 absent.

const WORK_ORDER_ID = generateIdentifier();
const NODE_START = generateIdentifier();
const NODE_MIDDLE = generateIdentifier();
const NODE_FINISH = generateIdentifier();
const FLOW_ID = generateIdentifier();
const EDGE_2 = generateIdentifier();
const ATTR_SEVERITY = generateIdentifier();
const FIELD_VALUE_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();
const FWO_ID = generateIdentifier();
const EV_1 = generateIdentifier();
const EV_2 = generateIdentifier();
const EV_3 = generateIdentifier();

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        operationId: TEST_OPERATION_ID,
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

function createBody() {
    // Birth ats must precede later claim/transition/release
    // pair envelopes (nowUtc at write time) so applyReleasePair
    // still sees a live prior claim.
    const t0 = nowUtc();
    const t1 = nowUtc();
    const t2 = nowUtc();
    return {
        id: WORK_ORDER_ID,
        workOrder: {
            display_id: 'hist-1',
            flow_graph: flowGraph(),
            position: 1,
        },
        flowWorkOrderId: FWO_ID,
        flowWorkOrder: {
            flow_id: FLOW_ID,
            work_order_id: WORK_ORDER_ID,
            at: nowUtc(),
        },
        stateEventIds: [EV_1, EV_2, EV_3],
        states: [NODE_START, NODE_MIDDLE, 'claimed'],
        stateEventAts: [t0, t1, t2],
    };
}

interface HistoryFieldValue {
    id: string;
    attribute_id: string;
    value: string;
}

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
    field_values: HistoryFieldValue[];
}

async function seededChainDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);

    const created = await handleRequest(
        db,
        req('POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN, createBody()),
    );
    assert.equal(created.status, 201);

    // Task 8 CUT: legacy fieldValues fold is below-gate
    // stored-data seed (live wire rejects the key).
    const transitionBody: Record<string, unknown> = {
        transitionEventId: TRANSITION_EVENT_ID,
        targetState: NODE_MIDDLE,
        fieldValues: [
            {
                id: FIELD_VALUE_ID,
                fields: {
                    state_event_id:
                        TRANSITION_EVENT_ID,
                    attribute_id: ATTR_SEVERITY,
                    value: 'high',
                },
            },
        ],
        release: null,
        transitionAt: nowUtc(),
    };
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', WORK_ORDER_ID, 'transition',
    ];
    const pattern = 'organizations/:id/work-orders/:id/transition';
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: pattern,
        routeSegments: pattern.split('/'),
        pathSegments,
        headerFields: [],
        body: transitionBody,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: nowUtc(),
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, WORK_ORDER_ID, transitionBody,
        'XXZruirZyAOoRpNxaDnpSA', undefined, [], messagePair,
    );

    const release = await handleRequest(
        db,
        req(
            'DELETE',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + WORK_ORDER_ID + '/claim',
            DEV_TOKEN,
        ),
    );
    assert.equal(release.status, 204);

    return db;
}

test(
    'GET organizations/:id/work-orders/:id/history returns 200 DESC rows;'
    + ' row[0] is current; transition carries field_values;'
    + ' claim rows carry []',
    async () => {
        const db = await seededChainDb();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + WORK_ORDER_ID + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];

        // birth(3) + transition(1) + release(1) = 5.
        assert.equal(rows.length, 5);

        // DESC: index 0 is the latest event (release).
        assert.equal(rows[0]!.state, 'claim_released');
        assert.deepEqual(rows[0]!.field_values, []);

        // Earliest birth is last.
        assert.equal(rows[4]!.id, EV_1);
        assert.equal(rows[4]!.state, NODE_START);

        // Transition row carries folded field values.
        const transition = rows.find(
            (row) => row.id === TRANSITION_EVENT_ID,
        );
        assert.ok(transition !== undefined);
        assert.equal(transition!.state, NODE_MIDDLE);
        assert.deepEqual(transition!.field_values, [
            {
                id: FIELD_VALUE_ID,
                attribute_id: ATTR_SEVERITY,
                value: 'high',
            },
        ]);

        // Birth claim row carries [] (no transition fold).
        const claimed = rows.find(
            (row) => row.id === EV_3,
        );
        assert.ok(claimed !== undefined);
        assert.equal(claimed!.state, 'claimed');
        assert.deepEqual(claimed!.field_values, []);

        // Every row names this work order.
        for (const row of rows) {
            assert.equal(row.entity_id, WORK_ORDER_ID);
            assert.equal(row.member_id, 'XXZruirZyAOoRpNxaDnpSA');
            assert.ok(Array.isArray(row.field_values));
        }

        // Strict DESC on (at, id).
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1]!;
            const cur = rows[i]!;
            const ordered =
                prev.at > cur.at
                || (prev.at === cur.at && prev.id > cur.id);
            assert.ok(
                ordered,
                'history must be (at, id) DESC',
            );
        }
    },
);

test(
    'foreign work order history → 404 at this address',
    async () => {
        const db = await seededMockDb();
        const foreignId = buildWorkOrders()[0]!.id;
        const tokenTwo = await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
        );
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/work-orders/' + foreignId + '/history',
                tokenTwo,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: work_orders/' + foreignId,
        );
    },
);

test(
    'absent work order history → 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const missingId = 'oYnbiWXzroVnyolOhmkBIQ';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + missingId + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: work_orders/' + missingId,
        );
    },
);

test(
    'unauthenticated work order history → 401',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + WORK_ORDER_ID + '/history',
            ),
        );
        assert.equal(res.status, 401);
        const body = await res.json() as { error: string };
        assert.equal(body.error, 'invalid_token');
    },
);

// Bulk GET work-orders/history is deleted. Callers fan-in
// per-item GET work-orders/:id/history.

test(
    'GET organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/history is 404',
    async () => {
        const db = await seededChainDb();
        const collection = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + generateIdentifier(),
                DEV_TOKEN,
            ),
        );
        assert.equal(collection.status, 404);

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
        assert.equal(empty.status, 404);
    },
);
