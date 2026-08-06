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

// Instance PUT genesis — create-only posture (Task 15).
// GET detail is Task 16; pins use deriveInstanceHead for
// post-create value verification (message plane, not GET).

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
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            ...(extraHeaders ?? {}),
        },
        ...(body !== undefined
            ? { body: JSON.stringify(body) }
            : {}),
    });
}

async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
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
        state_at: AT,
        state_event_id: TYPE_ID + '-genesis',
    };
}

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assert.equal(put.status, 200);
}

async function putAttribute(
    db: MemoryDbAdapter,
    adminToken: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + '/' + attrId, adminToken, body,
    ));
    assert.equal(put.status, 200);
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

test('PUT {set:[…]} member, type exists → 200 + ETag; '
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
        'PUT', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(res.status, 200);
    const responseId = res.headers.get('Response-ID');
    assert.ok(
        responseId !== null && responseId !== '',
        'Response-ID present',
    );
    assert.equal(
        res.headers.get('ETag'),
        strongEtagOf(responseId!),
    );
    const echo = await res.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        set: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(echo, {
        id: INSTANCE_ID,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        set: [
            { attribute_id: ATTR_ID, value: 'Hello' },
        ],
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.equal(head.pairId, responseId);
    assert.deepEqual(head.values, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
});

test('PUT {set: []} → 200 (empty genesis; path-tier only)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, { set: [] },
    ));
    assert.equal(res.status, 200);
    const echo = await res.json() as { set: unknown[] };
    assert.deepEqual(echo.set, []);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.deepEqual(head.values, []);
});

test('PUT under absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'x' },
        ]),
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

test('PUT with If-Match header → 400 create unconditional',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        { set: [] },
        { [IF_MATCH_HEADER]: '"anything"' },
    ));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
        error: 'If-Match is not accepted on PUT: '
            + 'create is unconditional at '
            + INSTANCE_DETAIL,
    });
});

test('PUT {set, clear} → 400 unexpected key clear',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, {
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

test('PUT duplicate attribute_id in set → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, {
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

test('PUT value \'\' → 400 (G9)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, {
            set: [
                { attribute_id: ATTR_ID, value: '' },
            ],
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty/i);
});

test('PUT unwritable attribute (member, write_roles []) '
+ '→ 403 all-or-nothing',
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
        'PUT', INSTANCE_DETAIL, memberToken, {
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

test('PUT admin same locked attribute → 200 (bypass)',
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
        'PUT', INSTANCE_DETAIL, adminToken, {
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'ok',
                },
            ],
        },
    ));
    assert.equal(res.status, 200);
});

test('PUT bad value (number \'abc\') → 400 naming attribute',
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
        'PUT', INSTANCE_DETAIL, memberToken, {
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

test('PUT at address with live head → 409 (non-identical)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const first = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'one' },
        ]),
    ));
    assert.equal(first.status, 200);
    const second = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        setBody([
            { attribute_id: ATTR_ID, value: 'two' },
        ]),
    ));
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });
});

test('PUT at a tombstoned address → 409 (address spent)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    // Below-gate DELETE pair spends the address without
    // a live DELETE route (Task 18).
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
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, tombstone);
        },
    );
    const res = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
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

test('byte-identical PUT resend → 200 replay; ETag original',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const body = setBody([
        { attribute_id: ATTR_ID, value: 'same' },
    ]);
    const first = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(first.status, 200);
    const originalId = first.headers.get('Response-ID')!;
    const originalEtag = first.headers.get('ETag');
    const originalBody = await first.json();
    const second = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken, body,
    ));
    assert.equal(second.status, 200);
    assert.equal(
        second.headers.get('Response-ID'),
        originalId,
    );
    assert.equal(
        second.headers.get('ETag'),
        originalEtag,
    );
    assert.equal(
        second.headers.get('ETag'),
        strongEtagOf(originalId),
    );
    assert.deepEqual(await second.json(), originalBody);
    const responses = await db.responses.getAllWhere(
        'uri_prefix',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assert.equal(atAddress.length, 1);
});

test('two creates racing one address → first 200, second 409',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PUT', INSTANCE_DETAIL, memberToken,
            setBody([
                { attribute_id: ATTR_ID, value: 'race-a' },
            ]),
        )),
        handleRequest(db, req(
            'PUT', INSTANCE_DETAIL, memberToken,
            setBody([
                { attribute_id: ATTR_ID, value: 'race-b' },
            ]),
        )),
    ]);
    assert.deepEqual(
        [a.status, b.status].sort(),
        [200, 409],
    );
    const loser = a.status === 409 ? a : b;
    assert.deepEqual(await loser.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });
    const responses = await db.responses.getAllWhere(
        'uri_prefix',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + TYPE_ID
            + '/instances/',
    );
    const atAddress = responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    );
    assert.equal(
        atAddress.length, 1,
        'exactly one pair at the raced address',
    );
});
