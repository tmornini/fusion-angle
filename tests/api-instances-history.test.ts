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
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
    strongEtagOf,
    IF_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Instance GET history — full-state revision chain (Task 19).
// Wire DESC; each entry full state projected by CURRENT read
// ACL; miss → missedReadError (R2).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-hist-1';
const ATTR_PUBLIC = 'attr-hist-pub';
const ATTR_SECRET = 'attr-hist-sec';
const INSTANCE_ID = 'inst-hist-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;
const INSTANCE_HISTORY = INSTANCE_DETAIL + '/versions';

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
        name: 'History Type',
        description: 'hist',
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

async function seedPublicAndSecretAttrs(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    await putAttribute(db, adminToken, ATTR_SECRET, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
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

async function patchInstance(
    db: MemoryDbAdapter,
    token: string,
    ifMatch: string,
    body: Record<string, unknown>,
): Promise<Response> {
    return handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, token, body,
        { [IF_MATCH_HEADER]: ifMatch },
    ));
}

async function appendInstancePair(
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
    const pair = await formWritePair({
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
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

interface HistoryEntry {
    at: string;
    etag: string;
    values: { attribute_id: string; value: string }[];
}

test('history genesis + 2 PATCHes → 200, three entries, '
+ '(at,id) DESC; index 0 == current head',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });

    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_PUBLIC, value: 'v0' },
    ]);
    assert.equal(put.status, 201);
    const etag0 = put.headers.get('ETag')!;

    const patch1 = await patchInstance(
        db, memberToken, etag0, {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'v1',
                },
            ],
        },
    );
    assert.equal(patch1.status, 201);
    const etag1 = patch1.headers.get('ETag')!;

    const patch2 = await patchInstance(
        db, memberToken, etag1, {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'v2',
                },
            ],
        },
    );
    assert.equal(patch2.status, 201);
    const etag2 = patch2.headers.get('ETag')!;

    const detail = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(detail.status, 200);
    assert.equal(detail.headers.get('ETag'), etag2);

    const history = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assert.equal(history.status, 200);
    const entries = await history.json() as HistoryEntry[];
    assert.equal(entries.length, 3);

    // DESC: index 0 is current head (etag sans quotes).
    assert.equal(
        entries[0]!.etag,
        etag2.replaceAll('"', ''),
    );
    assert.equal(
        strongEtagOf(entries[0]!.etag),
        etag2,
    );
    assert.deepEqual(entries[0]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'v2' },
    ]);
    assert.deepEqual(entries[1]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'v1' },
    ]);
    assert.deepEqual(entries[2]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'v0' },
    ]);
    assert.equal(
        entries[1]!.etag,
        etag1.replaceAll('"', ''),
    );
    assert.equal(
        entries[2]!.etag,
        etag0.replaceAll('"', ''),
    );

    // Wire (at, id) DESC — timestamps non-increasing.
    assert.ok(entries[0]!.at >= entries[1]!.at);
    assert.ok(entries[1]!.at >= entries[2]!.at);

    // Each entry is FULL state (not a delta).
    for (const entry of entries) {
        assert.ok(Array.isArray(entry.values));
        assert.equal(
            typeof entry.etag === 'string'
            && !entry.etag.includes('"'),
            true,
            'etag is 64-hex, no quotes in JSON',
        );
        assert.equal(typeof entry.at, 'string');
    }
});

test('history projection: member sees only currently-'
+ 'readable values in EVERY entry; admin sees all',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedPublicAndSecretAttrs(db, adminToken);

    const put = await putInstance(db, adminToken, [
        {
            attribute_id: ATTR_PUBLIC,
            value: 'public-0',
        },
        {
            attribute_id: ATTR_SECRET,
            value: 'secret-0',
        },
    ]);
    assert.equal(put.status, 201);
    const etag0 = put.headers.get('ETag')!;

    const patch1 = await patchInstance(
        db, adminToken, etag0, {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'public-1',
                },
                {
                    attribute_id: ATTR_SECRET,
                    value: 'secret-1',
                },
            ],
        },
    );
    assert.equal(patch1.status, 201);

    const memberHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assert.equal(memberHist.status, 200);
    const memberEntries =
        await memberHist.json() as HistoryEntry[];
    assert.equal(memberEntries.length, 2);
    for (const entry of memberEntries) {
        assert.equal(entry.values.length, 1);
        assert.equal(
            entry.values[0]!.attribute_id,
            ATTR_PUBLIC,
        );
        assert.ok(
            !entry.values.some(
                (v) => v.attribute_id === ATTR_SECRET,
            ),
            'member never sees secret in any revision',
        );
    }
    assert.equal(
        memberEntries[0]!.values[0]!.value,
        'public-1',
    );
    assert.equal(
        memberEntries[1]!.values[0]!.value,
        'public-0',
    );

    const adminHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, adminToken,
    ));
    assert.equal(adminHist.status, 200);
    const adminEntries =
        await adminHist.json() as HistoryEntry[];
    assert.equal(adminEntries.length, 2);
    for (const entry of adminEntries) {
        assert.equal(entry.values.length, 2);
        const byId = new Map(
            entry.values.map(
                (v) => [v.attribute_id, v.value],
            ),
        );
        assert.ok(byId.has(ATTR_PUBLIC));
        assert.ok(byId.has(ATTR_SECRET));
    }
    const head = adminEntries[0]!;
    const byId = new Map(
        head.values.map((v) => [v.attribute_id, v.value]),
    );
    assert.equal(byId.get(ATTR_PUBLIC), 'public-1');
    assert.equal(byId.get(ATTR_SECRET), 'secret-1');
});

test('history absent instance → 404 via missedReadError',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'GET',
        INSTANCES + 'inst-missing/versions',
        memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: record_instances/inst-missing',
    });
});

test('history tombstoned → 404 via missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_PUBLIC, value: 'live' },
    ]);
    assert.equal(put.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(del.status, 204);

    const res = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_ID,
    });
});

test('history foreign instance id → 404 via '
+ 'missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedOrganizationDocument(db, 'B', 'Beta');
    await appendInstancePair(
        db, 'B', 'rt-foreign', INSTANCE_ID,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'foreign',
                },
            ],
        },
        AT,
    );
    const res = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_ID,
    });
});

test('history absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION
            + '/record-types/no-type/instances/'
            + INSTANCE_ID + '/versions',
        memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/no-type',
    });
});
