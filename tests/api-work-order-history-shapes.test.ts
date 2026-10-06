import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import { postSeedWorkOrderTransitionOp } from '../api/routes.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
} from '../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';
import {
    apiRequest,
} from './http-fixtures.ts';

// Task 3: the versions' events speak BOTH transition shapes
// (A4 shape-disjoint). Transition pairs seeded BELOW the
// gate so new-shape bodies never hit the still-legacy
// validator. Legacy path must stay byte-identical to
// today's pool + latestByKey head-reduce.

const ORGANIZATION = STARK_ORGANIZATION;
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';
const NODE_START = generateIdentifier();
const NODE_MIDDLE = generateIdentifier();
const NODE_FINISH = generateIdentifier();
const EDGE_2 = generateIdentifier();
const ATTR_SEVERITY = generateIdentifier();
const ATTR_X = generateIdentifier();
// A value-bearing body names the instance it revises.
const BOUND = {
    instance_id: generateIdentifier(),
    record_type_id: generateIdentifier(),
};
// Three set ids in ascending order.
const [ATTR_B0, ATTR_B1, ATTR_B2] = [
    generateIdentifier(),
    generateIdentifier(),
    generateIdentifier(),
].sort(compareIdentifiers);

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
    });
}

function flowGraph(): Record<string, unknown> {
    const graph: WorkOrderFlowGraph = {
        name: 'Shape fixture flow',
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
                fromNodeId: NODE_START,
                toNodeId: NODE_MIDDLE,
            },
            {
                id: EDGE_2, name: '',
                fromNodeId: NODE_MIDDLE,
                toNodeId: NODE_FINISH,
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
        flowWorkOrderId: generateIdentifier(),
        flowWorkOrder: {
            flow_id: generateIdentifier(),
            work_order_id: workOrderId,
            at: nowUtc(),
        },
        stateEventIds: [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ],
        states: [NODE_START, NODE_MIDDLE, 'claimed'],
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
            '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/',
            DEV_TOKEN,
            createBody(workOrderId),
        ),
    );
    assertStrictEquals(created.status, 201);
}

