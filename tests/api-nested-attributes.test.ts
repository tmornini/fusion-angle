import { test } from 'node:test';
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
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    IF_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Nested attributes surface under record-types (Task 7):
// member GET (ACL arrays visible), admin PUT create/replace,
// admin DELETE with RESTRICT. Parent type probe 404s with
// record_types vocabulary; attribute miss uses
// record_attributes. Task 20 activates the instance
// fourth leg and composed-op edit RESTRICT.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-attr-1';
const ATTR_ID = 'attr-nested-1';
const INSTANCE_ID = 'inst-attr-restrict-1';

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
        headers: extraHeaders,
        operationId: TEST_OPERATION_ID,
    });
}

async function seedMembershipPair(
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
    await seedMembershipPair(db, 'm-member1', {
        organization_id: ORGANIZATION,
        identity_id: 'member1',
        type: 'member',
        at: AT,
    });
    return {
        db,
        adminToken: await organizationToken(
            'current', ORGANIZATION,
        ),
        memberToken: await organizationToken(
            'member1', ORGANIZATION,
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
    assert.equal(put.status, 201);
}

test('GET .../attributes under live type → 200 []',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'GET', ATTRS, adminToken,
    ));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
});

test('GET .../attributes under absent type → 404 '
+ 'record_types vocabulary',
async () => {
    const { db, adminToken } = await adminDb();
    const res = await handleRequest(db, req(
        'GET', ATTRS, adminToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

test('PUT create no ACL keys → 200; GET shows stamped '
+ 'DEFAULT_ATTRIBUTE_ACL_ROLES',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assert.equal(put.status, 201);
    const echo = await put.json() as AttributeWireRow;
    assert.deepEqual(echo, {
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
    assert.equal(get.status, 200);
    const row = await get.json() as AttributeWireRow;
    assert.deepEqual(
        row.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assert.deepEqual(
        row.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assert.equal(row.record_type_id, TYPE_ID);
    assert.equal(row.organization_id, ORGANIZATION);
});

test('PUT replace without ACL keys → 400',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const first = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assert.equal(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            name: 'Renamed',
        }),
    ));
    assert.equal(second.status, 400);
});

test('PUT replace with both ACL keys, no precondition '
+ '→ 200 (simple class)',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const first = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assert.equal(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore({
            name: 'Renamed',
            read_roles: ['admin'],
            write_roles: ['admin'],
        }),
    ));
    assert.equal(second.status, 201);
    const echo = await second.json() as AttributeWireRow;
    assert.equal(echo.name, 'Renamed');
    assert.deepEqual(echo.read_roles, ['admin']);
    assert.deepEqual(echo.write_roles, ['admin']);
});

test('PUT member → 403',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, memberToken, attrCore(),
    ));
    assert.equal(put.status, 403);
});

test('GET member → 200 including ACL arrays verbatim',
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
    assert.equal(put.status, 201);
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, memberToken,
    ));
    assert.equal(get.status, 200);
    const row = await get.json() as AttributeWireRow;
    assert.deepEqual(
        row.read_roles, ['member', 'auditor'],
    );
    assert.deepEqual(row.write_roles, ['admin']);
    // Collection also lists the row for the member.
    const list = await handleRequest(db, req(
        'GET', ATTRS, memberToken,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as AttributeWireRow[];
    assert.equal(rows.length, 1);
    assert.deepEqual(
        rows[0]!.read_roles, ['member', 'auditor'],
    );
});

test('DELETE unreferenced → 204; detail 404',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assert.equal(del.status, 204);
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(get.status, 404);
    assert.deepEqual(await get.json(), {
        error:
            'Not found: record_attributes/' + ATTR_ID,
    });
});

test('DELETE with live flow-graph binding → 409',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    const flowCreate = await handleRequest(db, req(
        'POST', '/organizations/1/flows/', adminToken, {
            id: 'flow-attr-restrict-1',
            flow: {
                name: 'Intake',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: 'flow-attr-restrict-1-pf',
            projectFlow: {
                project_id: 'proj-attr-restrict-1',
                flow_id: 'flow-attr-restrict-1',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId:
                'flow-attr-restrict-1-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [{
                    id: 'n1',
                    flow_id: 'flow-attr-restrict-1',
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
                    id: 'fna1',
                    flow_node_id: 'n1',
                    attribute_id: ATTR_ID,
                    mode: 'editable',
                    is_required: false,
                    action: 'added',
                    at: AT,
                }],
            },
        },
    ));
    assert.equal(flowCreate.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assert.equal(del.status, 409);
    const body = await del.json() as { error: string };
    assert.match(
        body.error,
        /flow\(s\) flow-attr-restrict-1/,
    );
    assert.match(
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
    assert.equal(still.status, 200);
});

test('DELETE while an instance head carries the value '
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
    assert.equal(putInst.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assert.equal(del.status, 409);
    const body = await del.json() as { error: string };
    assert.match(
        body.error,
        new RegExp(
            'record attribute ' + ATTR_ID
            + ' is referenced by',
        ),
    );
    assert.match(
        body.error,
        new RegExp(
            'instance\\(s\\) ' + INSTANCE_ID,
        ),
    );
    const still = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(still.status, 200);
});

test('DELETE after PATCH clears the value → 204',
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
    assert.equal(putInst.status, 201);
    const etag = putInst.headers.get('ETag')!;
    const clear = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_ID] },
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(clear.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', ATTR_DETAIL, adminToken,
    ));
    assert.equal(del.status, 204);
    const gone = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(gone.status, 404);
});

test('composed-op edit removedAttributeIds with a valued '
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
    assert.equal(putInst.status, 201);
    const requestsBefore = await db.pairs.getAll();
    const responsesBefore = await db.pairs.getAll();
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
    assert.equal(edit.status, 409);
    const err = await edit.json() as { error: string };
    assert.match(
        err.error,
        new RegExp(
            'instance\\(s\\) ' + INSTANCE_ID,
        ),
    );
    const typeGet = await handleRequest(db, req(
        'GET', TYPE_DETAIL, adminToken,
    ));
    assert.equal(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        name: string;
    };
    assert.equal(typeRow.name, 'Rental');
    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(attrGet.status, 200);
    assert.equal(
        (await db.pairs.getAll()).length,
        requestsBefore.length,
    );
    assert.equal(
        (await db.pairs.getAll()).length,
        responsesBefore.length,
    );
});
