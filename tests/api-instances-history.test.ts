import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    runWrite,
    attemptFor,
    formWriteMessagePair,
    strongEtagOf,
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../shared/types.ts';
import {
    apiRequest,
    messageOfResponse,
    partsOf,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';
import {
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';

// Instance versions — every stored PUT, oldest first, each
// part the instance projected by the CURRENT read ACL.
// Never written → 404; an owned tombstone → 410.

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
const INSTANCE_HISTORY = INSTANCE_DETAIL + '/versions/';

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
        { [IF_NONE_MATCH_HEADER]: '*' },
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    )
    return messagePair.id;
}

interface InstanceBody {
    id: string;
    organization_id: string;
    record_type_id: string;
    values: { attribute_id: string; value: string }[];
}

function etagLine(part: {
    query(path: string): { toText(): string };
}): string {
    return part.query('header.etag').toText();
}

function bareEtag(part: {
    query(path: string): { toText(): string };
}): string {
    return etagLine(part).slice(1, -1);
}

Deno.test(
    'versions genesis + 2 PATCHes → 200, three parts,'
    + ' oldest first; the last part is the head',
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
    assertStrictEquals(patch1.status, 200);
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
    assertStrictEquals(patch2.status, 200);
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
    const parts = await partsOf<InstanceBody>(history);
    assertStrictEquals(parts.length, 3);
    const oldest = parts[0]!;
    const middle = parts[1]!;
    const current = parts[2]!;

    assertStrictEquals(etagLine(current), etag2);
    assertStrictEquals(etagLine(middle), etag1);
    assertStrictEquals(etagLine(oldest), etag0);
    assertEquals(current.body().toValue().values, [
        { attribute_id: ATTR_PUBLIC, value: 'v2' },
    ]);
    assertEquals(middle.body().toValue().values, [
        {
            attribute_id: ATTR_PUBLIC,
            value: 'xDyDkxEPwtcNmJVknUHDsg',
        },
    ]);
    assertEquals(oldest.body().toValue().values, [
        { attribute_id: ATTR_PUBLIC, value: 'v0' },
    ]);

    // Oldest first: response-at is non-decreasing.
    const at0 = oldest.query('header.response-at').toText();
    const at1 = middle.query('header.response-at').toText();
    const at2 = current.query('header.response-at')
        .toText();
    assert(at0 <= at1);
    assert(at1 <= at2);

    // Each part is the stored instance, not a delta.
    for (const part of parts) {
        const body = part.body().toValue();
        assert(Array.isArray(body.values));
        assertStrictEquals(body.id, INSTANCE_ID);
        assertStrictEquals(
            body.organization_id, ORGANIZATION,
        );
        assertStrictEquals(body.record_type_id, TYPE_ID);
        const bare = bareEtag(part);
        assertStrictEquals(
            isIdentifier(bare) && !bare.includes('"'),
            true,
            'etag line quotes an identifier',
        );
        assertStrictEquals(
            'version' in body,
            false,
            'a version part carries no version field',
        );
        assertStrictEquals(
            typeof part.query('header.response-at')
                .toText(),
            'string',
        );
    }
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(
        bareEtag(current), head.messagePairId,
    );
});