// Below-gate transition through the seed op: it lands the
// work order's version with this event's own field values.
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
    const messagePair = await formWriteMessagePair({
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postSeedWorkOrderTransitionOp(
        db, organization, workOrderId, body,
        SYSTEM_MEMBER_ID, messagePair,
    );
    return messagePair.id;
}

// Pin 1: legacy-only — the same fv row id in two
// transitions; each event records its own value (a version
// carries only its own events, never a later one's).
Deno.test('legacy-only WO: each event keeps its own field'
+ ' values',
async () => {
    const db = await seedBaseDb();
    const workOrderId = generateIdentifier();
    await createWorkOrder(db, workOrderId);

    const teEarly = generateIdentifier();
    const teLate = generateIdentifier();
    const fvShared = generateIdentifier();

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teEarly,
            targetState: NODE_MIDDLE,
            fieldValues: [{
                id: fvShared,
                fields: {
                    state_event_id: teEarly,
                    attribute_id: ATTR_X,
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
                    attribute_id: ATTR_X,
                    value: 'new',
                },
            }],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await getWorkOrderEvents(
        db, DEV_TOKEN, ORGANIZATION, workOrderId,
    );

    const early = history.find((r) => r.id === teEarly);
    const late = history.find((r) => r.id === teLate);
    assert(early !== undefined);
    assert(late !== undefined);
    assertEquals(early!.field_values, [{
        id: fvShared,
        attribute_id: ATTR_X,
        value: 'old',
    }]);
    assertEquals(late!.field_values, [{
        id: fvShared,
        attribute_id: ATTR_X,
        value: 'new',
    }]);
});

// Pin 2: new-shape-only — set + clear → per-event rows,
// id-ascending; cleared row has NO value key.
Deno.test('new-shape-only WO: set/clear rows id-ascending;'
+ ' cleared has no value key',
async () => {
    const db = await seedBaseDb();
    const workOrderId = generateIdentifier();
    await createWorkOrder(db, workOrderId);

    const teNew = generateIdentifier();
    const teOther = generateIdentifier();

    // Sibling event with empty legacy bag — must stay [].
    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teOther,
            targetState: NODE_MIDDLE,
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
            ...BOUND,
            set: [
                { attribute_id: 'UZgNCkZlSJcSaAmAJuSkcw', value: 'x' },
                { attribute_id: 'UQTJZvCoKlFjEoDlDUwekw', value: 'y' },
            ],
            clear: ['a3'],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await getWorkOrderEvents(
        db, DEV_TOKEN, ORGANIZATION, workOrderId,
    );

    const other = history.find((r) => r.id === teOther);
    const row = history.find((r) => r.id === teNew);
    assert(other !== undefined);
    assert(row !== undefined);
    assertEquals(other!.field_values, []);
    assertEquals<unknown>(row!.field_values, [
        { id: 'UQTJZvCoKlFjEoDlDUwekw'
            , attribute_id: 'UQTJZvCoKlFjEoDlDUwekw', value: 'y' },
        { id: 'UZgNCkZlSJcSaAmAJuSkcw'
            , attribute_id: 'UZgNCkZlSJcSaAmAJuSkcw', value: 'x' },
        { id: 'a3', attribute_id: 'a3', cleared: true },
    ]);
    const cleared = row!.field_values.find(
        (fv) => fv.id === 'a3',
    );
    assert(cleared !== undefined);
    assertStrictEquals(Object.hasOwn(cleared!, 'value'), false);
});

// Pin 3: mixed WO — each pair under its own shape rule;
// legacy bytes unchanged.
Deno.test('mixed WO: legacy bag + new-shape set/clear each'
+ ' under own rule',
async () => {
    const db = await seedBaseDb();
    const workOrderId = generateIdentifier();
    await createWorkOrder(db, workOrderId);

    const teLegacy = generateIdentifier();
    const teNew = generateIdentifier();
    const fvId = generateIdentifier();

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: teLegacy,
            targetState: NODE_MIDDLE,
            fieldValues: [{
                id: fvId,
                fields: {
                    state_event_id: teLegacy,
                    attribute_id: ATTR_SEVERITY,
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
            ...BOUND,
            set: [
                { attribute_id: ATTR_B2!, value: 'p' },
                { attribute_id: ATTR_B1!, value: 'q' },
            ],
            clear: [ATTR_B0!],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await getWorkOrderEvents(
        db, DEV_TOKEN, ORGANIZATION, workOrderId,
    );

    const legacy = history.find((r) => r.id === teLegacy);
    const neu = history.find((r) => r.id === teNew);
    assert(legacy !== undefined);
    assert(neu !== undefined);
    // Legacy bytes: fv row id, attribute_id, value only.
    assertEquals(legacy!.field_values, [{
        id: fvId,
        attribute_id: ATTR_SEVERITY,
        value: 'high',
    }]);
    assertStrictEquals(
        Object.hasOwn(legacy!.field_values[0]!, 'cleared'),
        false,
    );
    assertEquals<unknown>(neu!.field_values, [
        { id: ATTR_B0!, attribute_id: ATTR_B0!, cleared: true },
        { id: ATTR_B1!, attribute_id: ATTR_B1!, value: 'q' },
        { id: ATTR_B2!, attribute_id: ATTR_B2!, value: 'p' },
    ]);
});

// Pin 4: claim rows still field_values: []; chain order.
Deno.test('claim rows field_values []; history is in chain'
+ ' order',
async () => {
    const db = await seedBaseDb();
    const workOrderId = generateIdentifier();
    await createWorkOrder(db, workOrderId);

    await appendTransitionPair(
        db, ORGANIZATION, workOrderId,
        {
            transitionEventId: generateIdentifier(),
            targetState: NODE_MIDDLE,
            ...BOUND,
            set: [
                { attribute_id: 'WeXjAaAxGSpLpamfEuvcww', value: 'v' },
            ],
            clear: [],
            release: null,
            transitionAt: nowUtc(),
        },
        nowUtc(),
    );

    const history = await getWorkOrderEvents(
        db, DEV_TOKEN, ORGANIZATION, workOrderId,
    );

    const claimed = history.find(
        (r) => r.state === 'claimed',
    );
    assert(claimed !== undefined);
    assertEquals(claimed!.field_values, []);

    // Chain order, oldest first: `at` never precedes the
    // previous event's, and ties are not broken by id.
    for (let i = 1; i < history.length; i++) {
        assert(
            history[i - 1]!.at <= history[i]!.at,
            'history must be in chain order',
        );
    }
});
