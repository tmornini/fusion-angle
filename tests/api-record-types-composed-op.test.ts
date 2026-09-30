import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    handleRequest,
} from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    apiRequest,
    pairIdOf,
    storedPutBodyText,
} from './http-fixtures.ts';
import { DEFAULT_ATTRIBUTE_ACL_ROLES } from '../shared/types.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Nested composed POST .../record-types (Task 9): admin-only
// create/edit of the type and its nested attribute documents,
// landed through the former. RESTRICT edit rolls the whole
// batch back; forged organization_id loses to the path org.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const COLLECTION =
    '/organizations/' + ORGANIZATION + '/record-types/';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const FORGED_ORGANIZATION = generateIdentifier();
const DETAIL = COLLECTION + TYPE_ID;
const ATTR_DETAIL =
    DETAIL + '/attributes/' + ATTR_ID;

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
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

function createBody(
    typeId: string,
    attrId: string,
    name: string,
): Record<string, unknown> {
    return {
        kind: 'create',
        id: typeId,
        record: {
            organization_id: ORGANIZATION,
            name,
            description: name + ' desc',
            position: 1,
        },
        attributes: [
            {
                id: attrId,
                organization_id: ORGANIZATION,
                record_id: typeId,
                name: 'Priority',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            },
        ],
        initialState: 'active',
    };
}

function editBody(
    typeId: string,
    name: string,
    removedAttributeIds: readonly string[],
): Record<string, unknown> {
    return {
        kind: 'edit',
        id: typeId,
        record: {
            organization_id: ORGANIZATION,
            name,
            description: 'd',
            position: 1,
        },
        attributes: [],
        state: 'active',
        removedAttributeIds: [...removedAttributeIds],
    };
}

// A live instance head under the composed type whose values
// name `attributeId` — the fourth RESTRICT leg (spec
// 2026-09-15 § 4: values live on the instance document).
async function seedInstanceReferrer(
    db: MemoryDbAdapter,
    token: string,
    attributeId: string,
): Promise<void> {
    const patch = await handleRequest(db, apiRequest({
        method: 'PATCH',
        path: DETAIL + '/instances/' + INSTANCE_ID,
        token,
        body: { set: [{ attribute_id: attributeId, value: 'High' }] },
        headers: { [IF_NONE_MATCH_HEADER]: '*' },
    }));
    assertStrictEquals(patch.status, 201);
}

Deno.test('POST .../record-types kind create (admin) → 201 '
+ 'with the type\'s state; document + attribute pairs at '
+ 'nested documents; GETs see them',
async () => {
    const { db, adminToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(TYPE_ID, ATTR_ID, 'Composed'),
    ));
    assertStrictEquals(post.status, 201);
    const created = await post.json();

    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assertStrictEquals(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        id: string;
        organization_id: string;
        name: string;
        state: string;
    };
    assertStrictEquals(typeRow.id, TYPE_ID);
    assertStrictEquals(typeRow.organization_id, ORGANIZATION);
    assertStrictEquals(typeRow.name, 'Composed');
    assertStrictEquals(typeRow.state, 'active');
    assertStrictEquals('state_event_id' in typeRow, false);
    assertEquals(created, typeRow);

    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(attrGet.status, 200);
    const attrRow = await attrGet.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        name: string;
    };
    assertStrictEquals(attrRow.id, ATTR_ID);
    assertStrictEquals(attrRow.organization_id, ORGANIZATION);
    assertStrictEquals(attrRow.record_type_id, TYPE_ID);
    assertStrictEquals(attrRow.name, 'Priority');

    const requests = await db.messagePairs.getAll();
    const typePrefix =
        '/organizations/' + ORGANIZATION
        + '/record-types/';
    const attrPrefix =
        typePrefix + TYPE_ID + '/attributes/';

    const opPair = requests.find(
        r => r.name === TYPE_ID
            && r.path === typePrefix
            && r.method === 'POST',
    );
    assert(opPair, 'operation message pair missing');

    const documentPair = requests.find(
        r => r.name === TYPE_ID
            && r.path === typePrefix
            && r.method === 'PUT',
    );
    assert(documentPair, 'document message pair missing');

    const attrPair = requests.find(
        r => r.name === ATTR_ID
            && r.path === attrPrefix
            && r.method === 'PUT',
    );
    assert(attrPair, 'attribute pair missing');
});

