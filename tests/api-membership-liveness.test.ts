import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const BASE = 'http://localhost';

function req(path: string, token: string): Request {
    return new Request(`${BASE}${path}`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// De-membership rides the real wire DELETE. Under the claim-
// based fence, a still-valid token keeps its claim orgs/roles
// until mint/refresh/exchange or access-token expiry — the
// NAMED ≤15-min staleness covenant. Live membership is NOT
// re-read on every request.
async function deleteMembership(
    db: MemoryDbAdapter, id: string,
): Promise<void> {
    const res = await handleRequest(
        db, new Request(
            `${BASE}/organizations/1/members/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer '
                    + await organizationToken(),
                'operation-id': TEST_OPERATION_ID,
            },
        }));
    assert.equal(res.status, 204);
}

function putDefaultOrganization(
    token: string, identityId: string, organization: string,
): Request {
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

async function adminDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    return db;
}

test('a live member passes the membership fence',
async () => {
    const db = await adminDb();
    const res = await handleRequest(
        db, req('/organizations/1/members/', await organizationToken()));
    assert.equal(res.status, 200);
});

test('a revoked membership does not stop access mid-token',
async () => {
    const db = await adminDb();
    const token = await organizationToken();   // org '1' claim
    const before = await handleRequest(
        db, req('/organizations/1/members/', token));
    assert.equal(before.status, 200);
    // Claim-based fence: de-membership lands on the pair plane
    // but the existing token's organizations claim still holds
    // until mint/refresh/exchange or exp.
    await deleteMembership(db, 'current');
    const after = await handleRequest(
        db, req('/organizations/1/members/', token));
    assert.equal(after.status, 200);
});

test('a flat token denies when SET is not a live seat'
+ ' and no PRIMARY remains',
async () => {
    const db = await adminDb();
    // Token resolution skips a SET that is not a live
    // seat. After revoke of the only remaining join,
    // a flat token has no organization to resolve.
    const pin = await handleRequest(db, putDefaultOrganization(
        await devToken(), 'current', '1',
    ));
    assert.equal(pin.status, 201);
    await deleteMembership(db, 'current');
    const res = await handleRequest(
        db, req('/organizations/1/members/', await devToken()));
    assert.equal(res.status, 403);
});
