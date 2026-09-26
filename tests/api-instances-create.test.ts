import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
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
    runWrite,
    attemptFor,
    formWriteMessagePair,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
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
} from '../shared/types.ts';
import {
    apiRequest,
    pairIdOf,
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
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(extraHeaders !== undefined
            ? { headers: extraHeaders } : {}),
        ...(operationId !== undefined ? { operationId } : {}),
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
const DECLARED = { [IF_NONE_MATCH_HEADER]: '*' };

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
        DECLARED,
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
        DECLARED,
    ));
    assertStrictEquals(res.status, 400);
});

Deno.test('PATCH create with If-Match is 400', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"' + WELL_FORMED_TAG + '"' },
    ));
    assertStrictEquals(res.status, 400);
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
        DECLARED,
    ));
    assertStrictEquals(res.status, 201);
    const responseId = pairIdOf(res);
    assert(
        responseId !== null && isIdentifier(responseId),
        'ETag present',
    );
    assertEquals(await res.json(), {
        id: INSTANCE_ID,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        values: [
            { attribute_id: ATTR_ID, value: 'Hello' },
        ],
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(responseId, head.messagePairId);
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
        DECLARED,
    ));
    assertStrictEquals(res.status, 201);
    const state = await res.json() as { values: unknown[] };
    assertEquals(state.values, []);
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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
        DECLARED,
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

Deno.test('PATCH create at a tombstoned document → 409 spent',
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([tombstone]),
        [tombstone],
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'after' },
        ]),
        DECLARED,
    ));
    assertStrictEquals(res.status, 409);
    assertEquals(await res.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });
});

Deno.test('a create resend without If-Match is 428'
+ ' and stores nothing',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const body = setBody([
        { attribute_id: ATTR_ID, value: 'same' },
    ]);
    const operationId = generateIdentifier();
    const first = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        DECLARED, operationId,
    ));
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        undefined, operationId,
    ));
    // A live instance without If-Match is 428. The
    // first create's rows stay stored.
    assertStrictEquals(second.status, 428);
    assertStrictEquals(
        (await second.json()).error,
        'If-Match or If-None-Match is required to PATCH '
            + INSTANCE_DETAIL,
    );
    const responses = await db.messagePairs.getCollectionPairs(
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const pairsAt = responses.filter(
        (r) => r.name === INSTANCE_ID,
    );
    assertStrictEquals(pairsAt.length, 2);
});

Deno.test('same response body with a fresh If-Match is'
+ ' 200 and stores nothing',
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
        DECLARED,
    ));
    assertStrictEquals(first.status, 201);
    const headEtag = first.headers.get('ETag');
    assert(headEtag !== null && headEtag !== '');
    const prefix = '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_ID
        + '/instances/';
    const before = (await db.messagePairs.getCollectionPairs(prefix,
    )).filter((row) => row.name === INSTANCE_ID);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        {
            [IF_MATCH_HEADER]: headEtag,
            'operation-id': generateIdentifier(),
        },
    ));
    assertStrictEquals(second.status, 200);
    const after = (await db.messagePairs.getCollectionPairs(prefix,
    )).filter((row) => row.name === INSTANCE_ID);
    assertStrictEquals(
        after.length,
        before.length,
        'same response body stores nothing',
    );
});

Deno.test('two creates racing one document → first 201, '
+ 'second 412',
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
            DECLARED,
        )),
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            setBody([
                { attribute_id: ATTR_ID, value: 'race-b' },
            ]),
            DECLARED,
        )),
    ]);
    assertEquals(
        [a.status, b.status].sort(),
        [201, 412],
    );
    const responses = await db.messagePairs.getCollectionPairs(
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const pairsAt = responses.filter(
        (r) => r.name === INSTANCE_ID,
    );
    assertStrictEquals(
        pairsAt.length, 2,
        'winner writes wire PATCH + inner PUT',
    );
});

// The measured 403: an admin's keyless nested create stored
// no role keys, attributeSchemaOf read [] for both, and a
// member's value write was forbidden. The gate now refuses
// the keyless create; a keyed one lets the member write.
Deno.test('an admin keyless nested attribute create is 400',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTRS + ATTR_ID, adminToken, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
        },
    ));
    assertStrictEquals(put.status, 400);
    assertEquals(await put.json(), {
        error: 'missing required key "read_roles"'
            + ' for AttributeDocumentBody',
    });
});

Deno.test('a keyed nested create lets a member write its'
+ ' value',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([{ attribute_id: ATTR_ID, value: 'Hello' }]),
        DECLARED,
    ));
    assertStrictEquals(res.status, 201);
});

async function pairsAtInstance(
    db: MemoryDbAdapter,
    instanceId: string,
): Promise<number> {
    const pairs = await db.messagePairs.getCollectionPairs(
        INSTANCES,
    );
    return pairs.filter((pair) => pair.name === instanceId)
        .length;
}

Deno.test('a headerless instance create is 428', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const instanceId = generateIdentifier();
    const res = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        { set: [] },
    ));
    assertStrictEquals(res.status, 428);
    assertStrictEquals(await pairsAtInstance(db, instanceId), 0);
});

Deno.test('a declared instance create answers its whole state',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const instanceId = generateIdentifier();
    const value = { attribute_id: ATTR_ID, value: 'Hello' };
    const res = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        setBody([value]), DECLARED,
    ));
    assertStrictEquals(res.status, 201);
    assertEquals(await res.json(), {
        id: instanceId,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        values: [value],
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, instanceId,
    );
    assert(head !== undefined);
    assertStrictEquals(pairIdOf(res), head.messagePairId);
});

Deno.test('a declared create over a live instance is 412',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const instanceId = generateIdentifier();
    const first = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        { set: [] }, DECLARED,
    ));
    assertStrictEquals(first.status, 201);
    const second = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        { set: [] }, DECLARED,
    ));
    assertStrictEquals(second.status, 412);
});

Deno.test('a declared create over a tombstone is 409',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const instanceId = generateIdentifier();
    const created = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        { set: [] }, DECLARED,
    ));
    assertStrictEquals(created.status, 201);
    const deleted = await handleRequest(db, req(
        'DELETE', INSTANCES + instanceId, adminToken,
    ));
    assertStrictEquals(deleted.status, 204);
    const again = await handleRequest(db, req(
        'PATCH', INSTANCES + instanceId, memberToken,
        { set: [] }, DECLARED,
    ));
    assertStrictEquals(again.status, 409);
    assertEquals(await again.json(), {
        error: 'instance already exists at '
            + INSTANCES + instanceId,
    });
});

Deno.test('a PATCH naming a never-written instance is 412',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCES + generateIdentifier(), memberToken,
        setBody([{ attribute_id: ATTR_ID, value: 'x' }]),
        { [IF_MATCH_HEADER]: '"' + WELL_FORMED_TAG + '"' },
    ));
    assertStrictEquals(res.status, 412);
});
