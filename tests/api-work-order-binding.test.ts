import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
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
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// PUT organizations/:id/work-orders/:id/binding — bind WO ↔ instance.
// Ladder order is the covenant's (fence → body → instance →
// join → in-tx 409), NOT claim's internal body-first order —
// deliberate divergence so a foreign-WO bind with a
// malformed body is 403, never 400 (fence before body).

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const ORGANIZATION_B = generateIdentifier();
const FLOW_ID = generateIdentifier();
const WO_ID = generateIdentifier();
const WO_UNBOUND = generateIdentifier();
const TYPE_ID = generateIdentifier();
const TYPE_OTHER = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const INSTANCE_2 = generateIdentifier();
const INSTANCE_TOMB = generateIdentifier();
const FR_ID = generateIdentifier();
const FWO_ID = generateIdentifier();
const FWO_UNBOUND = generateIdentifier();
const INSTANCE_OTHER = generateIdentifier();
const INSTANCE_MISSING = generateIdentifier();
const TYPE_FOREIGN = generateIdentifier();
const INSTANCE_FOREIGN = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const BINDING =
    '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID + '/binding';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(extraHeaders !== undefined
            ? { headers: extraHeaders } : {}),
        operationId: TEST_OPERATION_ID,
    });
}

async function messagePairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.messagePairs.getAll()).length;
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Bind Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
}

function bindBody(
    instanceId: string = INSTANCE_ID,
    recordTypeId: string = TYPE_ID,
): Record<string, unknown> {
    return {
        instance_id: instanceId,
        record_type_id: recordTypeId,
    };
}

async function seedOrganizationB(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedOrganizationDocument(
        db, ORGANIZATION_B, 'Beta',
    );
    const memBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: AT,
    };
    await seedSeat(
        db,
        String(memBody['organization_id'] ?? memBody.organization_id),
        String(memBody['identity_id'] ?? memBody.identity_id),
        (memBody['type'] ?? memBody.type) as 'admin' | 'member',
        String(memBody['at'] ?? memBody.at),
    );

}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token, {
            id: FLOW_ID,
            flow: {
                name: 'Bind Flow',
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
    fwoId: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + woId
            , token, {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
    ));
    assertStrictEquals(put.status, 201);
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
    assertStrictEquals(join.status, 201);
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
    typeId: string,
): Promise<void> {
    const path =
        '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId;
    const put = await handleRequest(db, req(
        'PUT', path, token, {
            name: 'Bind Type ' + typeId,
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
    assertStrictEquals(put.status, 201);
}

async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
    recordId: string = TYPE_ID,
    frId: string = FR_ID,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + FLOW_ID + '/records/'
            + '' + frId,
        token,
        {
            id: frId,
            flow_id: FLOW_ID,
            record_id: recordId,
            at: AT,
        },
    ));
    assertStrictEquals(put.status, 201);
}

async function seededDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
    tokenB: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedOrganizationB(db);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
    );
    const tokenB = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_B,
    );
    await seedFlow(db, token);
    await seedWorkOrder(db, token, WO_ID, FWO_ID);
    await seedWorkOrder(
        db, token, WO_UNBOUND, FWO_UNBOUND,
    );
    await seedLiveType(db, token, TYPE_ID);
    await seedAttribute(db, token);
    await seedInstance(db, token, INSTANCE_ID);
    await seedFlowTypeJoin(db, token);
    return { db, token, tokenB };
}

// 1. foreign-WO bind + malformed body → 404 (miss first)
Deno.test('foreign-WO bind with malformed body → 404'
+ ' (miss before body)',
async () => {
    const { db, tokenB } = await seededDb();
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION_B
            + '/work-orders/' + WO_ID + '/binding',
        tokenB,
        { not_a_key: true },
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error:
            'Not found: work_orders/' + WO_ID,
    });
});

// 2. absent WO → 404
Deno.test('absent WO bind → 404',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'xuMWXmMtPdenikPwsAUujg/binding',
        token, bindBody(),
    ));
    assertStrictEquals(res.status, 404);
});

// 3. bad body → 400
Deno.test('bad body (missing key / unknown key / empty'
+ ' id) → 400',
async () => {
    const { db, token } = await seededDb();
    const missing = await handleRequest(db, req(
        'PUT', BINDING, token,
        { instance_id: INSTANCE_ID },
    ));
    assertStrictEquals(missing.status, 400);

    const unknown = await handleRequest(db, req(
        'PUT', BINDING, token, {
            instance_id: INSTANCE_ID,
            record_type_id: TYPE_ID,
            extra: true,
        },
    ));
    assertStrictEquals(unknown.status, 400);

    const empty = await handleRequest(db, req(
        'PUT', BINDING, token, {
            instance_id: '',
            record_type_id: TYPE_ID,
        },
    ));
    assertStrictEquals(empty.status, 400);
});

