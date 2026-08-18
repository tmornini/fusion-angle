import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from
    '../api/types.ts';
import {
    postMembershipDocumentOp,
    postRecordDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Nested record-types READ surface (Task 2): collection,
// detail, lifecycle history, member tier, and the shared
// org-match fence arm. Seeds via below-gate formWritePair +
// postRecordDocumentOp at the nested detail address.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const PATH_ORGANIZATION_MISMATCH_ERROR =
    'forbidden: path organization does '
    + 'not match the token organization';

interface RecordTypeWireRow {
    id: string;
    organization_id: string;
    name: string;
    description: string;
    position: number;
    state: string;
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

function recordTypeBody(
    name: string,
    position: number,
    state: string,
): Record<string, unknown> {
    return {
        name,
        description: name + ' desc',
        position,
        state,
    };
}

async function seedRecordTypePair(
    db: MemoryDbAdapter,
    organization: string,
    id: string,
    body: Record<string, unknown>,
): Promise<string> {
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
            ...body,
        },
        operationId: TEST_OPERATION_ID,
    });
    await postRecordDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
    return pair.id;
}

async function seedOrganizationWithMember(
    db: MemoryDbAdapter,
    organization: string,
    identityId: string,
    name: string,
    membershipId: string,
    type: 'admin' | 'member' = 'admin',
): Promise<string> {
    await seedOrganizationDocument(
        db, organization, name,
    );
    await seedMembershipPair(db, membershipId, {
        organization_id: organization,
        identity_id: identityId,
        type,
        at: AT,
    });
    return organizationToken(identityId, organization);
}

test('GET .../record-types → 200 [] on empty org',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/1/record-types/', token,
    ));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
});

test('GET .../record-types → 200 oldest live head '
+ '(at, id) first, trio embedded, member token',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    // Seed out of id-lex order so (at, id) is observable.
    await seedRecordTypePair(
        db, '1', 'rt-b',
        recordTypeBody('Beta', 2, 'active'),
    );
    await seedRecordTypePair(
        db, '1', 'rt-a',
        recordTypeBody('Alpha', 1, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/1/record-types/', token,
    ));
    assert.equal(res.status, 200);
    const rows = await res.json() as RecordTypeWireRow[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.id, 'rt-b');
    assert.equal(rows[1]!.id, 'rt-a');
    assert.deepEqual(rows[0], {
        id: 'rt-b',
        organization_id: '1',
        name: 'Beta',
        description: 'Beta desc',
        position: 2,
        state: 'active',
    });
});

test('GET .../record-types/:id → 200, no attribute embed',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    await seedRecordTypePair(
        db, '1', 'rt-1',
        recordTypeBody('Rental', 0, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/1/record-types/rt-1',
        token,
    ));
    assert.equal(res.status, 200);
    const row = await res.json() as RecordTypeWireRow
        & { attributes?: unknown };
    assert.equal(row.id, 'rt-1');
    assert.equal(row.organization_id, '1');
    assert.equal(row.name, 'Rental');
    assert.equal(row.state, 'active');
    assert.equal('state_at' in row, false);
    assert.equal(
        'attributes' in row,
        false,
        'detail must not embed attributes',
    );
});

test('GET .../record-types/:id → 404 absent '
+ "('record_types/rt-x')",
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/1/record-types/rt-x',
        token,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/rt-x',
    });
});

test('GET .../record-types/:id/versions → 200 DESC, '
+ 'index 0 current',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    await seedRecordTypePair(
        db, '1', 'rt-1',
        recordTypeBody('Rental', 0, 'active'),
    );
    await seedRecordTypePair(
        db, '1', 'rt-1',
        recordTypeBody('Rental', 0, 'archived'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/1/record-types/rt-1/versions/',
        token,
    ));
    assert.equal(res.status, 200);
    const rows = await res.json() as RecordTypeWireRow[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.id, 'rt-1');
    assert.equal(rows[0]!.state, 'archived');
    assert.equal(rows[1]!.id, 'rt-1');
    assert.equal(rows[1]!.state, 'active');
    assert.equal('state_at' in rows[0]!, false);
});

test('GET path org ≠ token org → 403 (member of A '
+ 'probing /organizations/B/...)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const tokenA = await seedOrganizationWithMember(
        db, 'A', 'memberA', 'Acme', 'm-a', 'member',
    );
    await seedOrganizationWithMember(
        db, 'B', 'memberB', 'Beta', 'm-b', 'admin',
    );
    await seedRecordTypePair(
        db, 'B', 'rt-b',
        recordTypeBody('Foreign', 0, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/B/record-types/',
        tokenA,
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: PATH_ORGANIZATION_MISMATCH_ERROR,
    });
});

test('GET nonexistent path org → 403 (same arm, same body)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'A', 'memberA', 'Acme', 'm-a', 'member',
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/no-such-org/record-types/',
        token,
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: PATH_ORGANIZATION_MISMATCH_ERROR,
    });
});

test('GET member token → 200 (member READ tier)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, '1', 'member1', 'Org One', 'm-1', 'member',
    );
    await seedRecordTypePair(
        db, '1', 'rt-1',
        recordTypeBody('Rental', 0, 'active'),
    );
    const collection = await handleRequest(db, req(
        'GET', '/organizations/1/record-types/', token,
    ));
    assert.equal(collection.status, 200);
    const detail = await handleRequest(db, req(
        'GET',
        '/organizations/1/record-types/rt-1',
        token,
    ));
    assert.equal(detail.status, 200);
    const history = await handleRequest(db, req(
        'GET',
        '/organizations/1/record-types/rt-1/versions/',
        token,
    ));
    assert.equal(history.status, 200);
});
