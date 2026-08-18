import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    formWritePair,
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
} from '../api/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { workOrderHistoryFor } from
    '../api/derive-states.ts';
import {
    deriveStateFieldValueReferrers,
} from '../api/derive-state-field-values.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Task 3: history fold speaks BOTH transition shapes
// (A4 shape-disjoint). Transition pairs seeded BELOW the
// gate so new-shape bodies never hit the still-legacy
// validator. Legacy path must stay byte-identical to
// today's pool + latestByKey head-reduce.

const BASE = 'http://localhost';
const ORGANIZATION = STARK_ORGANIZATION;
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';

function req(
    method: string,
    path: string,
    token: string,
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
        name: 'Shape fixture flow',
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
                fromNodeId: 'n-start',
                toNodeId: 'n-middle',
            },
            {
                id: 'e2', name: '',
                fromNodeId: 'n-middle',
                toNodeId: 'n-finish',
            },
        ],
    };
    return graph as unknown as Record<string, unknown>;
}

function createBody(workOrderId: string) {
    const t0 = nowUtc();
    const t1 = nowUtc();
    const t2 = nowUtc();
    return {
        id: workOrderId,
        workOrder: {
            display_id: workOrderId.slice(0, 8),
            flow_graph: flowGraph(),
            position: 1,
        },
        flowWorkOrderId: workOrderId + '-fwo',
        flowWorkOrder: {
            flow_id: 'f-shapes',
            work_order_id: workOrderId,
            at: nowUtc(),
        },
        stateEventIds: [
            workOrderId + '-ev1',
            workOrderId + '-ev2',
            workOrderId + '-ev3',
        ],
        states: ['n-start', 'n-middle', 'claimed'],
        stateEventAts: [t0, t1, t2],
    };
}

async function seedBaseDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    return db;
}

async function createWorkOrder(
    db: MemoryDbAdapter,
    workOrderId: string,
): Promise<void> {
    const created = await handleRequest(
        db,
        req(
            'POST',
            '/organizations/1/work-orders/',
            DEV_TOKEN,
            createBody(workOrderId),
        ),
    );
    assert.equal(created.status, 201);
}

