import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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
    formWriteMessagePair,
    appendMessagePair,
    strongEtagOf,
    IF_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
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
import {
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';

// Instance GET history — full-state revision chain (Task 19).
// Wire DESC; each entry full state projected by CURRENT read
// ACL; miss → missedReadError (R2).

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = generateIdentifier();
const ATTR_PUBLIC = generateIdentifier();
const ATTR_SECRET = generateIdentifier();
const ATTR_RETIRED = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const ORGANIZATION_B = generateIdentifier();
const FOREIGN_TYPE_ID = generateIdentifier();

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
        ...(extraHeaders !== undefined
            ? { headers: extraHeaders } : {}),
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
    await seedMembershipPair(db, generateIdentifier(), {
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

interface HistoryEntry {
    at: string;
    etag: string;
    values: { attribute_id: string; value: string }[];
}

Deno.test('history genesis + 2 PATCHes → 200, three entries, '
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
    assertStrictEquals(put.status, 201);
    const etag0 = put.headers.get('ETag')!;

    const patch1 = await patchInstance(
        db, memberToken, etag0, {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'xDyDkxEPwtcNmJVknUHDsg',
                },
            ],
        },
    );
    assertStrictEquals(patch1.status, 201);
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
    assertStrictEquals(patch2.status, 201);
    const etag2 = patch2.headers.get('ETag')!;

    const detail = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(detail.status, 200);
    assertStrictEquals(detail.headers.get('ETag'), etag2);

    const history = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(history.status, 200);
    const entries = await history.json() as HistoryEntry[];
    assertStrictEquals(entries.length, 3);

    // DESC: index 0 is current head (etag sans quotes).
    assertStrictEquals(
        entries[0]!.etag,
        etag2.replaceAll('"', ''),
    );
    assertStrictEquals(
        strongEtagOf(entries[0]!.etag),
        etag2,
    );
    assertEquals(entries[0]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'v2' },
    ]);
    assertEquals(entries[1]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'xDyDkxEPwtcNmJVknUHDsg' },
    ]);
    assertEquals(entries[2]!.values, [
        { attribute_id: ATTR_PUBLIC, value: 'v0' },
    ]);
    assertStrictEquals(
        entries[1]!.etag,
        etag1.replaceAll('"', ''),
    );
    assertStrictEquals(
        entries[2]!.etag,
        etag0.replaceAll('"', ''),
    );

    // Wire (at, id) DESC — timestamps non-increasing.
    assert(entries[0]!.at >= entries[1]!.at);
    assert(entries[1]!.at >= entries[2]!.at);

    // Each entry is FULL state (not a delta).
    for (const entry of entries) {
        assert(Array.isArray(entry.values));
        assertStrictEquals(
            typeof entry.etag === 'string'
            && isIdentifier(entry.etag)
            && !entry.etag.includes('"'),
            true,
            'etag is an identifier, no quotes in JSON',
        );
        assertStrictEquals(
            'version' in entry,
            false,
            'history entries carry no version field',
        );
        assertStrictEquals(typeof entry.at, 'string');
    }
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(entries[0]!.etag, head.messagePairId);
});

Deno.test('history etag[0] is the head pair id for both roles',
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
    assertStrictEquals(put.status, 201);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    const memberHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    const adminHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, adminToken,
    ));
    assertStrictEquals(memberHist.status, 200);
    assertStrictEquals(adminHist.status, 200);
    const memberEntries =
        await memberHist.json() as HistoryEntry[];
    const adminEntries =
        await adminHist.json() as HistoryEntry[];
    assertStrictEquals(
        memberEntries[0]!.etag,
        head.messagePairId,
    );
    assertStrictEquals(
        adminEntries[0]!.etag,
        head.messagePairId,
    );
});

Deno.test('GET versions/:etag by pair id; foreign pair id 404s',
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
    assertStrictEquals(put.status, 201);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    const leafPath =
        INSTANCE_HISTORY + '/' + head.messagePairId;
    const memberLeaf = await handleRequest(db, req(
        'GET', leafPath, memberToken,
    ));
    const adminLeaf = await handleRequest(db, req(
        'GET', leafPath, adminToken,
    ));
    assertStrictEquals(memberLeaf.status, 200);
    assertStrictEquals(adminLeaf.status, 200);
    assertStrictEquals(
        memberLeaf.headers.get('ETag'),
        strongEtagOf(head.messagePairId),
    );
    assertStrictEquals(
        adminLeaf.headers.get('ETag'),
        strongEtagOf(head.messagePairId),
    );
    await seedOrganizationDocument(
        db, ORGANIZATION_B, 'Beta',
    );
    const foreignPairId = await appendInstancePair(
        db, ORGANIZATION_B, FOREIGN_TYPE_ID, INSTANCE_ID,
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
    const foreign = await handleRequest(db, req(
        'GET',
        INSTANCE_HISTORY + '/' + foreignPairId,
        memberToken,
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_ID,
    });
});

