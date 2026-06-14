import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postToken } from '../api/authentication.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import { nowUtc } from '../api/types.ts';

// A revoked-but-unexpired token must not be launderable into a
// fresh valid pair by the token-exchange or refresh grants —
// 'sign out everywhere' is enforced at the gate AND on every
// mint path, not just on direct gate traffic.

async function tokenFor(sub: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000) - 10;
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub, roles: [], name: 'X',
        iat: now, ttlSeconds: 900,
        jti: 'jti-' + sub + '-' + now,
    });
}

async function revokedDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.memberships.put('m', {
        organization_id: 'A', identity_id: 'u1',
        at: '2020-01-01T00:00:00.000000Z',
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

test('token-exchange rejects a logged-out actor token',
async () => {
    const db = await revokedDb();
    // u2 is a clean subject and a member; u1 is the
    // logged-out actor. The subject passes every check,
    // so only the actor-revocation check can reject.
    await db.memberships.put('m2', {
        organization_id: 'A', identity_id: 'u2',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const subject = await tokenFor('u2');
    const actor = await tokenFor('u1');
    const res = await postToken(db, {
        grant_type: 'token-exchange',
        subject_token: subject, actor_token: actor,
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

test('refresh on a logged-out but live jti is the'
    + ' revocation, not reuse', async () => {
    const db = await revokedDb();
    // A LIVE issued jti in the ledger: without the
    // logout-everywhere stamp this would rotate cleanly, so
    // the ONLY thing that can reject it is the revoked-through
    // branch — pinning that branch, not the reuse path.
    await db.identityTokens.put('t-live', {
        jti: 'live-jti', identity_id: 'u1',
        action: 'issued', chain_id: 'c1',
        at: '2019-01-01T00:00:00.000000Z',
    });
    const iat = Math.floor(
        Date.parse('2019-01-01T00:00:00.000000Z') / 1000);
    const token = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'u1', roles: [], name: 'X',
        iat, ttlSeconds: 10_000_000_000, jti: 'live-jti',
    });
    const res = await postToken(db, {
        grant_type: 'refresh', refresh_token: token,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
        assert.equal(res.status, 401);
        assert.equal(res.error, 'token revoked');
    }
});
