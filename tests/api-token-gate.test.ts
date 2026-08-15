import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    GET, POST, PUT, handleRequest,
} from '../api/api.ts';
import {
    devToken, expiredToken, notYetValidToken,
} from './token-fixtures.ts';
import {
    mintAccessToken, ANONYMOUS_ID,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
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
    assert.equal(body.error, 'invalid_token');
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
        /invalid_token/);
});

test('rejects a not-yet-valid token', async () => {
    const db = await freshDb();
    await assert.rejects(
        async () => GET(db, 'members', await notYetValidToken()),
        /invalid_token/);
});

test('rejects the anonymous principal on a protected route',
async () => {
    const db = await freshDb();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon',
    });
    await assert.rejects(
        () => GET(db, 'members', anon), /invalid_token/);
});

// Public routes are exempt: even an anonymous token (which a
// protected route rejects) reaches the snapshot plane. A bare
// adapter (no postSchemaCreation) leaves hasSchema false, so the
// handler returns null — proving the route was reached, not
// gated.
test('public snapshot routes admit any token', async () => {
    const db = memoryDbAdapter();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon2',
    });
    const snap = await GET(db, 'snapshots/schema', anon);
    assert.equal(snap, null);   // hasSchema false here
});

// The snapshot plane is auth-free (a dev-tier install/demo
// surface): anonymous may seed, and may seed AGAIN after a
// schema exists. No gate closes behind the first boot.
test('anonymous may re-seed after a schema exists',
async () => {
    const db = memoryDbAdapter();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon-boot',
    });
    const creds = await POST<{
        identities: readonly unknown[];
    }>(
        db, 'snapshots/mock-data', {}, anon,
    );
    assert.ok(creds.identities.length > 0);
    assert.equal(await db.hasSchema(), true);
    // A second anonymous seed SUCCEEDS — the plane never closes.
    const again = await POST<{
        identities: readonly unknown[];
    }>(
        db, 'snapshots/mock-data', {}, anon,
    );
    assert.ok(again.identities.length > 0);
});

// Per-request access-token revocation is RETIRED. Mint /
// refresh / exchange still consult the revocation ledger; a
// live access token works until exp (≤ ACCESS_TTL_SECONDS) —
// the NAMED staleness covenant. These cases pin that access
// GETs are NOT blocked by the revocation ledger mid-token.

test('a logout-everywhere does not kill a live access token',
async () => {
    const db = await freshDb();
    // Claim-bearing access token: fence uses claim orgs/roles,
    // not the revocation ledger.
    const live = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'current',
        roles: ['admin:1'],
        name: 'Demo',
        organizations: ['1'],
        iat: 1_600_000_000, ttlSeconds: 10_000_000_000,
        jti: 'stale-but-live',
    });
    await PUT(
        db, 'identity-token-revocations/r1',
        {
            identity_id: 'current',
            at: '2021-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    // Still admitted — revocation bites at next mint/exchange.
    assert.deepEqual(
        await GET(db, 'members', live),
        await GET(db, 'members', await devToken()),
    );
});

test('a token minted within a revocation second still'
+ ' works until exp', async () => {
    const db = await freshDb();
    const revokedAt = '2021-01-01T00:00:00.900000Z';
    const sameSecond = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'current',
        roles: ['admin:1'],
        name: 'Demo',
        organizations: ['1'],
        iat: Math.floor(Date.parse(revokedAt) / 1000),
        ttlSeconds: 10_000_000_000,
        jti: 'same-second',
    });
    await PUT(
        db, 'identity-token-revocations/r1',
        { identity_id: 'current', at: revokedAt },
        await devToken(),
    );
    const rows = await GET<unknown[]>(db, 'members', sameSecond);
    assert.ok(Array.isArray(rows));
});

test('a jti revoked in the ledger still admits the access'
+ ' token until exp', async () => {
    const db = await freshDb();
    await PUT(
        db, 'identity-tokens/e1',
        {
            jti: 'dev-current', identity_id: 'current',
            action: 'issued', chain_id: 'c1',
            at: '2026-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    await PUT(
        db, 'identity-tokens/e2',
        {
            jti: 'dev-current', identity_id: 'current',
            action: 'revoked', chain_id: 'c1',
            at: '2026-02-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    const rows = await GET<unknown[]>(
        db, 'members', await devToken(),
    );
    assert.ok(Array.isArray(rows));
});

test('snapshots/schema needs no bearer even with a schema',
async () => {
    const db = await freshDb();   // schema + root admin
    // No bearer at all → still reaches the plane (auth-free).
    const bare = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`));
    assert.equal(bare.status, 200);
    // An admin reaches it too.
    const snap = await GET(
        db, 'snapshots/schema', await devToken());
    assert.ok(typeof snap === 'string');
});

test('a non-admin member reaches the snapshot plane',
async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'walt');
    const res = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`, {
            headers: {
                'Authorization':
                    'Bearer ' + await devToken('walt'),
            },
        }));
    assert.equal(res.status, 200);
});