// Below-gate transition append (appendInstancePair idiom).
// routePattern organizations/:id/work-orders/:id/transition; POST; 204.
async function appendTransitionPair(
    db: MemoryDbAdapter,
    organization: string,
    workOrderId: string,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<string> {
    const routeSegments = TRANSITION_PATTERN.split('/');
    const pathSegments = [
        'organizations', organization,
        'work-orders', workOrderId, 'transition',
    ];
    const pair = await formWritePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TRANSITION_PATTERN,
        routeSegments,
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

interface HistoryFieldValue {
    id: string;
    attribute_id: string;
    value?: string;
    cleared?: true;
}

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
    field_values: HistoryFieldValue[];
}

// Pin 1: legacy-only cross-event migration — same fv row
// id in two pairs; head-reduce attributes value to the
// LATER event only.
test('legacy-only WO: fold pools by fv id; later event'
+ ' owns the head',
async () => {
    const db = await seedBaseDb();
    const workOrderId = 'wo-shape-legacy';
    await createWorkOrder(db, workOrderId);

    const teEarly = workOrderId + '-te-early';
    const teLate = workOrderId + '-te-late';
    const fvShared = workOrderId + '-fv-shared';

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teEarly,
            targetState: 'n-middle',
            fieldValues: [{
                id: fvShared,
                fields: {
                    state_event_id: teEarly,
                    attribute_id: 'attr-x',
                    value: 'old',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teLate,
            targetState: 'n-finish',
            fieldValues: [{
                id: fvShared,
                fields: {
                    state_event_id: teLate,
                    attribute_id: 'attr-x',
                    value: 'new',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await workOrderHistoryFor(
        db, ORGANIZATION, workOrderId,
    ) as HistoryEvent[];

    const early = history.find((r) => r.id === teEarly);
    const late = history.find((r) => r.id === teLate);
    assert.ok(early !== undefined);
    assert.ok(late !== undefined);
    // Head-reduce by fv row id: only the later event carries
    // the value; earlier event's bag is empty for this id.
    assert.deepEqual(early!.field_values, []);
    assert.deepEqual(late!.field_values, [{
        id: fvShared,
        attribute_id: 'attr-x',
        value: 'new',
    }]);
});

// Pin 2: new-shape-only — set + clear → per-event rows,
// id-ascending; cleared row has NO value key.
test('new-shape-only WO: set/clear rows id-ascending;'
+ ' cleared has no value key',
async () => {
    const db = await seedBaseDb();
    const workOrderId = 'wo-shape-new';
    await createWorkOrder(db, workOrderId);

    const teNew = workOrderId + '-te-new';
    const teOther = workOrderId + '-te-other';

    // Sibling event with empty legacy bag — must stay [].
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teOther,
            targetState: 'n-middle',
            fieldValues: [],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teNew,
            targetState: 'n-finish',
            set: [
                { attribute_id: 'a2', value: 'x' },
                { attribute_id: 'a1', value: 'y' },
            ],
            clear: ['a3'],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await workOrderHistoryFor(
        db, ORGANIZATION, workOrderId,
    ) as HistoryEvent[];

    const other = history.find((r) => r.id === teOther);
    const row = history.find((r) => r.id === teNew);
    assert.ok(other !== undefined);
    assert.ok(row !== undefined);
    assert.deepEqual(other!.field_values, []);
    assert.deepEqual(row!.field_values, [
        { id: 'a1', attribute_id: 'a1', value: 'y' },
        { id: 'a2', attribute_id: 'a2', value: 'x' },
        { id: 'a3', attribute_id: 'a3', cleared: true },
    ]);
    const cleared = row!.field_values.find(
        (fv) => fv.id === 'a3',
    );
    assert.ok(cleared !== undefined);
    assert.equal(Object.hasOwn(cleared!, 'value'), false);
});

// Pin 3: mixed WO — each pair under its own shape rule;
// legacy bytes unchanged.
test('mixed WO: legacy bag + new-shape set/clear each'
+ ' under own rule',
async () => {
    const db = await seedBaseDb();
    const workOrderId = 'wo-shape-mixed';
    await createWorkOrder(db, workOrderId);

    const teLegacy = workOrderId + '-te-leg';
    const teNew = workOrderId + '-te-new';
    const fvId = workOrderId + '-fv1';

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teLegacy,
            targetState: 'n-middle',
            fieldValues: [{
                id: fvId,
                fields: {
                    state_event_id: teLegacy,
                    attribute_id: 'attr-severity',
                    value: 'high',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teNew,
            targetState: 'n-finish',
            set: [
                { attribute_id: 'b2', value: 'p' },
                { attribute_id: 'b1', value: 'q' },
            ],
            clear: ['b0'],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await workOrderHistoryFor(
        db, ORGANIZATION, workOrderId,
    ) as HistoryEvent[];

    const legacy = history.find((r) => r.id === teLegacy);
    const neu = history.find((r) => r.id === teNew);
    assert.ok(legacy !== undefined);
    assert.ok(neu !== undefined);
    // Legacy bytes: fv row id, attribute_id, value only.
    assert.deepEqual(legacy!.field_values, [{
        id: fvId,
        attribute_id: 'attr-severity',
        value: 'high',
    }]);
    assert.equal(
        Object.hasOwn(legacy!.field_values[0]!, 'cleared'),
        false,
    );
    assert.deepEqual(neu!.field_values, [
        { id: 'b0', attribute_id: 'b0', cleared: true },
        { id: 'b1', attribute_id: 'b1', value: 'q' },
        { id: 'b2', attribute_id: 'b2', value: 'p' },
    ]);
});

// Pin 4: claim rows still field_values: []; DESC order.
test('claim rows field_values []; history is (at, id)'
+ ' DESC',
async () => {
    const db = await seedBaseDb();
    const workOrderId = 'wo-shape-claim';
    await createWorkOrder(db, workOrderId);

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: workOrderId + '-te1',
            targetState: 'n-middle',
            set: [
                { attribute_id: 'c1', value: 'v' },
            ],
            clear: [],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await workOrderHistoryFor(
        db, ORGANIZATION, workOrderId,
    ) as HistoryEvent[];

    const claimed = history.find(
        (r) => r.state === 'claimed',
    );
    assert.ok(claimed !== undefined);
    assert.deepEqual(claimed!.field_values, []);

    // Strict DESC on (at, id).
    for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1]!;
        const cur = history[i]!;
        const ordered =
            prev.at > cur.at
            || (prev.at === cur.at && prev.id > cur.id);
        assert.ok(
            ordered,
            'history must be (at, id) DESC',
        );
    }
});

// Pin 5: RESTRICT census ignores new-shape pairs; counts
// legacy bag values only; does not crash.
test('deriveStateFieldValueReferrers counts legacy only;'
+ ' new-shape pairs do not crash',
async () => {
    const db = await seedBaseDb();
    const workOrderId = 'wo-shape-restrict';
    await createWorkOrder(db, workOrderId);

    const teLegacy = workOrderId + '-te-leg';
    const teNew = workOrderId + '-te-new';
    const fvId = workOrderId + '-fv-r';
    const attrId = 'attr-restrict-shape';

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teLegacy,
            targetState: 'n-middle',
            fieldValues: [{
                id: fvId,
                fields: {
                    state_event_id: teLegacy,
                    attribute_id: attrId,
                    value: 'counted',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teNew,
            targetState: 'n-finish',
            set: [
                { attribute_id: attrId, value: 'ignored' },
            ],
            clear: ['other-attr'],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const derived = await deriveStateFieldValueReferrers(
        db, ORGANIZATION, [attrId],
    );
    const rows = derived.get(attrId) ?? [];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, fvId);
    assert.equal(rows[0]!.attribute_id, attrId);
    assert.equal(rows[0]!.value, 'counted');
    assert.equal(rows[0]!.state_event_id, teLegacy);
});
