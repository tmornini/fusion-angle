import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    devToken,
    reachableToken,
} from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// identityDefaultOrganization's primary-membership fallback (this
// file's own motivating case) and the deny-by-default role check
// both derive from the pair plane once role_grants/memberships
// flip, so a raw row here would go derivation-invisible. Every
// id/field value stays IDENTICAL to the raw puts these replace —
// only the write mechanism changes.

async function join(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
    type: 'admin' | 'member' = 'admin',
) {
    await seedOrganizationDocument(
        db, organization, organization,
    );
    await seedSeat(db, organization, identityId, type, AT);
}

function getSeats(token: string, organization: string) {
    return new Request(
        `${BASE}/organizations/${organization}/members/`,
        {
            headers: {
                'Authorization': 'Bearer ' + token,
            },
        },
    );
}

// Seeding a SET default rides the live PUT route.
function putDefaultOrganization(
    token: string, identityId: string, organization: string,
) {
    return new Request(
        `${BASE}/identities/${identityId}`
            + '/default-organization', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify({
                organization_id: organization,
            }),
        });
}

test('a flat token resolves its org from the set default',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    // Claim orgs must include the membership set — fence
    // projects memberships from the token claim, not live.
    const token = await reachableToken('current', ['2']);
    const put = await handleRequest(
        db, putDefaultOrganization(token, 'current', '2'));
    assert.equal(put.status, 201);
    const res = await handleRequest(
        db, getSeats(token, '2'),
    );
    assert.equal(res.status, 200);
});

test('a flat token falls back to its primary membership org',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    const res = await handleRequest(
        db,
        getSeats(
            await reachableToken('current', ['2']),
            '2',
        ),
    );
    assert.equal(res.status, 200);
});

test('a flat token with no org resolution is denied',
async () => {
    const db = await freshDb();   // role, no member
    const res = await handleRequest(
        db, getSeats(await devToken(), '1'),
    );
    assert.equal(res.status, 403);
});