Deno.test(
    'versions last part etag is the head pair id'
    + ' for both roles',
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
    const memberParts =
        await partsOf<InstanceBody>(memberHist);
    const adminParts =
        await partsOf<InstanceBody>(adminHist);
    assertStrictEquals(
        bareEtag(memberParts[memberParts.length - 1]!),
        head.messagePairId,
    );
    assertStrictEquals(
        bareEtag(adminParts[adminParts.length - 1]!),
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
    const etag = put.headers.get('ETag')!;
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert(head !== undefined);
    assertStrictEquals(
        etag, strongEtagOf(head.messagePairId),
    );
    const leafPath = INSTANCE_HISTORY + etag.slice(1, -1);
    const memberLeaf = await handleRequest(db, req(
        'GET', leafPath, memberToken,
    ));
    const adminLeaf = await handleRequest(db, req(
        'GET', leafPath, adminToken,
    ));
    assertStrictEquals(memberLeaf.status, 200);
    assertStrictEquals(adminLeaf.status, 200);
    assertStrictEquals(
        memberLeaf.headers.get('ETag'), etag,
    );
    assertStrictEquals(
        adminLeaf.headers.get('ETag'), etag,
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
        INSTANCE_HISTORY + foreignPairId,
        memberToken,
    ));
    assertStrictEquals(foreign.status, 404);
    assertEquals(await foreign.json(), {
        error:
            'Not found: record_instances/' + foreignPairId,
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
    assertStrictEquals(patch1.status, 200);

    const memberHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(memberHist.status, 200);
    const memberParts =
        await partsOf<InstanceBody>(memberHist);
    assertStrictEquals(memberParts.length, 2);
    for (const part of memberParts) {
        const values = part.body().toValue().values;
        assertStrictEquals(values.length, 1);
        assertStrictEquals(
            values[0]!.attribute_id,
            ATTR_PUBLIC,
        );
        assert(
            !values.some(
                (entry) =>
                    entry.attribute_id === ATTR_SECRET,
            ),
            'member never sees secret in any revision',
        );
    }
    assertStrictEquals(
        memberParts[0]!.body().toValue()
            .values[0]!.value,
        'public-0',
    );
    assertStrictEquals(
        memberParts[1]!.body().toValue()
            .values[0]!.value,
        'public-1',
    );

    const adminHist = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, adminToken,
    ));
    assertStrictEquals(adminHist.status, 200);
    const adminParts =
        await partsOf<InstanceBody>(adminHist);
    assertStrictEquals(adminParts.length, 2);
    for (const part of adminParts) {
        const values = part.body().toValue().values;
        assertStrictEquals(values.length, 2);
        const byId = new Map(
            values.map(
                (entry) =>
                    [entry.attribute_id, entry.value],
            ),
        );
        assert(byId.has(ATTR_PUBLIC));
        assert(byId.has(ATTR_SECRET));
    }
    const headValues = adminParts[1]!.body().toValue()
        .values;
    const byId = new Map(
        headValues.map(
            (entry) => [entry.attribute_id, entry.value],
        ),
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
        INSTANCES + missing + '/versions/',
        memberToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error:
            'Not found: record_instances/' + missing,
    });
});

Deno.test(
    'history tombstoned → 410 on both version routes',
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
    const etag = put.headers.get('ETag')!;
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(del.status, 204);
    await del.body?.cancel();

    const gone = {
        error: 'Gone: record_instances/' + INSTANCE_ID,
    };
    const res = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(res.status, 410);
    assertEquals(await res.json(), gone);
    const item = await handleRequest(db, req(
        'GET',
        INSTANCE_HISTORY + etag.slice(1, -1),
        memberToken,
    ));
    assertStrictEquals(item.status, 410);
    assertEquals(await item.json(), gone);
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
            + INSTANCE_ID + '/versions/',
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
    assertStrictEquals(cleared.status, 200);

    const del = await handleRequest(db, req(
        'DELETE', ATTRS + ATTR_RETIRED, adminToken,
    ));
    assertStrictEquals(del.status, 204);

    for (const token of [memberToken, adminToken]) {
        const history = await handleRequest(db, req(
            'GET', INSTANCE_HISTORY, token,
        ));
        assertStrictEquals(history.status, 200);
        const parts = await partsOf<InstanceBody>(history);
        assertStrictEquals(parts.length, 2);
        const kept = [
            { attribute_id: ATTR_PUBLIC, value: 'kept' },
        ];
        for (const part of parts) {
            assertEquals(part.body().toValue().values, kept);
        }
        // The older part was entries[1] when the list
        // was newest first. Its tag is the etag line.
        const older = await handleRequest(db, req(
            'GET',
            INSTANCE_HISTORY + bareEtag(parts[0]!),
            token,
        ));
        assertStrictEquals(older.status, 200);
        const served = await messageOfResponse(older);
        assertEquals(
            served.body().toValue() as InstanceBody,
            parts[0]!.body().toValue(),
        );
        assertEquals(
            (served.body().toValue() as InstanceBody)
                .values,
            kept,
        );
    }
});

Deno.test(
    'instance versions each part equals the item'
    + ' its etag serves',
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
    const patched = await patchInstance(
        db, memberToken, put.headers.get('ETag')!, {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'v1',
                },
            ],
        },
    );
    assertStrictEquals(patched.status, 200);
    await patched.body?.cancel();
    const index = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(index.status, 200);
    const parts = await partsOf<InstanceBody>(index);
    assertStrictEquals(parts.length, 2);
    for (const part of parts) {
        const item = await handleRequest(db, req(
            'GET',
            INSTANCE_HISTORY + bareEtag(part),
            memberToken,
        ));
        assertStrictEquals(item.status, 200);
        const served = await messageOfResponse(item);
        assertStrictEquals(
            served.withFieldDeleted('date')
                .withFieldDeleted('request-id')
                .toWire(),
            part.withFieldDeleted('date')
                .withFieldDeleted('request-id')
                .toWire(),
        );
    }
});
