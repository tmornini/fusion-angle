import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postInstancePatchOp,
    formDocumentMessagePairFor,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
    appendMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
    parseIfMatch,
} from '../api/message-pair.ts';
import {
    ApiError,
    HTTP_PRECONDITION_FAILED,
} from '../api/http-errors.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    instancesUriPrefix,
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

// Instance PATCH — If-Match + full-state revision (R5).
// Two pairs per PATCH: wire delta + PUT {values} revision.
// Gate ladder after replay; ETag is the revision pair id.

const AT = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-02T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const ATTR_NUM = generateIdentifier();
const ATTR_LOCKED = generateIdentifier();
const ATTR_SUBMIT = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const ORGANIZATION_B = generateIdentifier();
const FOREIGN_TYPE_ID = generateIdentifier();
const ATTR_UNKNOWN = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;
const WELL_FORMED_TAG = generateIdentifier();
const HEX64_TAG =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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

async function countInstanceMessagePairs(
    db: MemoryDbAdapter,
): Promise<number> {
    const prefix = instancesUriPrefix(
        ORGANIZATION, TYPE_ID,
    );
    const responses = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    return responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    ).length;
}

async function appendInstanceMessagePair(
    db: MemoryDbAdapter,
    organization: string,
    typeId: string,
    instanceId: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, unknown> | undefined,
    requestAt: string,
): Promise<string> {
    const pathname = '/organizations/' + organization
        + '/record-types/' + typeId
        + '/instances/' + instanceId;
    const messagePair = await formWriteMessagePair({
        method,
        pathname,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: pathname.slice(1).split('/'),
        headerFields: [],
        body: body ?? {},
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization,
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
    return messagePair.id;
}

test('PATCH fresh If-Match → 200 + new ETag; GET full '
+ 'merged state from ONE head pair',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 201);
    const headEtag = put.headers.get('ETag')!;
    const before = await countInstanceMessagePairs(db);
    const patch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'World',
                },
            ],
        },
        { [IF_MATCH_HEADER]: headEtag },
    ));
    assert.equal(patch.status, 201);
    const newEtag = patch.headers.get('ETag');
    assert.ok(newEtag !== null && newEtag !== '');
    assert.notEqual(newEtag, headEtag);
    const echo = await patch.json() as {
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
            { attribute_id: ATTR_ID, value: 'World' },
        ],
        clear: [],
    });
    const get = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('ETag'), newEtag);
    const body = await get.json() as {
        values: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(body.values, [
        { attribute_id: ATTR_ID, value: 'World' },
    ]);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.ok(
        newEtag !== null
        && isIdentifier(newEtag.slice(1, -1)),
    );
    assert.equal(newEtag, strongEtagOf(head.messagePairId));
    assert.equal(
        await countInstanceMessagePairs(db),
        before + 2,
        'each PATCH adds TWO pairs (wire + revision)',
    );
});

test('If-Match with the shared pair-id token succeeds '
+ 'for member and admin',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 201);
    const memberGet = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    const adminGet = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, adminToken,
    ));
    assert.equal(memberGet.status, 200);
    assert.equal(adminGet.status, 200);
    const shared = memberGet.headers.get('ETag');
    assert.ok(shared !== null);
    assert.equal(adminGet.headers.get('ETag'), shared);
    const memberPatch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Member',
                },
            ],
        },
        { [IF_MATCH_HEADER]: shared },
    ));
    assert.equal(memberPatch.status, 201);
    const afterMember = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(afterMember !== undefined);
    assert.equal(
        memberPatch.headers.get('ETag'),
        strongEtagOf(afterMember.messagePairId),
    );
    const adminPatch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Admin',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]:
                memberPatch.headers.get('ETag')!,
        },
    ));
    assert.equal(adminPatch.status, 201);
    const afterAdmin = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(afterAdmin !== undefined);
    assert.equal(
        adminPatch.headers.get('ETag'),
        strongEtagOf(afterAdmin.messagePairId),
    );
});

