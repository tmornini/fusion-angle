import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    claimToken,
    devToken,
} from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

function req(
    method: string, path: string, token: string,
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

// Membership type is privilege; claim roles bake at mint /
// exchange. Seed type:"admin" in A and type:"member" in B.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = String(body.organization_id);
    await seedOrganizationDocument(
        db, organization, organization,
    );
    await seedSeat(
        db,
        organization,
        String(body.identity_id),
        body.type as 'admin' | 'member',
        String(body.at),
    );
}

// `current` is a member of BOTH orgs but admin ONLY in A.
// Facade exchange re-bakes claim roles from membership type,
// so admin surfaces in B stay denied while content works.
async function memberOfBothAdminInA(): Promise<{
    db: MemoryDbAdapter;
    organizationA: string;
    organizationB: string;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: organizationA,
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: organizationB,
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'member',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return { db, organizationA, organizationB };
}

Deno.test('admin type in org A does not authorize admin'
+ ' surfaces in org B', async () => {
    const { db, organizationA, organizationB } = await memberOfBothAdminInA();
    // Seat writes stay admin-only; member type in B must 403.
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationB + '/members/'
            + generateIdentifier(),
        await claimToken({
            organization: organizationB,
            organizations: [organizationA, organizationB],
            roles: ['admin:' + organizationA, 'member:' + organizationB],
        }),
        {
            type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 403);
});

Deno.test('the same admin type authorizes within its own org',
async () => {
    const { db, organizationA, organizationB } = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/members/'
            + generateIdentifier(),
        await claimToken({
            organization: organizationA,
            organizations: [organizationA, organizationB],
            roles: ['admin:' + organizationA, 'member:' + organizationB],
        }),
        {
            type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 201);
});

Deno.test('a flat token authorizes via its resolved membership',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , await devToken('XXZruirZyAOoRpNxaDnpSA')));
    assertStrictEquals(res.status, 200);
});
