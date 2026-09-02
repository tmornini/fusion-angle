import { assertEquals, assertMatch, assertStrictEquals } from '@std/assert';
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
import {
    IF_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Nested attributes surface under record-types (Task 7):
// member GET (ACL arrays visible), admin PUT create/replace,
// admin DELETE with RESTRICT. Parent type probe 404s with
// record_types vocabulary; attribute miss uses
// record_attributes. Task 20 activates the instance
// fourth leg and composed-op edit RESTRICT.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const ATTR_DETAIL = ATTRS + ATTR_ID;
const COLLECTION =
    '/organizations/' + ORGANIZATION + '/record-types/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;

interface AttributeWireRow {
    id: string;
    organization_id: string;
    record_type_id: string;
    name: string;
    attribute_type: string;
    sort_order: number;
    options: string[];
    constraints: unknown[];
    read_roles: string[];
    write_roles: string[];
}

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

async function seedMembershipMessagePair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );
}

async function adminDb(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: ORGANIZATION,
        identity_id: 'nkgaOHZISTQrILTfPThWCA',
        type: 'member',
        at: AT,
    });
    return {
        db,
        adminToken: await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
        ),
        memberToken: await organizationToken(
            'nkgaOHZISTQrILTfPThWCA', ORGANIZATION,
        ),
    };
}

function typeBody(): Record<string, unknown> {
    return {
        name: 'Rental',
        description: 'Rental desc',
        position: 1,
        state: 'active',
    };
}

function attrCore(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        ...overrides,
    };
}

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assertStrictEquals(put.status, 201);
}

Deno.test('GET .../attributes under live type → 200 []',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'GET', ATTRS, adminToken,
    ));
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), []);
});

Deno.test('GET .../attributes under absent type → 404 '
+ 'record_types vocabulary',
async () => {
    const { db, adminToken } = await adminDb();
    const res = await handleRequest(db, req(
        'GET', ATTRS, adminToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

Deno.test('PUT create no ACL keys → 200; GET shows stamped '
+ 'DEFAULT_ATTRIBUTE_ACL_ROLES',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assertStrictEquals(put.status, 201);
    const echo = await put.json() as AttributeWireRow;
    assertEquals(echo, {
        id: ATTR_ID,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(get.status, 200);
    const row = await get.json() as AttributeWireRow;
    assertEquals(
        row.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assertEquals(
        row.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assertStrictEquals(row.record_type_id, TYPE_ID);
    assertStrictEquals(row.organization_id, ORGANIZATION);
});

Deno.test('PUT replace without ACL keys → 400',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const first = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            name: 'Renamed',
        }),
    ));
    assertStrictEquals(second.status, 400);
});

Deno.test('PUT replace with both ACL keys, no precondition '
+ '→ 200 (simple class)',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const first = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            name: 'Renamed',
            read_roles: ['admin'],
            write_roles: ['admin'],
        }),
    ));
    assertStrictEquals(second.status, 201);
    const echo = await second.json() as AttributeWireRow;
    assertStrictEquals(echo.name, 'Renamed');
    assertEquals(echo.read_roles, ['admin']);
    assertEquals(echo.write_roles, ['admin']);
});

Deno.test('PUT member → 403',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, memberToken, attrCore(),
    ));
    assertStrictEquals(put.status, 403);
});

Deno.test('GET member → 200 including ACL arrays verbatim',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            read_roles: ['member', 'auditor'],
            write_roles: ['admin'],
        }),
    ));
    assertStrictEquals(put.status, 201);
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, memberToken,
    ));
    assertStrictEquals(get.status, 200);
    const row = await get.json() as AttributeWireRow;
    assertEquals(
        row.read_roles, ['member', 'auditor'],
    );
    assertEquals(row.write_roles, ['admin']);
    // Collection also lists the row for the member.
    const list = await handleRequest(db, req(
        'GET', ATTRS, memberToken,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as AttributeWireRow[];
    assertStrictEquals(rows.length, 1);
    assertEquals(
        rows[0]!.read_roles, ['member', 'auditor'],
    );
});

Deno.test('DELETE unreferenced → 204; detail 404',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(del.status, 204);
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(get.status, 404);
    assertEquals(await get.json(), {
        error:
            'Not found: record_attributes/' + ATTR_ID,
    });
});

Deno.test('DELETE with live flow-graph binding → 409',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();
    const flowCreate = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', adminToken, {
            id: flowId,
            flow: {
                name: 'Intake',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId:
                generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [{
                    id: nodeId,
                    flow_id: flowId,
                    name: 'Step',
                    position_x: 0,
                    position_y: 0,
                    is_create: false,
                    is_archive: false,
                    task_instructions: '',
                    at: AT,
                }],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [{
                    id: generateIdentifier(),
                    flow_node_id: nodeId,
                    attribute_id: ATTR_ID,
                    mode: 'editable',
                    is_required: false,
                    action: 'added',
                    at: AT,
                }],
            },
        },
    ));
    assertStrictEquals(flowCreate.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(del.status, 409);
    const body = await del.json() as { error: string };
    assertMatch(
        body.error,
        new RegExp('flow\\(s\\) ' + flowId),
    );
    assertMatch(
        body.error,
        new RegExp(
            'record attribute ' + ATTR_ID
            + ' is referenced by',
        ),
    );
    // Attribute still live after restricted DELETE.
    const still = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(still.status, 200);
});

Deno.test('DELETE while an instance head carries the value '
+ '→ 409 fourth leg names instance(s)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        }),
    ));
    const putInst = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'held',
                },
            ],
        },
    ));
    assertStrictEquals(putInst.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(del.status, 409);
    const body = await del.json() as { error: string };
    assertMatch(
        body.error,
        new RegExp(
            'record attribute ' + ATTR_ID
            + ' is referenced by',
        ),
    );
    assertMatch(
        body.error,
        new RegExp(
            'instance\\(s\\) ' + INSTANCE_ID,
        ),
    );
    const still = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(still.status, 200);
});

Deno.test('DELETE after PATCH clears the value → 204',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        }),
    ));
    const putInst = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'held',
                },
            ],
        },
    ));
    assertStrictEquals(putInst.status, 201);
    const etag = putInst.headers.get('ETag')!;
    const clear = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_ID] },
        { [IF_MATCH_HEADER]: etag },
    ));
    assertStrictEquals(clear.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(del.status, 204);
    const gone = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(gone.status, 404);
});

Deno.test('composed-op edit removedAttributeIds with a valued '
+ 'instance → 409; whole batch rolls back',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        }),
    ));
    const putInst = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'held',
                },
            ],
        },
    ));
    assertStrictEquals(putInst.status, 201);
    const requestsBefore = await db.messagePairs.getAll();
    const responsesBefore = await db.messagePairs.getAll();
    const edit = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, {
            kind: 'edit',
            id: TYPE_ID,
            record: {
                organization_id: ORGANIZATION,
                name: 'Renamed',
                description: 'd',
                position: 1,
            },
            attributes: [],
            state: 'active',
            removedAttributeIds: [ATTR_ID],
        },
    ));
    assertStrictEquals(edit.status, 409);
    const err = await edit.json() as { error: string };
    assertMatch(
        err.error,
        new RegExp(
            'instance\\(s\\) ' + INSTANCE_ID,
        ),
    );
    const typeGet = await handleRequest(db, req(
        'GET', TYPE_DETAIL, adminToken,
    ));
    assertStrictEquals(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        name: string;
    };
    assertStrictEquals(typeRow.name, 'Rental');
    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(attrGet.status, 200);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        requestsBefore.length,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        responsesBefore.length,
    );
});