Deno.test('POST kind edit with removedAttributeIds referencing '
+ 'a bound attribute → 409; NOTHING appended',
async () => {
    const { db, adminToken } = await adminDb();
    const create = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(TYPE_ID, ATTR_ID, 'Asset'),
    ));
    assertStrictEquals(create.status, 201);
    await seedInstanceReferrer(
        db, adminToken, ATTR_ID,
    );

    const requestsBefore = await db.messagePairs.getAll();
    const responsesBefore = await db.messagePairs.getAll();
    const edit = await handleRequest(db, taggedEdit(
        adminToken,
        editBody(TYPE_ID, 'Renamed', [ATTR_ID]),
        '"' + (await db.messagePairs.getHeadPair(
            COLLECTION, TYPE_ID,
        ))!.id + '"',
    ));
    assertStrictEquals(edit.status, 409);
    const err = await edit.json() as { error: string };
    assertMatch(err.error, /instance\(s\)/);

    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assertStrictEquals(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        name: string;
    };
    assertStrictEquals(typeRow.name, 'Asset');

    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(attrGet.status, 200);

    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        requestsBefore.length,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length,
        responsesBefore.length,
    );
});

Deno.test('POST .../record-types member → 403',
async () => {
    const { db, memberToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, memberToken,
        createBody(TYPE_ID, ATTR_ID, 'Denied'),
    ));
    assertStrictEquals(post.status, 403);
});

Deno.test('POST body organization_id forged ≠ path org → '
+ 'bound org wins',
async () => {
    const { db, adminToken } = await adminDb();
    const body = createBody(TYPE_ID, ATTR_ID, 'Forged');
    (body['record'] as Record<string, unknown>)
        .organization_id = FORGED_ORGANIZATION;
    ((body['attributes'] as Record<string, unknown>[])[0]!)
        .organization_id = FORGED_ORGANIZATION;
    const post = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, body,
    ));
    assertStrictEquals(post.status, 201);
    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assertStrictEquals(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        organization_id: string;
    };
    assertStrictEquals(typeRow.organization_id, ORGANIZATION);
    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(attrGet.status, 200);
    const attrRow = await attrGet.json() as {
        organization_id: string;
    };
    assertStrictEquals(attrRow.organization_id, ORGANIZATION);
});

Deno.test('POST kind unknown → 400 (validator message)',
async () => {
    const { db, adminToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, {
            kind: 'explode',
            id: TYPE_ID,
        },
    ));
    assertStrictEquals(post.status, 400);
    const err = await post.json() as { error: string };
    assertStrictEquals(
        err.error,
        "expected RecordWriteBody kind"
        + " 'create' or 'edit', got explode",
    );
});

