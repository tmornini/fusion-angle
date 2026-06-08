import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, PUT, handleRequest } from '../api/api.ts';
import {
    devToken, expiredToken, notYetValidToken,
} from './token-fixtures.ts';
import {
    mintAccessToken, ANONYMOUS_ID,
} from '../api/access-token.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The verb fns always attach a Bearer header, so the
// missing-header path is reachable only via handleRequest.
test('rejects a request with no Authorization header',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.match(body.error, /missing bearer token/);
});

test('protected route accepts a valid token', async () => {
    const db = await freshDb();
    const rows = await GET(db, 'members', await devToken());
    assert.ok(Array.isArray(rows));
});

test('rejects an expired token', async () => {
    const db = await freshDb();
    await assert.rejects(
        async () => GET(db, 'members', await expiredToken()),
        /expired/);
});

test('rejects a not-yet-valid token', async () => {
    const db = await freshDb();
    await assert.rejects(
        async () => GET(db, 'members', await notYetValidToken()),
        /not yet valid/);
});

test('rejects the anonymous principal on a protected route',
async () => {
    const db = await freshDb();
    const anon = await mintAccessToken({
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon',
    });
    await assert.rejects(
        () => GET(db, 'members', anon), /anonymous/);
});

// Public routes are exempt: even an anonymous token (which a
// protected route rejects) reaches the snapshot plane. A bare
// adapter (no createSchema) leaves hasSchema false, so the
// handler returns null — proving the route was reached, not
// gated.
test('public snapshot routes admit any token', async () => {
    const db = new MemoryDbAdapter();
    const anon = await mintAccessToken({
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon2',
    });
    const snap = await GET(db, 'snapshots/schema', anon);
    assert.equal(snap, null);   // hasSchema false here
});

test('a logout-everywhere revokes earlier tokens', async () => {
    const db = await freshDb();
    // The rejected token predates the revocation stamp; the
    // writer (devToken, iat 1.7e9) is stamped AFTER it, so the
    // revocation does not revoke its own writer.
    const stale = await mintAccessToken({
        sub: 'current', roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 10_000_000_000,
        jti: 'stale',
    });
    await PUT(
        db, 'identity-token-revocations/r1',
        {
            identity_id: 'current',
            at: '2021-01-01T00:00:00.000Z',
        },
        await devToken(),
    );
    await assert.rejects(
        () => GET(db, 'members', stale), /revoked/);
});

test('a token whose jti is revoked in the ledger is denied',
async () => {
    const db = await freshDb();
    // the access token (devToken jti = dev-current) is issued
    // then its chain is revoked in the identity_tokens ledger
    await db.identityTokens.put('e1', {
        jti: 'dev-current', identity_id: 'current',
        action: 'issued', chain_id: 'c1',
        parent_jti: '', at: '2026-01-01T00:00:00.000Z',
    });
    await db.identityTokens.put('e2', {
        jti: 'dev-current', identity_id: 'current',
        action: 'revoked', chain_id: 'c1',
        parent_jti: '', at: '2026-02-01T00:00:00.000Z',
    });
    await assert.rejects(
        async () => GET(db, 'members', await devToken()),
        /chain revoked/);
});
