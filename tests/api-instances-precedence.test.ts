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
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    IF_MATCH_HEADER,
    strongEtagOf,
} from '../api/message-pair.ts';
import {
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
import {
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';

// Task 20 covenant suite — 12-step status ladder (earlier
// step answers) + If-Match / ETag cross-pins. Each pin is
// one adjacent pair; production already implements the
// order (no code unless a pin fails).

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const ATTR_NUM = generateIdentifier();
const ATTR_LOCKED = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const ORGANIZATION_B = generateIdentifier();
const ATTR_UNKNOWN = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;
const FOREIGN_TYPE =
    '/organizations/' + ORGANIZATION_B + '/record-types/' + TYPE_ID;

function req(
    method: string,
    path: string,
    token: string | undefined,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
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

async function putInstance(
    db: MemoryDbAdapter,
    token: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
): Promise<Response> {
    return handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, token,
        { set: [...set] },
    ));
}

// --- Step 1–3: auth / fence / policy ---

Deno.test('1 unauthenticated anything → 401',
async () => {
    const { db } = await adminDb();
    const res = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, undefined,
    ));
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assert(
        typeof body.error === 'string'
            && body.error.length > 0,
    );
});

Deno.test('2 wrong path org + admin-only verb → 403 org '
+ 'fence (not route policy)',
async () => {
    const { db, adminToken } = await adminDb();
    // Nested record-types detail (matched route) — not
    // the flat facade. Extra segments would miss the
    // table and exchange into B instead of fencing.
    const res = await handleRequest(db, req(
        'PUT', FOREIGN_TYPE, adminToken, typeBody(),
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: path organization'
            + ' does not match the token'
            + ' organization',
    });
});

Deno.test('3 member PUT record-types/:id (own org) → 403 '
+ 'policy',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, memberToken, typeBody(),
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: PUT ' + TYPE_DETAIL
            + ' requires a role this principal lacks',
    });
});

// --- Step 4–5: parent / existence before dialect ---

Deno.test('4 admin PATCH instance under absent type → 404 '
+ 'record_types',
async () => {
    const { db, adminToken } = await adminDb();
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken,
        { set: [] },
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

Deno.test('5 PATCH absent instance w/o If-Match → 201 '
+ 'create (not 428)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [] },
    ));
    assertStrictEquals(res.status, 201);
    assertNotStrictEquals(res.status, 428);
});

// --- Step 6–7: If-Match before body shape ---

Deno.test('6 PATCH live, no If-Match, garbage body → 428 '
+ '(before body shape)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { not_a_valid_patch: true },
    ));
    assertStrictEquals(res.status, 428);
    const body = await res.json() as {
        id: string;
        error?: string;
    };
    assertStrictEquals(body.error, undefined);
    assertStrictEquals(body.id, INSTANCE_ID);
});

Deno.test('7 PATCH stale If-Match + garbage body → 412 '
+ '(before 400)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const e0 = put.headers.get('ETag')!;
    const pnXmXrxOWayANgDLdCjuBw = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'B',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assertStrictEquals(pnXmXrxOWayANgDLdCjuBw.status, 201);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { not_a_valid_patch: true },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assertStrictEquals(res.status, 412);
    const staleBody = await res.json() as {
        id: string;
        error?: string;
    };
    assertStrictEquals(staleBody.error, undefined);
    assertStrictEquals(staleBody.id, INSTANCE_ID);
});

// --- Step 8–11: body / ACL / value after fresh match ---

Deno.test('8 PATCH fresh If-Match + set∩clear → 400 shape',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
            clear: [ATTR_ID],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(err.error, /set and clear/i);
});

Deno.test('9 fresh If-Match + unknown attribute → 400 '
+ '(before ACL)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_UNKNOWN,
                    value: 'x',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(err.error, /unknown attribute_id/);
});

Deno.test('10 fresh If-Match + unwritable known id → 403',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [],
    });
    await putInstance(db, adminToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
        { attribute_id: ATTR_LOCKED, value: 's' },
    ]);
    const memberGet = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(memberGet.status, 200);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_LOCKED] },
        {
            [IF_MATCH_HEADER]: memberGet.headers.get('ETag')!,
        },
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

Deno.test('11 fresh If-Match + writable id, bad value → 400',
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
    const put = await putInstance(db, memberToken, []);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_NUM,
                    value: 'abc',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assertStrictEquals(res.status, 400);
    const err = await res.json() as { error: string };
    assertMatch(
        err.error,
        /value for attribute "Amount"/,
    );
});

// --- Step 12: spent-address 409 is last (in-tx) ---

Deno.test('12 PATCH create race at one address → 201/428 '
+ '(in-tx, last)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-a',
                    },
                ],
            },
        )),
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-b',
                    },
                ],
            },
        )),
    ]);
    assertEquals(
        [a.status, b.status].sort(),
        [201, 428],
    );
});

// --- Cross-pins ---

Deno.test('If-Match is hash-covered: identical body, different '
+ 'If-Match → no replay cross-hit',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const e0 = put.headers.get('ETag')!;
    const body = {
        set: [
            { attribute_id: ATTR_ID, value: 'B' },
        ],
    };
    const first = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: e0 },
    ));
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID')!;
    const YiJPbufDpkyrZcZCYbUJpg = first.headers.get('ETag')!;
    assertNotStrictEquals(YiJPbufDpkyrZcZCYbUJpg, e0);
    // Same body, fresh If-Match: a NEW message (not a
    // byte-identical replay of first).
    const second = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: YiJPbufDpkyrZcZCYbUJpg },
    ));
    assertStrictEquals(second.status, 201);
    assertNotStrictEquals(
        second.headers.get('Response-ID'),
        firstId,
        'different If-Match must not replay first',
    );
    assertNotStrictEquals(
        second.headers.get('ETag'),
        YiJPbufDpkyrZcZCYbUJpg,
    );
    // Control: byte-identical resend of first still
    // replays (If-Match is in the hash).
    const replay = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: e0 },
    ));
    assertStrictEquals(replay.status, 201);
    assertStrictEquals(
        replay.headers.get('Response-ID'),
        firstId,
    );
});

Deno.test('instance ETag is the head pair id',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(res.status, 200);
    const header = res.headers.get('ETag');
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assert(header !== null);
    assert(isIdentifier(header.slice(1, -1)));
    assertStrictEquals(header, strongEtagOf(head.messagePairId));
});

Deno.test('list-row etag == detail ETag validator sans quotes',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    const list = await handleRequest(db, req(
        'GET', INSTANCES, memberToken,
    ));
    assertStrictEquals(list.status, 200);
    const rows = await list.json() as {
        id: string;
        etag: string;
    }[];
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.id, INSTANCE_ID);
    assert(isIdentifier(rows[0]!.etag));
    const detail = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(detail.status, 200);
    const detailEtag = detail.headers.get('ETag');
    assert(detailEtag !== null);
    assertStrictEquals(
        rows[0]!.etag,
        detailEtag.slice(1, -1),
    );
});