Deno.test('composed edit carries each stored ACL forward '
+ '— a rename never resets a restriction',
async () => {
    const { db, adminToken } = await adminDb();
    const attr2Id = generateIdentifier();
    // Absent from the create: the edit is this
    // attribute's genesis, so it takes the default.
    const attr3Id = generateIdentifier();
    const body = createBody(TYPE_ID, ATTR_ID, 'Asset');
    (body['attributes'] as unknown[]).push({
        id: attr2Id,
        organization_id: ORGANIZATION,
        record_id: TYPE_ID,
        name: 'Notes',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
    });
    const create = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, body,
    ));
    assertStrictEquals(create.status, 201);

    const restrict = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, {
            name: 'Priority',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: ['admin'],
            write_roles: ['admin'],
        },
    ));
    assertStrictEquals(restrict.status, 200);

    const edit = await handleRequest(db, apiRequest({
        method: 'POST',
        path: COLLECTION,
        token: adminToken,
        operationId: generateIdentifier(),
        headers: {
            [IF_MATCH_HEADER]: '"' + (await db.messagePairs
                .getHeadPair(COLLECTION, TYPE_ID))!.id + '"',
        },
        body: {
            kind: 'edit',
            id: TYPE_ID,
            record: {
                organization_id: ORGANIZATION,
                name: 'Asset',
                description: 'Asset desc',
                position: 1,
            },
            attributes: [
                {
                    id: ATTR_ID,
                    organization_id: ORGANIZATION,
                    record_id: TYPE_ID,
                    name: 'Priority',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
                {
                    id: attr2Id,
                    organization_id: ORGANIZATION,
                    record_id: TYPE_ID,
                    name: 'Notes v2',
                    attribute_type: 'text',
                    sort_order: 1,
                    options: [],
                    constraints: [],
                },
                {
                    id: attr3Id,
                    organization_id: ORGANIZATION,
                    record_id: TYPE_ID,
                    name: 'Serial',
                    attribute_type: 'text',
                    sort_order: 2,
                    options: [],
                    constraints: [],
                },
            ],
            state: 'active',
            removedAttributeIds: [],
        },
    }));
    assertStrictEquals(edit.status, 200);
    assertEquals(
        await edit.json(),
        JSON.parse(
            await storedPutBodyText(db, COLLECTION, TYPE_ID),
        ),
    );

    const restricted = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(restricted.status, 200);
    const restrictedRow =
        await restricted.json() as {
            read_roles: string[];
            write_roles: string[];
        };
    assertEquals(
        restrictedRow.read_roles, ['admin'],
    );
    assertEquals(
        restrictedRow.write_roles, ['admin'],
    );

    const renamed = await handleRequest(db, req(
        'GET',
        DETAIL + '/attributes/' + attr2Id,
        adminToken,
    ));
    assertStrictEquals(renamed.status, 200);
    const renamedRow = await renamed.json() as {
        name: string;
        read_roles: string[];
        write_roles: string[];
    };
    assertStrictEquals(renamedRow.name, 'Notes v2');
    assertEquals(
        renamedRow.read_roles,
        ['member', 'admin'],
    );
    assertEquals(
        renamedRow.write_roles,
        ['member', 'admin'],
    );

    const born = await handleRequest(db, req(
        'GET',
        DETAIL + '/attributes/' + attr3Id,
        adminToken,
    ));
    assertStrictEquals(born.status, 200);
    const bornRow = await born.json() as {
        name: string;
        read_roles: string[];
        write_roles: string[];
    };
    assertStrictEquals(bornRow.name, 'Serial');
    assertEquals(
        bornRow.read_roles,
        ['member', 'admin'],
    );
    assertEquals(
        bornRow.write_roles,
        ['member', 'admin'],
    );
});

function attributeFields(
    id: string,
    typeId: string,
    name: string,
): Record<string, unknown> {
    return {
        id,
        organization_id: ORGANIZATION,
        record_id: typeId,
        name,
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
    };
}

Deno.test('recreate after delete lands a new document head',
async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const attrId = generateIdentifier();
    const detail = COLLECTION + typeId;
    const created = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, attrId, 'First'),
    ));
    assertStrictEquals(created.status, 201);
    const deleted = await handleRequest(db, req(
        'DELETE', detail, adminToken,
    ));
    assertStrictEquals(deleted.status, 204);
    const tombstone = await db.messagePairs.getHeadPair(
        COLLECTION, typeId,
    );
    assertStrictEquals(tombstone?.method, 'DELETE');
    const again = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, generateIdentifier(), 'Second'),
    ));
    assertStrictEquals(again.status, 201);
    const head = await db.messagePairs.getHeadPair(
        COLLECTION, typeId,
    );
    assertStrictEquals(head?.method, 'PUT');
    assertNotStrictEquals(head?.id, tombstone?.id);
    const got = await handleRequest(db, req(
        'GET', detail, adminToken,
    ));
    assertStrictEquals(got.status, 200);
    const row = await got.json() as { name: string };
    assertStrictEquals(row.name, 'Second');
});

