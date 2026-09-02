import { assertEquals, assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
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
    postRecordDocumentOp,
} from '../api/routes.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Nested record-types READ surface (Task 2): collection,
// detail, lifecycle history, member tier, and the shared
// org-match fence arm. Seeds via below-gate formWriteMessagePair +
// postRecordDocumentOp at the nested detail address.

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
    const messagePair = await formWriteMessagePair({
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
        db, id, body, SYSTEM_MEMBER_ID, messagePair,
    );
    return messagePair.id;
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

Deno.test('GET .../record-types → 200 [] on empty org',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', token,
    ));
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), []);
});

Deno.test('GET .../record-types → 200 oldest live head '
+ '(at, id) first, trio embedded, member token',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    // Seed out of id-lex order so (at, id) is observable.
    const typeB = generateIdentifier();
    const typeA = generateIdentifier();
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', typeB,
        recordTypeBody('Beta', 2, 'active'),
    );
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', typeA,
        recordTypeBody('Alpha', 1, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', token,
    ));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as RecordTypeWireRow[];
    assertStrictEquals(rows.length, 2);
    assertStrictEquals(rows[0]!.id, typeB);
    assertStrictEquals(rows[1]!.id, typeA);
    assertEquals(rows[0], {
        id: typeB,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        name: 'Beta',
        description: 'Beta desc',
        position: 2,
        state: 'active',
    });
});

Deno.test('GET .../record-types/:id → 200, no attribute embed',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'sjWcXwYGlgxxJOHxzMoUow',
        recordTypeBody('Rental', 0, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'sjWcXwYGlgxxJOHxzMoUow',
        token,
    ));
    assertStrictEquals(res.status, 200);
    const row = await res.json() as RecordTypeWireRow
        & { attributes?: unknown };
    assertStrictEquals(row.id, 'sjWcXwYGlgxxJOHxzMoUow');
    assertStrictEquals(row.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(row.name, 'Rental');
    assertStrictEquals(row.state, 'active');
    assertStrictEquals('state_at' in row, false);
    assertStrictEquals(
        'attributes' in row,
        false,
        'detail must not embed attributes',
    );
});

Deno.test('GET .../record-types/:id → 404 absent '
+ "('record_types/soZTXQotovDGOpdZulttTQ')",
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'soZTXQotovDGOpdZulttTQ',
        token,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: record_types/soZTXQotovDGOpdZulttTQ',
    });
});

Deno.test('GET .../record-types/:id/versions → 200 DESC, '
+ 'index 0 current',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'sjWcXwYGlgxxJOHxzMoUow',
        recordTypeBody('Rental', 0, 'active'),
    );
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'sjWcXwYGlgxxJOHxzMoUow',
        recordTypeBody('Rental', 0, 'archived'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'sjWcXwYGlgxxJOHxzMoUow/versions/',
        token,
    ));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as RecordTypeWireRow[];
    assertStrictEquals(rows.length, 2);
    assertStrictEquals(rows[0]!.id, 'sjWcXwYGlgxxJOHxzMoUow');
    assertStrictEquals(rows[0]!.state, 'archived');
    assertStrictEquals(rows[1]!.id, 'sjWcXwYGlgxxJOHxzMoUow');
    assertStrictEquals(rows[1]!.state, 'active');
    assertStrictEquals('state_at' in rows[0]!, false);
});

Deno.test('GET path org ≠ token org → 403 (member of A '
+ 'probing /organizations/B/...)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    const tokenA = await seedOrganizationWithMember(
        db, organizationA, generateIdentifier(), 'Acme',
        generateIdentifier(), 'member',
    );
    await seedOrganizationWithMember(
        db, organizationB, generateIdentifier(), 'Beta',
        generateIdentifier(), 'admin',
    );
    await seedRecordTypePair(
        db, organizationB, generateIdentifier(),
        recordTypeBody('Foreign', 0, 'active'),
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/' + organizationB + '/record-types/',
        tokenA,
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: PATH_ORGANIZATION_MISMATCH_ERROR,
    });
});

Deno.test('GET nonexistent path org → 403 (same arm, same body)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, generateIdentifier(), generateIdentifier(),
        'Acme', generateIdentifier(), 'member',
    );
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/oLbQcDdzGHmpcoUKyvlTnQ/record-types/',
        token,
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: PATH_ORGANIZATION_MISMATCH_ERROR,
    });
});

Deno.test('GET member token → 200 (member READ tier)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const token = await seedOrganizationWithMember(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'nkgaOHZISTQrILTfPThWCA', 'Org One'
            , generateIdentifier(), 'member',
    );
    await seedRecordTypePair(
        db, 'AjdvjuECVZEgZoFajaIEkg', 'sjWcXwYGlgxxJOHxzMoUow',
        recordTypeBody('Rental', 0, 'active'),
    );
    const collection = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', token,
    ));
    assertStrictEquals(collection.status, 200);
    const detail = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'sjWcXwYGlgxxJOHxzMoUow',
        token,
    ));
    assertStrictEquals(detail.status, 200);
    const history = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'sjWcXwYGlgxxJOHxzMoUow/versions/',
        token,
    ));
    assertStrictEquals(history.status, 200);
});