test('PATCH missing If-Match → 428',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 201);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
    ));
    assert.equal(res.status, 428);
    const body = await res.json() as {
        id: string;
        error?: string;
    };
    assert.equal(body.error, undefined);
    assert.equal(body.id, INSTANCE_ID);
    assert.ok(res.headers.get('ETag'));
});

test('PATCH stale If-Match → 412; re-GET + retry → 200',
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
        { set: [{ attribute_id: ATTR_ID, value: 'B' }] },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(pnXmXrxOWayANgDLdCjuBw.status, 201);
    const YiJPbufDpkyrZcZCYbUJpg =
        pnXmXrxOWayANgDLdCjuBw.headers.get('ETag')!;
    const stale = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'C' }] },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(stale.status, 412);
    const staleBody = await stale.json() as {
        id: string;
        error?: string;
    };
    assert.equal(staleBody.error, undefined);
    assert.equal(staleBody.id, INSTANCE_ID);
    assert.ok(stale.headers.get('ETag'));
    const freshGet = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(freshGet.status, 200);
    assert.equal(freshGet.headers.get('ETag'), YiJPbufDpkyrZcZCYbUJpg);
    const retry = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'C' }] },
        { [IF_MATCH_HEADER]: YiJPbufDpkyrZcZCYbUJpg },
    ));
    assert.equal(retry.status, 201);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.deepEqual(head?.values, [
        { attribute_id: ATTR_ID, value: 'C' },
    ]);
});

test('PATCH If-Match * / list / weak / unquoted → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 201);
    const malformed = [
        '*',
        '"a", "b"',
        'W/"weak"',
        'unquoted',
        '"' + HEX64_TAG + '"',
    ];
    for (const raw of malformed) {
        const res = await handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'x',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: raw },
        ));
        assert.equal(
            res.status, 400,
            'malformed If-Match: ' + raw,
        );
        assert.deepEqual(await res.json(), {
            error: 'If-Match must carry exactly one '
                + 'strong validator',
        });
    }
});

test('PATCH absent with If-Match → 412 (no live PUT)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        { [IF_MATCH_HEADER]: '"' + WELL_FORMED_TAG + '"' },
    ));
    assert.equal(res.status, 412);
    assert.deepEqual(await res.json(), {
        error: 'If-Match does not match the current '
            + 'instance at ' + INSTANCE_DETAIL,
    });
});

test('PATCH tombstoned → 404; never revives',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await appendInstanceMessagePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'gone',
                },
            ],
        },
        AT,
    );
    await appendInstanceMessagePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        'DELETE', undefined, AT2,
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        {
            [IF_MATCH_HEADER]:
                '"' + WELL_FORMED_TAG + '"',
        },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(head, undefined);
});

test('PATCH foreign instance id with If-Match → 412',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Beta');
    await appendInstanceMessagePair(
        db, ORGANIZATION_B, FOREIGN_TYPE_ID, INSTANCE_ID,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'foreign',
                },
            ],
        },
        AT,
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        {
            [IF_MATCH_HEADER]:
                '"' + WELL_FORMED_TAG + '"',
        },
    ));
    assert.equal(res.status, 412);
    assert.deepEqual(await res.json(), {
        error: 'If-Match does not match the current '
            + 'instance at ' + INSTANCE_DETAIL,
    });
});

test('PATCH set∩clear overlap → 400',
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
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /set and clear/i);
});

test('PATCH duplicate in set → 400',
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
                { attribute_id: ATTR_ID, value: 'a' },
                { attribute_id: ATTR_ID, value: 'b' },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /duplicate attribute_id/);
});

test('PATCH both empty → 400',
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
        { set: [], clear: [] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty|set|clear/i);
});

test('PATCH value \'\' → 400 (G9)',
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
                { attribute_id: ATTR_ID, value: '' },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty/i);
});

test('PATCH unknown attribute_id → 400',
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
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /unknown attribute_id/);
});

