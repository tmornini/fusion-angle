import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postToken } from '../api/authentication.ts';
import { mintAccessToken } from '../api/access-token.ts';
import { nowUtc } from '../api/types.ts';

// A revoked-but-unexpired token must not be launderable into a
// fresh valid pair by the token-exchange or refresh grants —
// 'sign out everywhere' is enforced at the gate AND on every
// mint path, not just on direct gate traffic.

async function tokenFor(sub: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000) - 10;
    return mintAccessToken({
        sub, roles: [], name: 'X',
        iat: now, ttlSeconds: 900,
        jti: 'jti-' + sub + '-' + now,
    });
}

async function revokedDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.memberships.put('m', {
        organization_id: 'A', identity_id: 'u1',
        at: '2020-01-01T00:00:00.000Z',
    });
    // logout-everywhere as of now: every u1 token minted
    // before this stamp is dead.
    await db.identityTokenRevocations.put('r1', {
        identity_id: 'u1', at: nowUtc(),
    });
    return db;
}

test('token-exchange rejects a logged-out subject token',
async () => {
    const db = await revokedDb();
    const token = await tokenFor('u1');
    const res = await postToken(db, {
        grant_type: 'token-exchange',
        subject_token: token, actor_token: token,
        organization: 'A',
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
});

test('refresh rejects a logged-out token', async () => {
    const db = await revokedDb();
    const token = await tokenFor('u1');
    const res = await postToken(db, {
        grant_type: 'refresh', refresh_token: token,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
});