Deno.test('history projection: member sees only currently-'
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
    assertStrictEquals(put.status, 201);
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
    assertStrictEquals(patch1.status, 201);

    const memberHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(memberHist.status, 200);
    const memberEntries =
        await memberHist.json() as HistoryEntry[];
    assertStrictEquals(memberEntries.length, 2);
    for (const entry of memberEntries) {
        assertStrictEquals(entry.values.length, 1);
        assertStrictEquals(
            entry.values[0]!.attribute_id,
            ATTR_PUBLIC,
        );
        assert(
            !entry.values.some(
                (v) => v.attribute_id === ATTR_SECRET,
            ),
            'member never sees secret in any revision',
        );
    }
    assertStrictEquals(
        memberEntries[0]!.values[0]!.value,
        'public-1',
    );
    assertStrictEquals(
        memberEntries[1]!.values[0]!.value,
        'public-0',
    );

    const adminHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, adminToken,
    ));
    assertStrictEquals(adminHist.status, 200);
    const adminEntries =
        await adminHist.json() as HistoryEntry[];
    assertStrictEquals(adminEntries.length, 2);
    for (const entry of adminEntries) {
        assertStrictEquals(entry.values.length, 2);
        const byId = new Map(
            entry.values.map(
                (v) => [v.attribute_id, v.value],
            ),
        );
        assert(byId.has(ATTR_PUBLIC));
        assert(byId.has(ATTR_SECRET));
    }
    const head = adminEntries[0]!;
    const byId = new Map(
        head.values.map((v) => [v.attribute_id, v.value]),
    );
    assertStrictEquals(byId.get(ATTR_PUBLIC), 'public-1');
    assertStrictEquals(byId.get(ATTR_SECRET), 'secret-1');
});

Deno.test('history absent instance → 404 via missedReadError',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const missing = generateIdentifier();
    const res = await handleRequest(db, req(
        'GET',
        INSTANCES + missing + '/versions',
        memberToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error:
            'Not found: record_instances/' + missing,
    });
});

Deno.test('history tombstoned → 404 via missedReadError (R2)',
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
    assertStrictEquals(put.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(del.status, 204);

    const res = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_ID,
    });
});

Deno.test('history foreign instance id → 404 via '
+ 'missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedOrganizationDocument(db, ORGANIZATION_B, 'Beta');
    await appendInstancePair(
        db, ORGANIZATION_B, FOREIGN_TYPE_ID, INSTANCE_ID,
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
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_ID,
    });
});

Deno.test('history absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION
            + '/record-types/oZjfWriXLxoqurdbwfBnpA/instances/'
            + INSTANCE_ID + '/versions',
        memberToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: record_types/oZjfWriXLxoqurdbwfBnpA',
    });
});

// A deleted attribute may survive in revision history:
// RESTRICT guards heads only (clear, then DELETE → 204).
// Its values are unreadable by every role — never a 500,
// never an attribute the schema no longer knows.
Deno.test('history after clear + attribute DELETE → 200; the '
+ 'deleted attribute is absent from every entry',
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
    await putAttribute(db, adminToken, ATTR_RETIRED, {
        name: 'Retired',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });

    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_PUBLIC, value: 'kept' },
        { attribute_id: ATTR_RETIRED, value: 'gone' },
    ]);
    assertStrictEquals(put.status, 201);
    const etag0 = put.headers.get('ETag')!;

    const cleared = await patchInstance(
        db, memberToken, etag0, { clear: [ATTR_RETIRED] },
    );
    assertStrictEquals(cleared.status, 201);

    const del = await handleRequest(db, req(
        'DELETE', ATTRS + ATTR_RETIRED, adminToken,
    ));
    assertStrictEquals(del.status, 204);

    for (const token of [memberToken, adminToken]) {
        const history = await handleRequest(db, req(
            'GET', INSTANCE_HISTORY, token,
        ));
        assertStrictEquals(history.status, 200);
        const entries =
            await history.json() as HistoryEntry[];
        assertStrictEquals(entries.length, 2);
        for (const entry of entries) {
            assertEquals(entry.values, [
                { attribute_id: ATTR_PUBLIC, value: 'kept' },
            ]);
        }
        const older = await handleRequest(db, req(
            'GET',
            INSTANCE_HISTORY + '/' + entries[1]!.etag,
            token,
        ));
        assertStrictEquals(older.status, 200);
        const body = await older.json() as {
            values: HistoryEntry['values'];
        };
        assertEquals(body.values, [
            { attribute_id: ATTR_PUBLIC, value: 'kept' },
        ]);
    }
});