Deno.test('a rename beside an already-deleted attribute lands',
async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const kept = generateIdentifier();
    const gone = generateIdentifier();
    const detail = COLLECTION + typeId;
    const created = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, {
            kind: 'create',
            id: typeId,
            record: {
                organization_id: ORGANIZATION,
                name: 'Asset',
                description: 'Asset desc',
                position: 1,
            },
            attributes: [
                attributeFields(kept, typeId, 'Priority'),
                attributeFields(gone, typeId, 'Notes'),
            ],
            initialState: 'active',
        },
    ));
    assertStrictEquals(created.status, 201);
    const removed = await handleRequest(db, req(
        'DELETE', detail + '/attributes/' + gone,
        adminToken,
    ));
    assertStrictEquals(removed.status, 204);
    const edit = await handleRequest(db, taggedEdit(
        adminToken, {
            kind: 'edit',
            id: typeId,
            record: {
                organization_id: ORGANIZATION,
                name: 'Asset',
                description: 'Asset desc',
                position: 1,
            },
            attributes: [
                attributeFields(kept, typeId, 'Priority v2'),
            ],
            state: 'active',
            removedAttributeIds: [gone],
        },
        '"' + (await db.messagePairs.getHeadPair(
            COLLECTION, typeId,
        ))!.id + '"',
    ));
    assertStrictEquals(edit.status, 200);
    assertEquals(
        await edit.json(),
        JSON.parse(
            await storedPutBodyText(db, COLLECTION, typeId),
        ),
    );
    const renamed = await handleRequest(db, req(
        'GET', detail + '/attributes/' + kept, adminToken,
    ));
    assertStrictEquals(renamed.status, 200);
    const renamedRow = await renamed.json() as {
        name: string;
    };
    assertStrictEquals(renamedRow.name, 'Priority v2');
    const absent = await handleRequest(db, req(
        'GET', detail + '/attributes/' + gone, adminToken,
    ));
    assertStrictEquals(absent.status, 404);
});

Deno.test('an unchanged record edit stores nothing'
+ ' and keeps the head',
async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const attrId = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, attrId, 'Composed'),
    ));
    assertStrictEquals(created.status, 201);
    const head = await db.messagePairs.getHeadPair(
        COLLECTION, typeId,
    );
    assert(head);
    const before = (await db.messagePairs.getAll()).length;
    const resend = await handleRequest(db, taggedEdit(
        adminToken, {
            kind: 'edit',
            id: typeId,
            record: {
                organization_id: ORGANIZATION,
                name: 'Composed',
                description: 'Composed desc',
                position: 1,
            },
            attributes: [
                attributeFields(attrId, typeId, 'Priority'),
            ],
            state: 'active',
            removedAttributeIds: [],
        },
        '"' + head.id + '"',
    ));
    assertStrictEquals(resend.status, 200);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    const after = await db.messagePairs.getHeadPair(
        COLLECTION, typeId,
    );
    assertStrictEquals(after?.id, head.id);
});

Deno.test('POST record-types/ create answers 201 with the'
+ ' document\'s state and its location', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const res = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, generateIdentifier(), 'Located'),
    ));
    assertStrictEquals(res.status, 201);
    assertStrictEquals(res.headers.get('location'), typeId);
    assertEquals(
        await res.json(),
        JSON.parse(
            await storedPutBodyText(db, COLLECTION, typeId),
        ),
    );
});

