import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    handleRequest,
    POST,
    PUT,
} from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postWorkOrderTransitionOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Nested composed POST .../record-types (Task 9): admin-only
// create/edit bundle reusing flat postRecordWriteOp + nested
// document/attribute addresses. RESTRICT edit rolls the whole
// batch back; forged organization_id loses to the path org.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const COLLECTION =
    '/organizations/' + ORGANIZATION + '/record-types/';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const WORK_ORDER_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();
const FIELD_VALUE_ID = generateIdentifier();
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
        initialStateEventId: generateIdentifier(),
        initialStateAt: AT,
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

async function seedFieldValueReferrer(
    db: MemoryDbAdapter,
    token: string,
    attributeId: string,
): Promise<void> {
    await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WORK_ORDER_ID, {
            display_id: 'rfv1',
            flow_graph: {
                name: 'Restrict FV',
                lockTimeout: 0,
                nodes: [],
                edges: [],
            },
            position: 1,
        },
        token,
    );
    // Task 8 CUT: legacy fieldValues is below-gate only
    // (stored SFV referrer for RESTRICT; not the live wire).
    const body: Record<string, unknown> = {
        transitionEventId: TRANSITION_EVENT_ID,
        targetState: generateIdentifier(),
        fieldValues: [{
            id: FIELD_VALUE_ID,
            fields: {
                state_event_id: TRANSITION_EVENT_ID,
                attribute_id: attributeId,
                value: 'High',
            },
        }],
        release: null,
        transitionAt: AT,
    };
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', WORK_ORDER_ID, 'transition',
    ];
    const pattern = 'organizations/:id/work-orders/:id/transition';
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: pattern,
        routeSegments: pattern.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: AT,
        organization: STARK_ORGANIZATION,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, WORK_ORDER_ID, body, SYSTEM_MEMBER_ID,
        undefined, [], messagePair,
    );
}

test('POST .../record-types kind create (admin) → 204; '
+ 'document + attribute pairs at nested addresses; GETs '
+ 'see them',
async () => {
    const { db, adminToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(TYPE_ID, ATTR_ID, 'Composed'),
    ));
    assert.equal(post.status, 201);

    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assert.equal(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        id: string;
        organization_id: string;
        name: string;
        state: string;
    };
    assert.equal(typeRow.id, TYPE_ID);
    assert.equal(typeRow.organization_id, ORGANIZATION);
    assert.equal(typeRow.name, 'Composed');
    assert.equal(typeRow.state, 'active');
    assert.equal('state_event_id' in typeRow, false);

    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(attrGet.status, 200);
    const attrRow = await attrGet.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        name: string;
    };
    assert.equal(attrRow.id, ATTR_ID);
    assert.equal(attrRow.organization_id, ORGANIZATION);
    assert.equal(attrRow.record_type_id, TYPE_ID);
    assert.equal(attrRow.name, 'Priority');

    const requests = await db.messagePairs.getAll();
    const typePrefix =
        '/organizations/' + ORGANIZATION
        + '/record-types/';
    const attrPrefix =
        typePrefix + TYPE_ID + '/attributes/';

    const opPair = requests.find(
        r => r.uri_id === TYPE_ID
            && r.uri_collection === typePrefix
            && r.method === 'POST',
    );
    assert.ok(opPair, 'operation message pair missing');

    const documentPair = requests.find(
        r => r.uri_id === TYPE_ID
            && r.uri_collection === typePrefix
            && r.method === 'PUT',
    );
    assert.ok(documentPair, 'document message pair missing');

    const attrPair = requests.find(
        r => r.uri_id === ATTR_ID
            && r.uri_collection === attrPrefix
            && r.method === 'PUT',
    );
    assert.ok(attrPair, 'attribute pair missing');
});

