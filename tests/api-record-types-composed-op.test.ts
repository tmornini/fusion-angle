import { test } from 'node:test';
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
import { formWritePair } from '../api/message-pair.ts';
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
const ORGANIZATION = '1';
const COLLECTION =
    '/organizations/' + ORGANIZATION + '/record-types/';
const TYPE_ID = 'rt-composed-1';
const ATTR_ID = 'attr-composed-1';
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
        initialStateEventId: typeId + '-genesis',
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
        db, 'organizations/1/work-orders/wo-restrict-fv', {
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
        transitionEventId: 'te-restrict-1',
        targetState: 'n-next',
        fieldValues: [{
            id: 'sfv-composed-1',
            fields: {
                state_event_id: 'te-restrict-1',
                attribute_id: attributeId,
                value: 'High',
            },
        }],
        release: null,
        transitionAt: AT,
    };
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', 'wo-restrict-fv', 'transition',
    ];
    const pattern = 'organizations/:id/work-orders/:id/transition';
    const pair = await formWritePair({
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
        db, 'wo-restrict-fv', body, SYSTEM_MEMBER_ID,
        undefined, [], pair,
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

    const requests = await db.requests.getAll();
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
    assert.ok(opPair, 'operation pair missing');

    const documentPair = requests.find(
        r => r.uri_id === TYPE_ID
            && r.uri_collection === typePrefix
            && r.method === 'PUT',
    );
    assert.ok(documentPair, 'document pair missing');

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

    const requestsBefore = await db.requests.getAll();
    const responsesBefore = await db.responses.getAll();
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
        (await db.requests.getAll()).length,
        requestsBefore.length,
    );
    assert.equal(
        (await db.responses.getAll()).length,
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
        .organization_id = 'B';
    ((body['attributes'] as Record<string, unknown>[])[0]!)
        .organization_id = 'B';
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