test('PATCH unwritable id in clear → 403 (ACL covers clear)',
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
    assert.equal(memberGet.status, 200);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_LOCKED] },
        {
            [IF_MATCH_HEADER]: memberGet.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

test('PATCH clear of absent value → 200; revision '
+ 'appended; values unchanged',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    // Known attribute never present on the head.
    await putAttribute(db, adminToken, ATTR_NUM, {
        name: 'Amount',
        attribute_type: 'number',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const before = await countInstanceMessagePairs(db);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_NUM] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 201);
    const afterHead = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.deepEqual(afterHead?.values, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(
        await countInstanceMessagePairs(db),
        before + 2,
    );
});

test('PATCH write-without-read attr → 200; echo has value',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_SUBMIT, {
        name: 'SubmitOnly',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(db, memberToken, []);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_SUBMIT,
                    value: 'secret-submit',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 201);
    const echo = await res.json() as {
        set: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(echo.set, [
        {
            attribute_id: ATTR_SUBMIT,
            value: 'secret-submit',
        },
    ]);
    const get = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    const body = await get.json() as {
        values: unknown[];
    };
    assert.deepEqual(body.values, []);
});

test('byte-identical PATCH resend → 200 REPLAY; ETag '
+ 'ORIGINAL even after later revisions',
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
    assert.equal(first.status, 201);
    const originalEtag = first.headers.get('ETag')!;
    const originalBody = await first.json();
    const originalResponseId =
        first.headers.get('Response-ID')!;
    // Later revision advances the head.
    const secondWrite = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'C',
                },
            ],
        },
        { [IF_MATCH_HEADER]: originalEtag },
    ));
    assert.equal(secondWrite.status, 201);
    assert.notEqual(
        secondWrite.headers.get('ETag'),
        originalEtag,
    );
    // Byte-identical resend of the FIRST patch (stale If-Match)
    // must replay BEFORE the outcome ladder.
    const replay = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(replay.status, 201);
    assert.equal(
        replay.headers.get('ETag'),
        originalEtag,
        'replay carries ORIGINAL etag',
    );
    assert.equal(
        replay.headers.get('Response-ID'),
        originalResponseId,
    );
    assert.deepEqual(
        await replay.json(),
        originalBody,
    );
});

test('two writers, same If-Match → first 200, second 412',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'base' },
    ]);
    const etag = put.headers.get('ETag')!;
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
            { [IF_MATCH_HEADER]: etag },
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
            { [IF_MATCH_HEADER]: etag },
        )),
    ]);
    assert.deepEqual(
        [a.status, b.status].sort(),
        [201, 412],
    );
});