test('POST kind edit with removedAttributeIds referencing '
+ 'a bound attribute → 409; NOTHING appended',
async () => {
    const { db, adminToken } = await adminDb();
    const create = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        createBody(TYPE_ID, ATTR_ID, 'Asset'),
    ));
    assert.equal(create.status, 201);
    await seedFieldValueReferrer(
        db, adminToken, ATTR_ID,
    );

    const requestsBefore = await db.messagePairs.getAll();
    const responsesBefore = await db.messagePairs.getAll();
    const edit = await handleRequest(db, req(
        'POST', COLLECTION, adminToken,
        editBody(TYPE_ID, 'Renamed', [ATTR_ID]),
    ));
    assert.equal(edit.status, 409);
    const err = await edit.json() as { error: string };
    assert.match(err.error, /1 state field value/);

    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assert.equal(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        name: string;
    };
    assert.equal(typeRow.name, 'Asset');

    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(attrGet.status, 200);

    assert.equal(
        (await db.messagePairs.getAll()).length,
        requestsBefore.length,
    );
    assert.equal(
        (await db.messagePairs.getAll()).length,
        responsesBefore.length,
    );
});

test('POST .../record-types member → 403',
async () => {
    const { db, memberToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, memberToken,
        createBody(TYPE_ID, ATTR_ID, 'Denied'),
    ));
    assert.equal(post.status, 403);
});

test('POST body organization_id forged ≠ path org → '
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
    assert.equal(post.status, 201);
    const typeGet = await handleRequest(db, req(
        'GET', DETAIL, adminToken,
    ));
    assert.equal(typeGet.status, 200);
    const typeRow = await typeGet.json() as {
        organization_id: string;
    };
    assert.equal(typeRow.organization_id, ORGANIZATION);
    const attrGet = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(attrGet.status, 200);
    const attrRow = await attrGet.json() as {
        organization_id: string;
    };
    assert.equal(attrRow.organization_id, ORGANIZATION);
});

test('POST kind unknown → 400 (validator message)',
async () => {
    const { db, adminToken } = await adminDb();
    const post = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, {
            kind: 'explode',
            id: TYPE_ID,
        },
    ));
    assert.equal(post.status, 400);
    const err = await post.json() as { error: string };
    assert.equal(
        err.error,
        "expected RecordWriteBody kind"
        + " 'create' or 'edit', got explode",
    );
});

test('composed edit carries each stored ACL forward '
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
    assert.equal(create.status, 201);

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
    assert.equal(restrict.status, 201);

    // A fresh operationId (not req()'s shared
    // TEST_OPERATION_ID): ATTR_ID's own fields are unchanged
    // by this edit, so its stamped-default body would be
    // byte-identical to its create-time PUT under the SAME
    // operation id, and appendMessagePair's request-hash
    // replay guard would silently drop it — masking the very
    // reset this test exists to catch.
    const edit = await handleRequest(db, apiRequest({
        method: 'POST',
        path: COLLECTION,
        token: adminToken,
        operationId: generateIdentifier(),
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
    assert.equal(edit.status, 201);

    const restricted = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(restricted.status, 200);
    const restrictedRow =
        await restricted.json() as {
            read_roles: string[];
            write_roles: string[];
        };
    assert.deepEqual(
        restrictedRow.read_roles, ['admin'],
    );
    assert.deepEqual(
        restrictedRow.write_roles, ['admin'],
    );

    const renamed = await handleRequest(db, req(
        'GET',
        DETAIL + '/attributes/' + attr2Id,
        adminToken,
    ));
    assert.equal(renamed.status, 200);
    const renamedRow = await renamed.json() as {
        name: string;
        read_roles: string[];
        write_roles: string[];
    };
    assert.equal(renamedRow.name, 'Notes v2');
    assert.deepEqual(
        renamedRow.read_roles,
        ['member', 'admin'],
    );
    assert.deepEqual(
        renamedRow.write_roles,
        ['member', 'admin'],
    );

    const born = await handleRequest(db, req(
        'GET',
        DETAIL + '/attributes/' + attr3Id,
        adminToken,
    ));
    assert.equal(born.status, 200);
    const bornRow = await born.json() as {
        name: string;
        read_roles: string[];
        write_roles: string[];
    };
    assert.equal(bornRow.name, 'Serial');
    assert.deepEqual(
        bornRow.read_roles,
        ['member', 'admin'],
    );
    assert.deepEqual(
        bornRow.write_roles,
        ['member', 'admin'],
    );
});
