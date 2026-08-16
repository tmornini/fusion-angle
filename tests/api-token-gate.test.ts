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
        db, new Request(
            `${BASE}/organizations/1/members`));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('protected route accepts a valid token', async () => {
    const db = await freshDb();
    const rows = await GET(db, 'organizations/1/members', await devToken());
    assert.ok(Array.isArray(rows));
});

test('rejects an expired token', async () => {
    const db = await freshDb();
    await assert.rejects(
        async () => GET(db, 'organizations/1/members', await expiredToken()),
        /invalid_token/);
});

test('rejects a not-yet-valid token', async () => {
    const db = await freshDb();
    await assert.rejects(
        async () => GET(
            db, 'organizations/1/members',
            await notYetValidToken(),
        ),
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
        () => GET(db, 'organizations/1/members', anon), /invalid_token/);
});

test('anonymous token is rejected on snapshots', async () => {
    const db = memoryDbAdapter();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon2',
    });
    await assert.rejects(
        () => GET(db, 'snapshots/schema', anon),
        /invalid_token/,
    );
});

test('anonymous may not seed snapshots',
async () => {
    const db = memoryDbAdapter();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon-boot',
    });
    await assert.rejects(
        () => POST(db, 'snapshots/mock-data', {}, anon),
        /invalid_token/,
    );
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
        db, 'identities/current/token-revocations/r1',
        {
            identity_id: 'current',
            at: '2021-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    // Still admitted — revocation bites at next mint/exchange.
    assert.deepEqual(
        await GET(db, 'organizations/1/members', live),
        await GET(db, 'organizations/1/members', await devToken()),
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
        db, 'identities/current/token-revocations/r1',
        { identity_id: 'current', at: revokedAt },
        await devToken(),
    );
    const rows = await GET<unknown[]>(
        db, 'organizations/1/members', sameSecond,
    );
    assert.ok(Array.isArray(rows));
});

test('a jti revoked in the ledger still admits the access'
+ ' token until exp', async () => {
    const db = await freshDb();
    await PUT(
        db, 'identities/current/tokens/e1',
        {
            jti: 'dev-current', identity_id: 'current',
            action: 'issued', chain_id: 'c1',
            at: '2026-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    await PUT(
        db, 'identities/current/tokens/e2',
        {
            jti: 'dev-current', identity_id: 'current',
            action: 'revoked', chain_id: 'c1',
            at: '2026-02-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    const rows = await GET<unknown[]>(
        db, 'organizations/1/members', await devToken(),
    );
    assert.ok(Array.isArray(rows));
});

test('snapshots/schema requires a bearer',
async () => {
    const db = await freshDb();
    const bare = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`));
    assert.equal(bare.status, 401);
    const snap = await GET(
        db, 'snapshots/schema', await devToken());
    assert.ok(typeof snap === 'string');
});

test('a non-admin member is forbidden on snapshots',
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
    assert.equal(res.status, 403);
});