// R9 pin: a wire pair formed against If-Match = H0 must
// 412 when the head advanced AFTER that pair was formed —
// never silently re-derive onto R1 and rebase values.
// Promise.all alone is not enough (timing can hide rebase).
test('R9: stale formed pair after head advance → 412 '
+ '(no silent rebase onto newer head)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'H0' },
    ]);
    const h0 = parseIfMatch(put.headers.get('ETag')!)!;
    const staleBody = {
        set: [
            {
                attribute_id: ATTR_ID,
                value: 'stale-writer',
            },
        ],
    };
    // Form the wire pair as the gate would, with If-Match
    // still targeting H0 (gate-equivalent check already
    // "passed" for this pair).
    const staleMessagePair = await formWriteMessagePair({
        method: 'PATCH',
        pathname: INSTANCE_DETAIL,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments:
            INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: [
            'organizations', ORGANIZATION,
            'record-types', TYPE_ID,
            'instances', INSTANCE_ID,
        ],
        headerFields: [
            {
                name: IF_MATCH_HEADER,
                value: strongEtagOf(h0),
            },
        ],
        body: staleBody,
        requesterIdentityId: 'nkgaOHZISTQrILTfPThWCA',
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseStatus: 200,
        responseBody: {
            id: INSTANCE_ID,
            organization_id: ORGANIZATION,
            record_type_id: TYPE_ID,
            set: staleBody.set,
            clear: [],
        },
        operationId: TEST_OPERATION_ID,
    });
    // Advance the real head past H0.
    const advance = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'advanced',
                },
            ],
        },
        { [IF_MATCH_HEADER]: strongEtagOf(h0) },
    ));
    assert.equal(advance.status, 201);
    const live = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(live !== undefined);
    assert.notEqual(live.messagePairId, h0);
    assert.deepEqual(live.values, [
        { attribute_id: ATTR_ID, value: 'advanced' },
    ]);
    // Stale writer must 412 on ifMatchTarget (= H0), not
    // merge against live and 200.
    await assert.rejects(
        () => postInstancePatchOp(
            db,
            [ORGANIZATION, TYPE_ID, INSTANCE_ID],
            staleBody,
            'nkgaOHZISTQrILTfPThWCA',
            staleMessagePair,
            ORGANIZATION,
            ['member'],
        ),
        (error: unknown) => {
            assert.ok(error instanceof ApiError);
            assert.equal(
                error.status,
                HTTP_PRECONDITION_FAILED,
            );
            assert.match(
                error.message,
                /If-Match does not match/,
            );
            return true;
        },
    );
    const after = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.deepEqual(after?.values, [
        { attribute_id: ATTR_ID, value: 'advanced' },
    ]);
    assert.equal(after?.messagePairId, live.messagePairId);
});

test('formed revision pair carries no predecessor fields',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const revision = await formDocumentMessagePairFor(db, {
        routePattern: INSTANCE_DETAIL_PATTERN,
        params: [ORGANIZATION, TYPE_ID, INSTANCE_ID],
        method: 'PUT',
        body: {
            values: [
                {
                    attribute_id: ATTR_ID,
                    value: 'stale-merge',
                },
            ],
        },
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        response: { status: 200, body: {} },
        operationId: TEST_OPERATION_ID,
    });
    assert.equal('follows' in revision, false);
    assert.equal('supersedes' in revision, false);
});

test('ETag/ACL interplay: unreadable write moves head; '
+ 'blind writer 412s, re-GETs, retries → converges',
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
        write_roles: ['admin'],
    });
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'public' },
    ]);
    const e0 = put.headers.get('ETag')!;
    // Admin writes an unreadable (to member) attribute —
    // head ETag advances.
    const adminPatch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken,
        {
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'hidden',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(adminPatch.status, 201);
    const YiJPbufDpkyrZcZCYbUJpg = adminPatch.headers.get('ETag')!;
    assert.notEqual(YiJPbufDpkyrZcZCYbUJpg, e0);
    // Member still holding e0 412s.
    const blind = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'updated',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(blind.status, 412);
    // Re-GET: member does not see secret; ETag is the
    // shared head pair id; limited header still appears.
    const reget = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(reget.status, 200);
    const memberEtag = reget.headers.get('ETag')!;
    assert.notEqual(memberEtag, e0);
    assert.equal(memberEtag, YiJPbufDpkyrZcZCYbUJpg);
    assert.equal(
        reget.headers.get(
            'Authorization-Limited-Attributes',
        ),
        'true',
    );
    const visible = await reget.json() as {
        values: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(visible.values, [
        { attribute_id: ATTR_ID, value: 'public' },
    ]);
    const retry = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'updated',
                },
            ],
        },
        { [IF_MATCH_HEADER]: memberEtag },
    ));
    assert.equal(retry.status, 201);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    const byId = new Map(
        head!.values.map(
            (v) => [v.attribute_id, v.value],
        ),
    );
    assert.equal(byId.get(ATTR_ID), 'updated');
    assert.equal(byId.get(ATTR_LOCKED), 'hidden');
});

test('pair count: each PATCH adds TWO pairs',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    assert.equal(await countInstanceMessagePairs(db), 2);
    await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'B',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(await countInstanceMessagePairs(db), 4);
});
