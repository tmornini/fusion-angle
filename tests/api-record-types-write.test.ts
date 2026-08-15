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
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRecordDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import {
    deriveRecordTypeEntity,
    recordTypeEntityOf,
} from '../api/derive-record-types.ts';

// Nested record-types WRITE surface (Task 3): admin PUT
// (simple class, trio document), admin DELETE with type
// RESTRICT, write authorizer, and byte-identical DELETE
// replay. Composed POST create-with-attributes is Task 9.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-02T00:00:00.000000Z';
const ORGANIZATION = '1';

interface RecordTypePutEcho {
    id: string;
    organization_id: string;
    name: string;
    description: string;
    position: number;
    state: string;
    state_at: string;
    state_event_id: string;
}

interface RecordTypeGetRow extends RecordTypePutEcho {
    state: string;
    state_at: string;
    state_event_id: string;
}

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

function typeBody(
    name: string,
    position: number,
    state: string,
    stateAt: string,
    stateEventId: string,
    description?: string,
): Record<string, unknown> {
    return {
        name,
        description: description ?? (name + ' desc'),
        position,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
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
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRecordTypeBelowGate(
    db: MemoryDbAdapter,
    organization: string,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const pathname =
        '/organizations/' + organization
        + '/record-types/' + id;
    const routeSegments =
        RECORD_TYPE_DETAIL_PATTERN.split('/');
    const pathSegments = pathname.slice(1).split('/');
    const pair = await formWritePair({
        method: 'PUT',
        pathname,
        routePattern: RECORD_TYPE_DETAIL_PATTERN,
        routeSegments,
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: 200,
        responseBody: {
            id,
            organization_id: organization,
            name: body['name'],
            description: body['description'],
            position: body['position'],
            state: body['state'],
            state_at: body['state_at'],
            state_event_id: body['state_event_id'],
        },
        operationId: TEST_OPERATION_ID,
    });
    await postRecordDocumentOp(
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

const DETAIL =
    '/organizations/' + ORGANIZATION + '/record-types/';
const COLLECTION =
    '/organizations/' + ORGANIZATION + '/record-types';

test('PUT .../record-types/:id admin → 200, body echoes '
+ 'entity; GET sees trio',
async () => {
    const { db, adminToken } = await adminDb();
    const body = typeBody(
        'Rental', 1, 'active', AT, 'rt-1-genesis',
    );
    const put = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken, body,
    ));
    assert.equal(put.status, 201);
    const echo = await put.json() as RecordTypePutEcho;
    assert.deepEqual(echo, {
        id: 'rt-1',
        organization_id: ORGANIZATION,
        name: 'Rental',
        description: 'Rental desc',
        position: 1,
        state: 'active',
        state_at: AT,
        state_event_id: 'rt-1-genesis',
    });
    const get = await handleRequest(db, req(
        'GET', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(get.status, 200);
    const row = await get.json() as RecordTypeGetRow;
    assert.deepEqual(row, echo);
});

test('PUT .../record-types/:id member token → 403',
async () => {
    const { db, memberToken } = await adminDb();
    const put = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', memberToken,
        typeBody(
            'Rental', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    assert.equal(put.status, 403);
});

test('PUT foreign type id under own org path geneses '
+ '(write authorizer)',
async () => {
    const { db, adminToken } = await adminDb();
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRecordTypeBelowGate(
        db, 'B', 'rt-foreign',
        typeBody(
            'Foreign', 0, 'active', AT, 'rt-foreign-g',
        ),
    );
    const put = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-foreign', adminToken,
        typeBody(
            'Stolen', 0, 'active', AT, 'rt-stolen-g',
        ),
    ));
    assert.equal(put.status, 201);
    const got = await handleRequest(db, req(
        'GET', DETAIL + 'rt-foreign', adminToken,
    ));
    assert.equal(got.status, 200);
    const wire = await got.json() as { name: string };
    assert.equal(wire.name, 'Stolen');
});

test('DELETE unreferenced type, admin → 204; detail 404; '
+ 'omitted from collection',
async () => {
    const { db, adminToken } = await adminDb();
    const put = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'Rental', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    assert.equal(put.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(del.status, 204);
    const detail = await handleRequest(db, req(
        'GET', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(detail.status, 404);
    const collection = await handleRequest(db, req(
        'GET', COLLECTION, adminToken,
    ));
    assert.equal(collection.status, 200);
    assert.deepEqual(await collection.json(), []);
});

test('DELETE .../record-types/:id member → 403',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'Rental', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    const del = await handleRequest(db, req(
        'DELETE', DETAIL + 'rt-1', memberToken,
    ));
    assert.equal(del.status, 403);
});

test('DELETE type with a live flow join → 409 naming '
+ 'flow(s)',
async () => {
    const { db, adminToken } = await adminDb();
    await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'Rental', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    const flowCreate = await handleRequest(db, req(
        'POST', '/flows', adminToken, {
            id: 'flow-restrict-1',
            flow: {
                name: 'Intake',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: 0,
            },
            projectFlowId: 'flow-restrict-1-pf',
            projectFlow: {
                project_id: 'proj-restrict-1',
                flow_id: 'flow-restrict-1',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: 'flow-restrict-1-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(flowCreate.status, 201);
    const join = await handleRequest(db, req(
        'PUT',
        '/flows/flow-restrict-1/records/fr-1',
        adminToken,
        {
            id: 'fr-1',
            flow_id: 'flow-restrict-1',
            record_id: 'rt-1',
            at: AT,
        },
    ));
    assert.equal(join.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(del.status, 409);
    const body = await del.json() as { error: string };
    assert.match(
        body.error,
        /flow\(s\) flow-restrict-1/,
    );
    assert.match(
        body.error,
        /record type rt-1 is referenced by/,
    );
    // Type still live after restricted DELETE.
    const still = await handleRequest(db, req(
        'GET', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(still.status, 200);
});

test('DELETE replay (byte-identical) → 204',
async () => {
    const { db, adminToken } = await adminDb();
    await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'Rental', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    const first = await handleRequest(db, req(
        'DELETE', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(first.status, 204);
    const second = await handleRequest(db, req(
        'DELETE', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(second.status, 204);
});

test('PUT over existing head with NO precondition '
+ 'header → 200 supersedes (simple class)',
async () => {
    const { db, adminToken } = await adminDb();
    const first = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'Before', 1, 'active', AT, 'rt-1-genesis',
        ),
    ));
    assert.equal(first.status, 201);
    const second = await handleRequest(db, req(
        'PUT', DETAIL + 'rt-1', adminToken,
        typeBody(
            'After', 2, 'active', AT2, 'rt-1-genesis',
            'updated',
        ),
    ));
    assert.equal(second.status, 201);
    const echo = await second.json() as RecordTypePutEcho;
    assert.equal(echo.name, 'After');
    assert.equal(echo.position, 2);
    assert.equal(echo.description, 'updated');
    const get = await handleRequest(db, req(
        'GET', DETAIL + 'rt-1', adminToken,
    ));
    assert.equal(get.status, 200);
    const row = await get.json() as RecordTypeGetRow;
    assert.equal(row.name, 'After');
    assert.equal(row.description, 'updated');
    assert.equal(row.position, 2);
});

test('stored PUT body equals recordTypeEntityOf of the'
+ ' same chain', async () => {
    const { db, adminToken } = await adminDb();
    const id = 'rt-g1-stream';
    const body = typeBody(
        'Streamed', 1, 'active', AT, 'ev-g1',
    );
    const put = await handleRequest(
        db, req('PUT', DETAIL + id, adminToken, body),
    );
    assert.equal(put.status, 201);
    const prefix = '/organizations/'
        + ORGANIZATION + '/record-types/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = recordTypeEntityOf(
        {
            uriId: id,
            pairId: id,
            method: 'PUT',
            body,
        },
        ORGANIZATION,
        {
            id: 'ev-g1',
            entity_id: id,
            state: 'active',
            member_id: 'current',
            at: AT,
        },
    );
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored,
        await deriveRecordTypeEntity(
            db, ORGANIZATION, id,
        ),
    );
    const skewed = await handleRequest(db, req(
        'PUT', DETAIL + id, adminToken,
        typeBody(
            'Skewed', 1, 'deleted',
            '2020-01-01T00:00:00.000000Z', 'ev-g1-skew',
        ),
    ));
    assert.equal(skewed.status, 201);
    const afterSkew = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        afterSkew,
        await deriveRecordTypeEntity(
            db, ORGANIZATION, id,
        ),
    );
    assert.equal(afterSkew.state, 'active');
    assert.equal(afterSkew.state_event_id, 'ev-g1');
    assert.equal(afterSkew.name, 'Skewed');
});
