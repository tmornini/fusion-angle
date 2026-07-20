import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

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
        db, new Request(`${BASE}/memberships/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + await organizationToken(),
            },
        }));
    assert.equal(res.status, 204);
}

function putDefaultOrganization(
    token: string, identityId: string, organization: string, at: string,
): Request {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({
                organization_id: organization,
                eventId: 'ev-liveness-pin-1',
                at,
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
        db, req('/members', await organizationToken()));
    assert.equal(res.status, 200);
});

test('a revoked membership does not stop access mid-token',
async () => {
    const db = await adminDb();
    const token = await organizationToken();   // org '1' claim
    const before = await handleRequest(
        db, req('/members', token));
    assert.equal(before.status, 200);
    // Claim-based fence: de-membership lands on the pair plane
    // but the existing token's organizations claim still holds
    // until mint/refresh/exchange or exp.
    await deleteMembership(db, 'test-membership-current');
    const after = await handleRequest(
        db, req('/members', token));
    assert.equal(after.status, 200);
});

test('a flat token is claim-fenced, not live-membership-fenced',
async () => {
    const db = await adminDb();
    // Pin the default org, then revoke the membership. The
    // flat token still carries organizations:['1'] claims, so
    // the fence admits it until re-mint.
    const pin = await handleRequest(db, putDefaultOrganization(
        await devToken(), 'current', '1',
        '2020-01-02T00:00:00.000000Z',
    ));
    assert.equal(pin.status, 204);
    await deleteMembership(db, 'test-membership-current');
    const res = await handleRequest(
        db, req('/members', await devToken()));
    assert.equal(res.status, 200);
});
