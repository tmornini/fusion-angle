import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
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
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

// Instance create is public PATCH (Task 20). Public PUT
// is 405. Pins use deriveInstanceHead for post-create
// value verification (message plane, not GET).

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = 'sleWPUnGznNnXLzcfFswjg';
const ATTR_ID = generateIdentifier();
const ATTR_NUM = generateIdentifier();
const ATTR_LOCKED = generateIdentifier();
const INSTANCE_ID = generateIdentifier();

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

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assertStrictEquals(put.status, 201);
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
    assertStrictEquals(put.status, 201);
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

const WELL_FORMED_TAG = generateIdentifier();

Deno.test('public instance PUT is 405', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        { set: [] },
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PATCH create without If-Match is 201',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
    ));
    assertStrictEquals(res.status, 201);
});

Deno.test('PATCH create with clear is 400', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, {
            set: [],
            clear: [],
        },
    ));
    assertStrictEquals(res.status, 400);
});

Deno.test('PATCH create with If-Match is 412', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"' + WELL_FORMED_TAG + '"' },
    ));
    assertStrictEquals(res.status, 412);
});

Deno.test('PATCH {set:[…]} member, type exists → 201 + ETag; '
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
    assertStrictEquals(res.status, 201);
    const responseId = res.headers.get('Response-ID');
    assert(
        responseId !== null && responseId !== '',
        'Response-ID present',
    );
    const createEtag = res.headers.get('ETag');
    assert(
        createEtag !== null
        && isIdentifier(createEtag.slice(1, -1)),
    );
    assertNotStrictEquals(createEtag, strongEtagOf(responseId!));
    const echo = await res.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        set: { attribute_id: string; value: string }[];
        clear: string[];
    };
    assertEquals(echo, {
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
    assert(head !== undefined);
    assertNotStrictEquals(head.messagePairId, responseId);
    assertStrictEquals(
        createEtag,
        strongEtagOf(head.messagePairId),
    );
    assertEquals(head.values, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
});

Deno.test('PATCH {set: []} empty genesis; path-tier only',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, { set: [] },
    ));
    assertStrictEquals(res.status, 201);
    const echo = await res.json() as { set: unknown[] };
    assertEquals(echo.set, []);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assertEquals(head.values, []);
});

Deno.test('PATCH create under absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'x' },
        ]),
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

Deno.test('PATCH create malformed If-Match → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"' + 'a'.repeat(64) + '"' },
    ));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'If-Match must carry exactly one '
            + 'strong validator',
    });
});

Deno.test('PATCH create {set, clear} → 400 unexpected clear',
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
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(
        err.error,
        /unexpected key "clear" for InstancePutBody/,
    );
});

Deno.test('PATCH create duplicate attribute_id in set → 400',
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
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(err.error, /duplicate attribute_id/);
});

Deno.test('PATCH create value \'\' → 400 (G9)',
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
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(err.error, /empty/i);
});

Deno.test('PATCH create unwritable attribute (member, '
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
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

Deno.test('PATCH create admin same locked attribute → 201 '
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
    assertStrictEquals(res.status, 201);
});

Deno.test('PATCH create bad value (number \'abc\') → 400 '
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
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(
        err.error,
        /value for attribute "Amount"/,
    );
    assertMatch(err.error, /number/i);
});

Deno.test('PATCH create at live head without If-Match → 428',
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
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'two' },
        ]),
    ));
    assertStrictEquals(second.status, 428);
});

Deno.test('PATCH create at a tombstoned address → 409 spent',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const tombstone = await formWriteMessagePair({
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
        MESSAGE_TABLES,
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
    assertStrictEquals(res.status, 409);
    assertEquals(await res.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });
});

Deno.test('byte-identical PATCH create resend → 201 replay',
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
    assertStrictEquals(first.status, 201);
    const originalId = first.headers.get('Response-ID')!;
    const originalEtag = first.headers.get('ETag');
    const originalBody = await first.json();
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
    ));
    assertStrictEquals(second.status, 201);
    assertStrictEquals(
        second.headers.get('Response-ID'),
        originalId,
    );
    assertStrictEquals(
        second.headers.get('ETag'),
        originalEtag,
    );
    assertEquals(await second.json(), originalBody);
    const responses = await db.messagePairs.getAllWhere(
        'uri_collection',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assertStrictEquals(atAddress.length, 2);
});

Deno.test('same-body instance PATCH with new Operation-ID'
+ ' still appends 201',
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
    assertStrictEquals(first.status, 201);
    const headEtag = first.headers.get('ETag');
    assert(headEtag !== null && headEtag !== '');
    const prefix = '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_ID
        + '/instances/';
    const before = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === INSTANCE_ID);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        {
            [IF_MATCH_HEADER]: headEtag,
            'operation-id': generateIdentifier(),
        },
    ));
    assertStrictEquals(second.status, 201);
    const after = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === INSTANCE_ID);
    assertStrictEquals(
        after.length,
        before.length + 2,
        'same-body PATCH still appends wire + revision',
    );
});

Deno.test('two creates racing one address → first 201, '
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
    assertEquals(
        [a.status, b.status].sort(),
        [201, 428],
    );
    const responses = await db.messagePairs.getAllWhere(
        'uri_collection',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assertStrictEquals(
        atAddress.length, 2,
        'winner writes wire PATCH + inner PUT',
    );
});
