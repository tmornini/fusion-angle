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
    appendMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
    HEX64,
} from '../api/message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Instance create is public PATCH (Task 20). Public PUT
// is 405. Pins use deriveInstanceHead for post-create
// value verification (message plane, not GET).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-inst-1';
const ATTR_ID = 'attr-inst-1';
const ATTR_NUM = 'attr-inst-num';
const ATTR_LOCKED = 'attr-inst-locked';
const INSTANCE_ID = 'inst-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;

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

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assert.equal(put.status, 201);
}

async function putAttribute(
    db: MemoryDbAdapter,
    adminToken: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + attrId, adminToken, body,
    ));
    assert.equal(put.status, 201);
}

async function seedWritableTextAttr(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    await putAttribute(db, adminToken, ATTR_ID, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

function setBody(
    entries: readonly {
        attribute_id: string;
        value: string;
    }[],
): Record<string, unknown> {
    return { set: [...entries] };
}

const WELL_FORMED_TAG =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('public instance PUT is 405', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        { set: [] },
    ));
    assert.equal(res.status, 405);
});

test('PATCH create without If-Match is 201',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
    ));
    assert.equal(res.status, 201);
});

test('PATCH create with clear is 400', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [],
            clear: [],
        },
    ));
    assert.equal(res.status, 400);
});

test('PATCH create with If-Match is 412', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"' + WELL_FORMED_TAG + '"' },
    ));
    assert.equal(res.status, 412);
});

test('PATCH {set:[…]} member, type exists → 201 + ETag; '
+ 'head shows values',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const body = setBody([
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(res.status, 201);
    const responseId = res.headers.get('Response-ID');
    assert.ok(
        responseId !== null && responseId !== '',
        'Response-ID present',
    );
    const createEtag = res.headers.get('ETag');
    assert.ok(
        createEtag !== null
        && HEX64.test(createEtag.slice(1, -1)),
    );
    assert.notEqual(createEtag, strongEtagOf(responseId!));
    const echo = await res.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        set: { attribute_id: string; value: string }[];
        clear: string[];
    };
    assert.deepEqual(echo, {
        id: INSTANCE_ID,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        set: [
            { attribute_id: ATTR_ID, value: 'Hello' },
        ],
        clear: [],
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.notEqual(head.pairId, responseId);
    assert.deepEqual(head.values, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
});

test('PATCH {set: []} empty genesis; path-tier only',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, { set: [] },
    ));
    assert.equal(res.status, 201);
    const echo = await res.json() as { set: unknown[] };
    assert.deepEqual(echo.set, []);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.deepEqual(head.values, []);
});

test('PATCH create under absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'x' },
        ]),
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

test('PATCH create malformed If-Match → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"anything"' },
    ));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
        error: 'If-Match must carry exactly one '
            + 'strong validator',
    });
});

test('PATCH create {set, clear} → 400 unexpected clear',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [],
            clear: [ATTR_ID],
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /unexpected key "clear" for InstancePutBody/,
    );
});

test('PATCH create duplicate attribute_id in set → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                { attribute_id: ATTR_ID, value: 'a' },
                { attribute_id: ATTR_ID, value: 'b' },
            ],
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /duplicate attribute_id/);
});

test('PATCH create value \'\' → 400 (G9)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                { attribute_id: ATTR_ID, value: '' },
            ],
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty/i);
});

test('PATCH create unwritable attribute (member, '
+ 'write_roles []) → 403 all-or-nothing',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [],
    });
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'nope',
                },
            ],
        },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

test('PATCH create admin same locked attribute → 201 '
+ '(bypass)',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [],
    });
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken, {
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'ok',
                },
            ],
        },
    ));
    assert.equal(res.status, 201);
});

test('PATCH create bad value (number \'abc\') → 400 '
+ 'naming attribute',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_NUM, {
        name: 'Amount',
        attribute_type: 'number',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [
                {
                    attribute_id: ATTR_NUM,
                    value: 'abc',
                },
            ],
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /value for attribute "Amount"/,
    );
    assert.match(err.error, /number/i);
});

test('PATCH create at live head without If-Match → 428',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const first = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'one' },
        ]),
    ));
    assert.equal(first.status, 201);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'two' },
        ]),
    ));
    assert.equal(second.status, 428);
});

test('PATCH create at a tombstoned address → 409 spent',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const tombstone = await formWritePair({
        method: 'DELETE',
        pathname: INSTANCE_DETAIL,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments:
            INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: [
            'organizations', ORGANIZATION,
            'record-types', TYPE_ID,
            'instances', INSTANCE_ID,
        ],
        headerFields: [],
        body: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, tombstone);
        },
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'after' },
        ]),
    ));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });
});

test('byte-identical PATCH create resend → 201 replay',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const body = setBody([
        { attribute_id: ATTR_ID, value: 'same' },
    ]);
    const first = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(first.status, 201);
    const originalId = first.headers.get('Response-ID')!;
    const originalEtag = first.headers.get('ETag');
    const originalBody = await first.json();
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(second.status, 201);
    assert.equal(
        second.headers.get('Response-ID'),
        originalId,
    );
    assert.equal(
        second.headers.get('ETag'),
        originalEtag,
    );
    assert.deepEqual(await second.json(), originalBody);
    const responses = await db.responses.getAllWhere(
        'uri_collection',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assert.equal(atAddress.length, 2);
});

test('two creates racing one address → first 201, '
+ 'second 428',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            setBody([
                { attribute_id: ATTR_ID, value: 'race-a' },
            ]),
        )),
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            setBody([
                { attribute_id: ATTR_ID, value: 'race-b' },
            ]),
        )),
    ]);
    assert.deepEqual(
        [a.status, b.status].sort(),
        [201, 428],
    );
    const responses = await db.responses.getAllWhere(
        'uri_collection',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assert.equal(
        atAddress.length, 2,
        'winner writes wire PATCH + inner PUT',
    );
});