// 4. instance miss postures → 404 (no oracle)
Deno.test('absent / tombstoned / foreign-org instance'
+ ' → 404 (indistinguishable)',
async () => {
    const { db, token, tokenB } = await seededDb();

    const absent = await handleRequest(db, req(
        'PUT', BINDING, token,
        bindBody(INSTANCE_MISSING, TYPE_ID),
    ));
    assertStrictEquals(absent.status, 404);
    assertEquals(await absent.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_MISSING,
    });

    await seedInstance(db, token, INSTANCE_TOMB);
    const del = await handleRequest(db, req(
        'DELETE',
        INSTANCES + INSTANCE_TOMB,
        token,
    ));
    assertStrictEquals(del.status, 204);
    const tomb = await handleRequest(db, req(
        'PUT', BINDING, token,
        bindBody(INSTANCE_TOMB, TYPE_ID),
    ));
    assertStrictEquals(tomb.status, 404);
    assertEquals(await tomb.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_TOMB,
    });

    // Foreign-org instance under B (distinct type id —
    // record-type ids are globally ownership-fenced).
    const typeIdB = TYPE_FOREIGN;
    const typeB =
        '/organizations/' + ORGANIZATION_B
        + '/record-types/' + typeIdB;
    const putTypeB = await handleRequest(db, req(
        'PUT', typeB, tokenB, {
            name: 'Foreign',
            description: '',
            position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(putTypeB.status, 201);
    const putAttrB = await handleRequest(db, req(
        'PUT',
        typeB + '/attributes/' + ATTR_ID,
        tokenB,
        {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
            write_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
        },
    ));
    assertStrictEquals(putAttrB.status, 201);
    const foreignInst = INSTANCE_FOREIGN;
    const putInstB = await handleRequest(db, req(
        'PATCH',
        typeB + '/instances/' + foreignInst,
        tokenB,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
        },
    ));
    assertStrictEquals(putInstB.status, 201);
    // Bind under org A with the foreign instance id + the
    // org-A joined type — head resolves under fenced org
    // only, so foreign is absent 404 (no oracle).
    const foreign = await handleRequest(db, req(
        'PUT', BINDING, token,
        bindBody(foreignInst, TYPE_ID),
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error: 'Not found: record_instances/'
            + foreignInst,
    });
});

// 5. record_type_id not among flow joins → 400
// Instance must be LIVE under the asserted type so the
// ladder reaches the join check (instance before join).
Deno.test('record_type_id not among WO flow joins → 400',
async () => {
    const { db, token } = await seededDb();
    await seedLiveType(db, token, TYPE_OTHER);
    const otherAttrPath =
        '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_OTHER
        + '/attributes/' + ATTR_ID;
    const attr = await handleRequest(db, req(
        'PUT', otherAttrPath, token, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
            write_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
        },
    ));
    assertStrictEquals(attr.status, 201);
    const otherInst = INSTANCE_OTHER;
    const inst = await handleRequest(db, req(
        'PATCH',
        '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_OTHER
        + '/instances/' + otherInst,
        token,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
        },
    ));
    assertStrictEquals(inst.status, 201);
    const before = await messagePairCount(db);
    const res = await handleRequest(db, req(
        'PUT', BINDING, token,
        bindBody(otherInst, TYPE_OTHER),
    ));
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(
        err.error,
        /not joined to the work order's flow/,
    );
    assertStrictEquals(await messagePairCount(db), before);
});

// 6. fresh bind → 201 + GET embed; unbound omits keys
Deno.test('fresh bind → 201; detail + list embed; unbound'
+ ' omits keys',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'PUT', BINDING, token, bindBody(),
    ));
    assertStrictEquals(res.status, 201);

    const detail = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/' + WO_ID
            , token,
    ));
    assertStrictEquals(detail.status, 200);
    const d = await detail.json() as Record<
        string, unknown
    >;
    assertStrictEquals(d['instance_id'], INSTANCE_ID);
    assertStrictEquals(d['record_type_id'], TYPE_ID);

    const list = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/', token,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as Record<
        string, unknown
    >[];
    const bound = rows.find((r) => r['id'] === WO_ID);
    const unbound = rows.find(
        (r) => r['id'] === WO_UNBOUND,
    );
    assert(bound !== undefined);
    assert(unbound !== undefined);
    assertStrictEquals(bound['instance_id'], INSTANCE_ID);
    assertStrictEquals(bound['record_type_id'], TYPE_ID);
    assertStrictEquals(
        Object.hasOwn(unbound, 'instance_id'),
        false,
    );
    assertStrictEquals(
        Object.hasOwn(unbound, 'record_type_id'),
        false,
    );
});

// 7. re-bind same pair → 201 replay (pair count stable)
Deno.test('re-bind same pair byte-identically → 201'
+ ' replay (pair count unchanged)',
async () => {
    const { db, token } = await seededDb();
    const first = await handleRequest(db, req(
        'PUT', BINDING, token, bindBody(),
    ));
    assertStrictEquals(first.status, 201);
    const before = await messagePairCount(db);
    const second = await handleRequest(db, req(
        'PUT', BINDING, token, bindBody(),
    ));
    assertStrictEquals(second.status, 201);
    assertStrictEquals(await messagePairCount(db), before);
});

// 8. bind different instance → 409
Deno.test('bind different instance → 409',
async () => {
    const { db, token } = await seededDb();
    await seedInstance(db, token, INSTANCE_2);
    const first = await handleRequest(db, req(
        'PUT', BINDING, token, bindBody(),
    ));
    assertStrictEquals(first.status, 201);
    const res = await handleRequest(db, req(
        'PUT', BINDING, token,
        bindBody(INSTANCE_2, TYPE_ID),
    ));
    assertStrictEquals(res.status, 409);
    assertEquals(await res.json(), {
        error:
            'work order is already bound to a'
            + ' different instance',
    });
});