Deno.test('a resent POST record-types/ create is 409 and'
+ ' stores nothing', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const body = createBody(typeId, generateIdentifier(), 'Once');
    const first = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, body,
    ));
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, body,
    ));
    assertStrictEquals(second.status, 409);
    assertEquals(await second.json(), {
        error: 'Document already exists at ' + COLLECTION + typeId,
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

// One shape per family: the create stores each attribute's
// wire, so the route's identical PUT over it is the
// statement's match.
Deno.test('a route PUT of the create\'s attribute stores nothing'
+ ' and answers 200', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const attrId = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, attrId, 'Wired'),
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const attributes = COLLECTION + typeId + '/attributes/';
    const head = await db.messagePairs.getHeadPair(
        attributes, attrId,
    );
    assert(head !== null);
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT', attributes + attrId, adminToken, {
            name: 'Priority',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ));
    assertStrictEquals(res.status, 200);
    assertStrictEquals(pairIdOf(res), head.id);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a record-type create with If-Match is 400',
async () => {
    const { db, adminToken } = await adminDb();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, apiRequest({
        method: 'POST',
        path: COLLECTION,
        token: adminToken,
        body: createBody(
            generateIdentifier(), generateIdentifier(), 'Tagged',
        ),
        headers: {
            [IF_MATCH_HEADER]: '"' + generateIdentifier() + '"',
        },
    }));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'POST ' + COLLECTION
            + ' takes no If-Match on a create',
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

function taggedEdit(
    token: string,
    body: Record<string, unknown>,
    etag: string,
): Request {
    return apiRequest({
        method: 'POST',
        path: COLLECTION,
        token,
        body,
        headers: { [IF_MATCH_HEADER]: etag },
    });
}

async function createdType(
    db: MemoryDbAdapter,
    token: string,
    typeId: string,
    name: string,
): Promise<string> {
    const created = await handleRequest(db, req(
        'POST', COLLECTION, token,
        createBody(typeId, generateIdentifier(), name),
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const etag = created.headers.get('etag');
    assert(etag !== null);
    return etag;
}

Deno.test('an edit without If-Match is 428', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    await createdType(db, adminToken, typeId, 'Untagged');
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        editBody(typeId, 'Renamed', []),
    ));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an edit answers the type\'s state', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const etag = await createdType(
        db, adminToken, typeId, 'Answered',
    );
    const res = await handleRequest(db, taggedEdit(
        adminToken, editBody(typeId, 'Renamed', []), etag,
    ));
    assertStrictEquals(res.status, 200);
    const head = await db.messagePairs.getHeadPair(
        COLLECTION, typeId,
    );
    assert(head !== null);
    assertStrictEquals(res.headers.get('etag'), '"' + head.id + '"');
    const state = await res.json() as { name: string };
    assertEquals(
        state,
        JSON.parse(await storedPutBodyText(db, COLLECTION, typeId)),
    );
    assertStrictEquals(state.name, 'Renamed');
});

Deno.test('an unchanged edit answers the head and stores nothing',
async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const attrId = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(typeId, attrId, 'Kept'),
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const etag = created.headers.get('etag');
    assert(etag !== null);
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, taggedEdit(adminToken, {
        kind: 'edit',
        id: typeId,
        record: {
            organization_id: ORGANIZATION,
            name: 'Kept',
            description: 'Kept desc',
            position: 1,
        },
        attributes: [attributeFields(attrId, typeId, 'Priority')],
        state: 'active',
        removedAttributeIds: [],
    }, etag));
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('etag'), etag);
    assertEquals(
        await res.json(),
        JSON.parse(await storedPutBodyText(db, COLLECTION, typeId)),
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an edit of a missing type is 404', async () => {
    const { db, adminToken } = await adminDb();
    const typeId = generateIdentifier();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, taggedEdit(
        adminToken, editBody(typeId, 'Nobody', []),
        '"' + generateIdentifier() + '"',
    ));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
