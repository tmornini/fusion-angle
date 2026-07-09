import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

function req(path: string, token: string): Request {
    return new Request(`${BASE}${path}`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// De-membership rides the real wire DELETE (an admin-tier route,
// authorized here by 'current's own seedRootAdmin admin grant) —
// Phase 13 Task 3's flip onto deriveMembershipsForIdentity reads
// ONLY the message-pair ledger, so a raw db.memberships.delete
// (the row-plane splice alone) would leave the derivation seeing
// a still-live membership: a DELETE-shaped pair must actually
// land for the fence to observe the revocation.
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

// Task 8 (Phase 11): identityDefaultOrganization now derives from
// the /identities/:id/default-org/ message-pair ledger, never the
// identity_default_organizations table directly — so pinning a
// SET default here must ride the real PUT route (the same
// production write path), not a raw table put.
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
    const db = new MemoryDbAdapter();
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

test('a revoked membership stops access mid-token',
async () => {
    const db = await adminDb();
    const token = await organizationToken();   // org '1' claim
    const before = await handleRequest(
        db, req('/members', token));
    assert.equal(before.status, 200);
    // De-membership: the token is still cryptographically valid
    // for its full TTL — the fence must not wait for it to expire.
    await deleteMembership(db, 'test-membership-current');
    const after = await handleRequest(
        db, req('/members', token));
    assert.equal(after.status, 403);
    const body = await after.json() as { error: string };
    assert.match(body.error, /no longer a member/);
});

test('a flat token is fenced by live membership too',
async () => {
    const db = await adminDb();
    // Pin the default org in the ledger, then revoke the
    // membership: the SET default now dangles, and the
    // fence — not the default-org resolution — must deny. The
    // route requires live membership at write time, so the pin
    // must run BEFORE the membership is revoked below.
    const pin = await handleRequest(db, putDefaultOrganization(
        await devToken(), 'current', '1',
        '2020-01-02T00:00:00.000000Z',
    ));
    assert.equal(pin.status, 204);
    await deleteMembership(db, 'test-membership-current');
    const res = await handleRequest(
        db, req('/members', await devToken()));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /no longer a member/);
});
