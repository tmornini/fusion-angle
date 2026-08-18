import { test } from 'node:test';
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
    formWritePair,
} from '../api/message-pair.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// GET organizations/:id/work-orders/:id/history — Phase A1 of states-URI
// elimination. Lifecycle events DESC (index 0 = current),
// with transition field_values folded inline; claim/birth/
// release rows carry []. Miss posture: empty lifecycle →
// missedReadError → 404 miss at this address / 404 absent.

const BASE = 'http://localhost';
const WORK_ORDER_ID = 'wo-hist-1';

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
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
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-middle', name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-finish', name: 'Finish',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'e1', name: '',
                fromNodeId: 'n-start', toNodeId: 'n-middle',
            },
            {
                id: 'e2', name: '',
                fromNodeId: 'n-middle', toNodeId: 'n-finish',
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
        flowWorkOrderId: WORK_ORDER_ID + '-fwo',
        flowWorkOrder: {
            flow_id: 'f-hist',
            work_order_id: WORK_ORDER_ID,
            at: nowUtc(),
        },
        stateEventIds: [
            WORK_ORDER_ID + '-ev1',
            WORK_ORDER_ID + '-ev2',
            WORK_ORDER_ID + '-ev3',
        ],
        states: ['n-start', 'n-middle', 'claimed'],
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
        req('POST', '/organizations/1/work-orders/', DEV_TOKEN, createBody()),
    );
    assert.equal(created.status, 201);

    // Task 8 CUT: legacy fieldValues fold is below-gate
    // stored-data seed (live wire rejects the key).
    const transitionBody: Record<string, unknown> = {
        transitionEventId: WORK_ORDER_ID + '-te1',
        targetState: 'n-middle',
        fieldValues: [
            {
                id: WORK_ORDER_ID + '-fv1',
                fields: {
                    state_event_id:
                        WORK_ORDER_ID + '-te1',
                    attribute_id: 'attr-severity',
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
    const pair = await formWritePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: pattern,
        routeSegments: pattern.split('/'),
        pathSegments,
        headerFields: [],
        body: transitionBody,
        requesterIdentityId: 'current',
        requestAt: nowUtc(),
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, WORK_ORDER_ID, transitionBody,
        'current', undefined, [], pair,
    );

    const release = await handleRequest(
        db,
        req(
            'DELETE',
            '/organizations/1/work-orders/' + WORK_ORDER_ID + '/claim',
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
                '/organizations/1/work-orders/' + WORK_ORDER_ID + '/history',
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
        assert.equal(rows[4]!.id, WORK_ORDER_ID + '-ev1');
        assert.equal(rows[4]!.state, 'n-start');

        // Transition row carries folded field values.
        const transition = rows.find(
            (row) => row.id === WORK_ORDER_ID + '-te1',
        );
        assert.ok(transition !== undefined);
        assert.equal(transition!.state, 'n-middle');
        assert.deepEqual(transition!.field_values, [
            {
                id: WORK_ORDER_ID + '-fv1',
                attribute_id: 'attr-severity',
                value: 'high',
            },
        ]);

        // Birth claim row carries [] (no transition fold).
        const claimed = rows.find(
            (row) => row.id === WORK_ORDER_ID + '-ev3',
        );
        assert.ok(claimed !== undefined);
        assert.equal(claimed!.state, 'claimed');
        assert.deepEqual(claimed!.field_values, []);

        // Every row names this work order.
        for (const row of rows) {
            assert.equal(row.entity_id, WORK_ORDER_ID);
            assert.equal(row.member_id, 'current');
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
            'current', ORGANIZATION_TWO,
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
        // Stark still owns the seed WO (sanity).
        assert.equal(
            STARK_ORGANIZATION !== ORGANIZATION_TWO,
            true,
        );
    },
);

test(
    'absent work order history → 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const missingId = 'no-such-work-order';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/work-orders/' + missingId + '/history',
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
                '/organizations/1/work-orders/' + WORK_ORDER_ID + '/history',
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
    'GET organizations/1/work-orders/history is 404',
    async () => {
        const db = await seededChainDb();
        const collection = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/work-orders/history',
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
                '/organizations/1/work-orders/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(empty.status, 404);
    },
);
