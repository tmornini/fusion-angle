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
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token: string,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// Membership type is privilege; claim roles bake at mint /
// exchange. Seed type:"admin" in A and type:"member" in B.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    await seedOrganizationDocument(db, organization, organization);
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
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
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
    // memberships is admin-only; member type in B must 403.
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/memberships',
        await claimToken({
            organizations: ['A', 'B'],
            roles: ['admin:A', 'member:B'],
        })));
    assert.equal(res.status, 403);
});

test('the same admin type authorizes within its own org',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/memberships',
        await claimToken({
            organizations: ['A', 'B'],
            roles: ['admin:A', 'member:B'],
        })));
    assert.equal(res.status, 200);
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
        'GET', '/members', await devToken('current')));
    assert.equal(res.status, 200);
});
