import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    GET, PUT, handleRequest,
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
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The verb fns always attach a Bearer header, so the
// missing-header path is reachable only via handleRequest.
Deno.test('rejects a request with no Authorization header',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(
            `${BASE}/organizations/AjdvjuECVZEgZoFajaIEkg/members/`));
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'invalid_token');
});

Deno.test('protected route accepts a valid token', async () => {
    const db = await freshDb();
    const rows = await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
        + '', await devToken());
    assert(Array.isArray(rows));
});

Deno.test('rejects an expired token', async () => {
    const db = await freshDb();
    await assertRejects(
        async () => GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , await expiredToken()),
        Error,
        'invalid_token',
    );
});

Deno.test('rejects a not-yet-valid token', async () => {
    const db = await freshDb();
    await assertRejects(
        async () => GET(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/',
            await notYetValidToken(),
        ),
        Error,
        'invalid_token',
    );
});

Deno.test('rejects the anonymous principal on a protected route',
async () => {
    const db = await freshDb();
    const anon = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: generateIdentifier(),
    });
    await assertRejects(
        () => GET(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', anon,
        ),
        Error,
        'invalid_token',
    );
});

// Per-request access-token revocation is RETIRED. Mint /
// refresh / exchange still consult the revocation ledger; a
// live access token works until exp (≤ ACCESS_TTL_SECONDS) —
// the NAMED staleness covenant. These cases pin that access
// GETs are NOT blocked by the revocation ledger mid-token.

Deno.test('a logout-everywhere does not kill a live access token',
async () => {
    const db = await freshDb();
    // Claim-bearing access token: fence uses claim orgs/roles,
    // not the revocation ledger.
    const live = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'XXZruirZyAOoRpNxaDnpSA',
        roles: ['admin:AjdvjuECVZEgZoFajaIEkg'],
        name: 'Demo',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat: 1_600_000_000, ttlSeconds: 10_000_000_000,
        jti: generateIdentifier(),
    });
    await PUT(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/token-revocations/'
            + 'rOEPOcVMQdJiiiMuiiEhlg',
        {
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2021-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    // Still admitted — revocation bites at next mint/exchange.
    assertEquals(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', live),
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , await devToken()),
    );
});

Deno.test('a token minted within a revocation second still'
+ ' works until exp', async () => {
    const db = await freshDb();
    const revokedAt = '2021-01-01T00:00:00.900000Z';
    const sameSecond = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'XXZruirZyAOoRpNxaDnpSA',
        roles: ['admin:AjdvjuECVZEgZoFajaIEkg'],
        name: 'Demo',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat: Math.floor(Date.parse(revokedAt) / 1000),
        ttlSeconds: 10_000_000_000,
        jti: generateIdentifier(),
    });
    await PUT(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/token-revocations/'
            + 'rOEPOcVMQdJiiiMuiiEhlg',
        { identity_id: 'XXZruirZyAOoRpNxaDnpSA', at: revokedAt },
        await devToken(),
    );
    const rows = await GET<unknown[]>(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', sameSecond,
    );
    assert(Array.isArray(rows));
});

Deno.test('a jti revoked in the ledger still admits the access'
+ ' token until exp', async () => {
    const db = await freshDb();
    await PUT(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + 'YiJPbufDpkyrZcZCYbUJpg',
        {
            jti: generateIdentifier(),
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: 'WeXjAaAxGSpLpamfEuvcww',
            at: '2026-01-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    await PUT(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + generateIdentifier(),
        {
            jti: generateIdentifier(),
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'revoked', chain_id: 'WeXjAaAxGSpLpamfEuvcww',
            at: '2026-02-01T00:00:00.000000Z',
        },
        await devToken(),
    );
    const rows = await GET<unknown[]>(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', await devToken(),
    );
    assert(Array.isArray(rows));
});
