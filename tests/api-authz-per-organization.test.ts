import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const BASE = 'http://localhost';

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
async function memberOfBothAdminInA(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A',
        identity_id: 'current',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B',
        identity_id: 'current',
        type: 'member',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('admin type in org A does not authorize admin'
+ ' surfaces in org B', async () => {
    const db = await memberOfBothAdminInA();
    // Seat writes stay admin-only; member type in B must 403.
    const res = await handleRequest(db, req(
        'PUT', '/organizations/B/members/x',
        await claimToken({
            organizations: ['A', 'B'],
            roles: ['admin:A', 'member:B'],
        }),
        {
            type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 403);
});

test('the same admin type authorizes within its own org',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/A/members/x',
        await claimToken({
            organizations: ['A', 'B'],
            roles: ['admin:A', 'member:B'],
        }),
        {
            type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 201);
});

test('a flat token authorizes via its resolved membership',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm', {
        organization_id: '1',
        identity_id: 'current',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'GET', '/organizations/1/members', await devToken('current')));
    assert.equal(res.status, 200);
});
