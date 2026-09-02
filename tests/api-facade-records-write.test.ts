import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from
    './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Task 23: nested record-types is in-table (no facade
// re-entry). Flat /organizations/:org/records re-enters flat
// and 404s. Pins keep nested org stamp + flat retirement.

const BASE = 'http://localhost';

function req(
    method: string, path: string,
    token: string, body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

function editBody(organization: string) {
    return {
        kind: 'edit',
        id: 'rbfHGatkwQzGZJVXKJEeyw',
        record: {
            organization_id: organization,
            name: 'rec', description: 'd', position: 0,
        },
        attributes: [],
        state: 'active',
        removedAttributeIds: [],
    };
}

async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    await seedOrganizationDocument(
        db, organization, organization,
    );
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

async function oneOrganization(): Promise<{
    db: MemoryDbAdapter;
    organizationA: string;
    organizationB: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: organizationA,
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return { db, organizationA, organizationB };
}

Deno.test('nested record-types write stamps the bound org'
    + ' over a forged record', async () => {
    const { db, organizationA, organizationB } = await oneOrganization();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationA,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + organizationA + '/record-types/',
        token,
        editBody(organizationB)));
    assertStrictEquals(res.status, 201);
    const get = await handleRequest(db, req(
        'GET',
        '/organizations/' + organizationA
            + '/record-types/rbfHGatkwQzGZJVXKJEeyw',
        token,
    ));
    assertStrictEquals(get.status, 200);
    const stored = await get.json() as {
        organization_id: string;
    };
    assertStrictEquals(stored.organization_id, organizationA);
});

Deno.test('nested record-types write into a non-member org'
    + ' is 403', async () => {
    const { db, organizationA, organizationB } = await oneOrganization();
    // Token scoped to A cannot use path org B (org-match).
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationA,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + organizationB + '/record-types/',
        token,
        editBody(organizationB)));
    assertStrictEquals(res.status, 403);
});

Deno.test('authenticated flat GET /records → 404',
async () => {
    const { db, organizationA } = await oneOrganization();
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organizationA,
    );
    const res = await handleRequest(
        db, req('GET', '/records', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('unauthenticated GET /records → 401',
async () => {
    const { db } = await oneOrganization();
    const res = await handleRequest(
        db,
        new Request(`${BASE}/records`, { method: 'GET' }),
    );
    assertStrictEquals(res.status, 401);
});
