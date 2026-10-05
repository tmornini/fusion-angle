import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { IF_NONE_MATCH_HEADER } from '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import {
    apiRequest,
    assertPartsAreHeads,
    partBodiesOf,
    partsOf,
    storedPutBodyText,
} from './http-fixtures.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';

// GET work-orders (inbox) and GET
// organizations/:id/work-orders/:id are Stream: a work
// order's head is its whole state, binding included (§5).
// Work-order history is Assemble over the version chain and
// stays /history until its retirement; versions/ serves the
// stored parts beside it.

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-01-01T00:00:00.000000Z';
const FLOW_ID = generateIdentifier();
const WO_ID = generateIdentifier();
const WO_UNBOUND = generateIdentifier();
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const FR_ID = generateIdentifier();
const NODE_START = generateIdentifier();
const NODE_FINISH = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const BINDING = '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
    + WO_ID + '/binding';
const DOCUMENT_PREFIX =
    '/organizations/' + ORGANIZATION + '/work-orders/';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Class Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
}

function bindBody(): Record<string, unknown> {
    return {
        instance_id: INSTANCE_ID,
        record_type_id: TYPE_ID,
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
                name: 'Class Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
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
    assertStrictEquals(res.status, 201);
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
): Promise<void> {
    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION,
        id: woId,
        fields: {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [NODE_START, NODE_START],
        at: AT,
        token,
        claim: 'released',
    });
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, token, {
            name: 'Class Type',
            description: '',
            position: 1,
            state: 'active',

        },
    ));
    assertStrictEquals(put.status, 201);
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
    assertStrictEquals(put.status, 201);
}

async function seedInstance(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, apiRequest({
        method: 'PATCH',
        path: INSTANCES + INSTANCE_ID,
        token,
        body: {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Hello',
                },
            ],
        },
        headers: { [IF_NONE_MATCH_HEADER]: '*' },
    }));
    assertStrictEquals(put.status, 201);
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
    assertStrictEquals(put.status, 201);
}

async function seededDb(): Promise<{
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
    await seedWorkOrder(db, token, WO_ID);
    await seedWorkOrder(db, token, WO_UNBOUND);
    await seedLiveType(db, token);
    await seedAttribute(db, token);
    await seedInstance(db, token);
    await seedFlowTypeJoin(db, token);
    return { db, token };
}

async function bindWorkOrder(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const read = await handleRequest(db, req(
        'GET', DOCUMENT_PREFIX + WO_ID, token,
    ));
    await read.body?.cancel();
    const res = await handleRequest(db, req(
        'PUT', BINDING, token, bindBody(),
        { 'If-Match': read.headers.get('ETag')! },
    ));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
}

Deno.test('GET organizations/:id/work-orders/:id is Stream',
async () => {
    const { db, token } = await seededDb();
    await bindWorkOrder(db, token);

    const stored = JSON.parse(
        await storedPutBodyText(db, DOCUMENT_PREFIX, WO_ID),
    ) as Record<string, unknown>;
    assertStrictEquals(stored['instance_id'], INSTANCE_ID);
    assertStrictEquals(stored['record_type_id'], TYPE_ID);

    const detail = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
            , token,
    ));
    assertStrictEquals(detail.status, 200);
    const got = await detail.json() as Record<
        string, unknown
    >;
    assertStrictEquals(got['instance_id'], INSTANCE_ID);
    assertStrictEquals(got['record_type_id'], TYPE_ID);
    assertEquals(got, stored);
});

Deno.test('GET work-orders is Stream',
async () => {
    const { db, token } = await seededDb();
    await bindWorkOrder(db, token);

    const list = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
    ));
    assertStrictEquals(list.status, 200);
    const parts = await partsOf<Record<string, unknown>>(list);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    const rows = parts.map((part) => part.body().toValue());
    const bound = rows.find((row) => row['id'] === WO_ID);
    assert(bound !== undefined);
    assertStrictEquals(bound['instance_id'], INSTANCE_ID);
    assertStrictEquals(bound['record_type_id'], TYPE_ID);
});

Deno.test('unbound GET omits bind keys (absent, not null)',
async () => {
    const { db, token } = await seededDb();

    const detail = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO_UNBOUND, token,
    ));
    assertStrictEquals(detail.status, 200);
    const got = await detail.json() as Record<
        string, unknown
    >;
    assertStrictEquals(got['id'], WO_UNBOUND);
    assertStrictEquals(Object.hasOwn(got, 'instance_id'), false);
    assertStrictEquals(
        Object.hasOwn(got, 'record_type_id'), false,
    );

    const list = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await partBodiesOf<Record<string, unknown>>(list);
    const unbound = rows.find(
        (row) => row['id'] === WO_UNBOUND,
    );
    assert(unbound !== undefined);
    assertStrictEquals(
        Object.hasOwn(unbound, 'instance_id'), false,
    );
    assertStrictEquals(
        Object.hasOwn(unbound, 'record_type_id'), false,
    );
});

function createBody(id: string) {
    const t0 = nowUtc();
    const t1 = nowUtc();
    const t2 = nowUtc();
    return {
        id,
        workOrder: {
            display_id: id,
            flow_graph: graphJson(),
            position: 1,
        },
        flowWorkOrderId: generateIdentifier(),
        flowWorkOrder: {
            flow_id: generateIdentifier(),
            work_order_id: id,
            at: nowUtc(),
        },
        stateEventIds: [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ],
        states: [NODE_START, NODE_FINISH, 'claimed'],
        stateEventAts: [t0, t1, t2],
    };
}

Deno.test('work-order versions are stored parts beside'
+ ' /history',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
    );
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token
            , createBody(WO_ID),
    ));
    assertStrictEquals(created.status, 201);

    const history = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
            + '/history', token,
    ));
    assertStrictEquals(history.status, 200);
    assert(Array.isArray(await history.json()));

    const versions = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
            + '/versions/', token,
    ));
    assertStrictEquals(versions.status, 200);
    assertStrictEquals((await partsOf(versions)).length, 1);

    const slashless = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
            + '/versions', token,
    ));
    assertStrictEquals(slashless.status, 404);
    await slashless.body?.cancel();

    const bulk = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + generateIdentifier(), token,
    ));
    assertStrictEquals(bulk.status, 404);
});
