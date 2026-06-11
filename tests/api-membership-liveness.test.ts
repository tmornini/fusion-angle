import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, orgToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

function req(path: string, token: string): Request {
    return new Request(`${BASE}${path}`, {
        headers: { 'Authorization': 'Bearer ' + token },
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
        db, req('/members', await orgToken()));
    assert.equal(res.status, 200);
});

test('a revoked membership stops access mid-token',
async () => {
    const db = await adminDb();
    const token = await orgToken();   // org '1' claim
    const before = await handleRequest(
        db, req('/members', token));
    assert.equal(before.status, 200);
    // De-membership: splice the relationship row. The token
    // is still cryptographically valid for its full TTL —
    // the fence must not wait for it to expire.
    await db.memberships.delete('test-membership-current');
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
    // fence — not the default-org resolution — must deny.
    await db.identityDefaultOrgs.put('do-current', {
        identity_id: 'current',
        organization_id: '1',
        at: '2020-01-02T00:00:00.000000Z',
    });
    await db.memberships.delete('test-membership-current');
    const res = await handleRequest(
        db, req('/members', await devToken()));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /no longer a member/);
});
