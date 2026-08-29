import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';

// Instance DELETE RESTRICT (W5 / Task 5): 409 when any org
// WO currently binds the instance AND that WO's current
// node is non-terminal in its OWN frozen flow_graph.
// Terminal-node and unbound instances tombstone as before.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const FLOW_ID = generateIdentifier();
const WO_A = generateIdentifier();
const WO_B = generateIdentifier();
const WO_UNBOUND = generateIdentifier();
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const INSTANCE_FRESH = generateIdentifier();
const FR_ID = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;

const N_CREATE = generateIdentifier();
const N_MID = generateIdentifier();
const N_TERM = generateIdentifier();
const E_CREATE_MID = generateIdentifier();
const E_MID_TERM = generateIdentifier();
const PROJECT_ID = generateIdentifier();
const FWO_A = generateIdentifier();
const FWO_B = generateIdentifier();
const FWO_UNBOUND = generateIdentifier();
const TE_A_MID = generateIdentifier();
const TE_B_TERM = generateIdentifier();
const TE_A_TERM = generateIdentifier();

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

// Three-node line: create → mid → terminal. Mid has
// outgoing edges (in-flight); terminal has none.
function flowGraph(): Record<string, unknown> {
    return {
        name: 'Delete Restrict Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: N_CREATE, name: 'Create',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_MID, name: 'Mid',
                positionX: 100, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: N_TERM, name: 'Terminal',
                positionX: 200, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: E_CREATE_MID, name: '',
                fromNodeId: N_CREATE, toNodeId: N_MID,
            },
            {
                id: E_MID_TERM, name: '',
                fromNodeId: N_MID, toNodeId: N_TERM,
            },
        ],
    };
}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: FLOW_ID,
            flow: {
                name: 'Delete Restrict Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: PROJECT_ID,
                flow_id: FLOW_ID,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(res.status, 201);
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    fwoId: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
            , token, {
            display_id: 'abcd',
            flow_graph: flowGraph(),
            position: 1,
        },
    ));
    assert.equal(put.status, 201);
    const join = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID
            + '/work-orders/' + fwoId,
        token,
        {
            flow_id: FLOW_ID,
            work_order_id: woId,
            at: AT,
        },
    ));
    assert.equal(join.status, 201);
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, token, {
            name: 'Delete Restrict Type',
            description: '',
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(put.status, 201);
}

async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + ATTR_ID, token, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ));
    assert.equal(put.status, 201);
}

async function seedInstance(
    db: MemoryDbAdapter,
    token: string,
    instanceId: string,
): Promise<void> {
    const path = INSTANCES + instanceId;
    const put = await handleRequest(db, req(
        'PATCH', path, token, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Hello',
                },
            ],
        },
    ));
    assert.equal(put.status, 201);
}

async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID + '/records/'
            + '' + FR_ID,
        token,
        {
            id: FR_ID,
            flow_id: FLOW_ID,
            record_id: TYPE_ID,
            at: AT,
        },
    ));
    assert.equal(put.status, 201);
}

async function bindInstance(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    instanceId: string = INSTANCE_ID,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
            + '/binding',
        token,
        {
            instance_id: instanceId,
            record_type_id: TYPE_ID,
        },
    ));
    assert.equal(res.status, 201);
}

async function transitionTo(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    targetState: string,
    eventId: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
            + '/transition',
        token,
        {
            transitionEventId: eventId,
            targetState,
            release: null,
            transitionAt: nowUtc(),
        },
    ));
    assert.equal(res.status, 201);
}

// Fixture: type + instance + flow join + TWO WOs both
// bound; WO-A at mid (in-flight), WO-B at terminal.
async function seededInFlightDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
    );
    await seedFlow(db, token);
    await seedWorkOrder(db, token, WO_A, FWO_A);
    await seedWorkOrder(db, token, WO_B, FWO_B);
    await seedWorkOrder(
        db, token, WO_UNBOUND, FWO_UNBOUND,
    );
    await seedLiveType(db, token);
    await seedAttribute(db, token);
    await seedInstance(db, token, INSTANCE_ID);
    await seedFlowTypeJoin(db, token);
    await bindInstance(db, token, WO_A);
    await bindInstance(db, token, WO_B);
    await transitionTo(
        db, token, WO_A, N_MID, TE_A_MID,
    );
    await transitionTo(
        db, token, WO_B, N_TERM, TE_B_TERM,
    );
    return { db, token };
}

// 1. DELETE while WO-A in flight → 409 naming WO-A only
test('DELETE while WO-A in-flight → 409 naming WO-A only'
+ ' (terminal WO-B released)',
async () => {
    const { db, token } = await seededInFlightDb();
    const res = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, token,
    ));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), {
        error:
            'record instance ' + INSTANCE_ID
            + ' is placed in-flight on work order(s) '
            + WO_A,
    });
});

// 2. transition WO-A to terminal → DELETE → 204
test('transition WO-A to terminal → DELETE → 204'
+ ' (tombstone)',
async () => {
    const { db, token } = await seededInFlightDb();
    await transitionTo(
        db, token, WO_A, N_TERM, TE_A_TERM,
    );
    const res = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, token,
    ));
    assert.equal(res.status, 204);
});

// 3. unbound instance (fresh, no binds) → DELETE → 204
test('unbound instance (fresh, no binds) → DELETE → 204',
async () => {
    const { db, token } = await seededInFlightDb();
    await seedInstance(db, token, INSTANCE_FRESH);
    const res = await handleRequest(db, req(
        'DELETE',
        INSTANCES + INSTANCE_FRESH,
        token,
    ));
    assert.equal(res.status, 204);
});

// 4. tombstone-wins replay: repeat DELETE → 204
test('tombstone-wins replay after terminal DELETE → 204',
async () => {
    const { db, token } = await seededInFlightDb();
    await transitionTo(
        db, token, WO_A, N_TERM, TE_A_TERM,
    );
    const first = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, token,
    ));
    assert.equal(first.status, 204);
    const second = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, token,
    ));
    assert.equal(second.status, 204);
});

// 5. bind-after-tombstone → 404
test('bind-after-tombstone naming tombstoned instance'
+ ' → 404',
async () => {
    const { db, token } = await seededInFlightDb();
    await transitionTo(
        db, token, WO_A, N_TERM, TE_A_TERM,
    );
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, token,
    ));
    assert.equal(del.status, 204);
    const bind = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_UNBOUND
            + '/binding',
        token,
        {
            instance_id: INSTANCE_ID,
            record_type_id: TYPE_ID,
        },
    ));
    assert.equal(bind.status, 404);
    assert.deepEqual(await bind.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });
});
