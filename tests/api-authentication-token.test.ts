import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    claimToken, devToken, reachableToken,
} from './token-fixtures.ts';
import {
    seededMockDb, testHashPassword,
} from './mock-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { captureConsole } from './fixtures/console-capture.ts';
import {
    makeAssertionSigner,
} from './client-assertion-fixtures.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    putMessagePair, formAuthMessagePair, formWriteMessagePair,
} from '../api/message-pair.ts';
import type { AuthMessagePairSeed } from '../api/message-pair.ts';
import { nowUtc } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import {
    authorizationCodeSpent, deriveAuthorizationCodeId,
} from '../api/authentication.ts';
import {
    deriveIdentityTokens,
} from '../api/derive-identity-tokens.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';
import {
    seedClientRegistration,
    seedClientRegistrationTombstone,
    seedIdentityCredential,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

const INVALID_CODE_ERROR = 'invalid_grant';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// Below-facade pair formation, mirroring authorizePassword's OWN
// storage effect (Phase 13 Task 7, Gate 3): grantAuthorizationCode
// 's pre-tx lookup reads by body containment the
// '/authentication/authorize/' response
// family for a stored pair whose `code` field equals the presented
// code, so a bare pair — the SAME shape a real login forms
// (Phase 13 Task 9: the authorization_codes row half retired) —
// is all a seed needs.
async function seedAuthorizationCodeMessagePair(
    db: MemoryDbAdapter,
    code: string,
    identityId: string,
    clientId: string,
    extras: { code_challenge?: string } = {},
): Promise<void> {
    const seed: AuthMessagePairSeed = {
        requestAt: nowUtc(),
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
    };
    const requestBody: Record<string, unknown> = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: clientId,
    };
    if (extras.code_challenge !== undefined) {
        requestBody.code_challenge = extras.code_challenge;
    }
    const messagePair = await formAuthMessagePair(
        seed, requestBody, identityId, 200, { code },
    );
    await putMessagePair(db, messagePair);
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the token-exchange org-scoping tests below authorize through
// memberships/role_grants once they derive from the message plane,
// so a raw row here would go derivation-invisible. Every
// id/field value stays IDENTICAL to the raw puts these replace —
// only the write mechanism changes.
async function seedMembershipMessagePair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(db, organization, organization);
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

function tokenRequest(body: Record<string, unknown>): Request {
    return new Request(`${BASE}/authentication/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

Deno.test('a missing bearer is 401 invalid_token', async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(), { error: 'invalid_token' });
});

Deno.test('a failed client assertion is 401 invalid_client',
async () => {
    const db = await freshDb();
    await seedClientRegistration(
        db, 'uYaHKbNeVUcsFjuooOjMew', activeClient,
    );
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: 'not-a-jwt',
    }));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(), { error: 'invalid_client' });
});

Deno.test('an unknown authorization code is 401 invalid_grant',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'ghost',
    }));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(), { error: 'invalid_grant' });
});

Deno.test('the token endpoint is reachable without a Bearer',
async () => {
    const db = await freshDb();
    // exempt route: no Authorization header still reaches the
    // handler — a 400 from the grant, not a 401 from the gate
    const res = await handleRequest(db, tokenRequest({}));
    assertStrictEquals(res.status, 400);
});

Deno.test('an unknown grant_type is a 400 with no side effects',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, tokenRequest({ grant_type: 'wat' }));
    assertStrictEquals(res.status, 400);
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, 0);
});

// authorization_code client binding: a code issued under
// client_id A is not redeemable under client_id B. Same shared
// 401 as unknown/spent/expired — grant-first, no mint.
// Two codes: mismatch first (codes are single-use), then match.
Deno.test('an authorization code is bound to its issuing client',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    await seedAuthorizationCodeMessagePair(
        db, 'code-for-a', 'XXZruirZyAOoRpNxaDnpSA', 'client-a');
    await seedAuthorizationCodeMessagePair(
        db, 'code-for-match', 'XXZruirZyAOoRpNxaDnpSA', 'client-a');
    const mismatch = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'code-for-a',
        client_id: 'client-b',
    }));
    assertStrictEquals(mismatch.status, 401);
    assertEquals(
        await mismatch.json(),
        { error: INVALID_CODE_ERROR },
    );
    const match = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'code-for-match',
        client_id: 'client-a',
    }));
    assertStrictEquals(match.status, 201);
});

// PKCE S256 (RFC 7636): when authorize stored a code_challenge,
// redeem requires code_verifier whose S256 matches. Missing or
// wrong verifier is the same shared 401 as unknown/spent —
// grant-first, no mint. No challenge stored = current behavior
// (password-loop demo keeps working without PKCE).
async function s256Challenge(
    verifier: string,
): Promise<string> {
    return bytesToBase64Url(await sha256Bytes(verifier));
}

Deno.test('authorization_code with PKCE accepts a matching verifier',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const verifier = 'pkce-verifier-correct-value';
    const challenge = await s256Challenge(verifier);
    await seedAuthorizationCodeMessagePair(
        db, 'pkce-code-ok', 'XXZruirZyAOoRpNxaDnpSA', 'web',
        { code_challenge: challenge },
    );
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'pkce-code-ok',
        client_id: 'web',
        code_verifier: verifier,
    }));
    assertStrictEquals(res.status, 201);
});

Deno.test('authorization_code with PKCE rejects a wrong verifier',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const challenge = await s256Challenge(
        'pkce-verifier-correct-value',
    );
    await seedAuthorizationCodeMessagePair(
        db, 'pkce-code-bad', 'XXZruirZyAOoRpNxaDnpSA', 'web',
        { code_challenge: challenge },
    );
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'pkce-code-bad',
        client_id: 'web',
        code_verifier: 'pkce-verifier-WRONG',
    }));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(),
        { error: INVALID_CODE_ERROR },
    );
});

Deno.test('authorization_code with PKCE rejects a missing verifier',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const challenge = await s256Challenge(
        'pkce-verifier-correct-value',
    );
    await seedAuthorizationCodeMessagePair(
        db, 'pkce-code-none', 'XXZruirZyAOoRpNxaDnpSA', 'web',
        { code_challenge: challenge },
    );
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'pkce-code-none',
        client_id: 'web',
    }));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(),
        { error: INVALID_CODE_ERROR },
    );
});

function setCookieHeader(res: Response): string {
    const cookies = typeof res.headers.getSetCookie
        === 'function'
        ? res.headers.getSetCookie()
        : [];
    if (cookies.length > 0) {
        return cookies.join('\n');
    }
    return res.headers.get('Set-Cookie') ?? '';
}

function refreshTokenFromSetCookie(res: Response): string {
    const cookie = setCookieHeader(res);
    const match = /(?:^|[\n,])\s*refresh_token=([^;\n]+)/
        .exec(cookie);
    assert(match, 'Set-Cookie missing refresh_token');
    return match[1]!.trim();
}

Deno.test('token JSON has no refresh_token; Set-Cookie is HttpOnly',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    await seedAuthorizationCodeMessagePair(
        db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
        client_id: 'web',
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as Record<string, unknown>;
    assertStrictEquals(body['refresh_token'], undefined);
    assertStrictEquals(typeof body['access_token'], 'string');
    const cookie = setCookieHeader(res);
    assertMatch(cookie, /refresh_token=/);
    assertMatch(cookie, /HttpOnly/i);
    assertMatch(cookie, /Path=\/api\/authentication/);
    assertMatch(cookie, /SameSite=Strict/i);
});

Deno.test('authorization_code grant issues a gate-valid token pair',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);   // 'XXZruirZyAOoRpNxaDnpSA' is admin
    await seedAuthorizationCodeMessagePair(
        db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
        client_id: 'web',
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as {
        access_token: string;
        token_type: string; expires_in: number;
    };
    assertStrictEquals(body.token_type, 'Bearer');
    assert(body.access_token.length > 0);
    assertStrictEquals(
        (body as { refresh_token?: unknown }).refresh_token,
        undefined,
    );
    const refreshToken = refreshTokenFromSetCookie(res);
    assert(refreshToken.length > 0);
    // act.sub carries the acting client (RFC 8693 shape,
    // mirroring token-exchange); sub stays the user. The
    // refresh token never carries act.
    const claims = decodeAccessToken(body.access_token);
    assertStrictEquals(claims.sub, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(claims.act?.sub, 'web');
    assertStrictEquals(
        decodeAccessToken(refreshToken).act,
        undefined,
    );
    // the minted access token passes the SP-3 gate
    const rows = await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
        + '', body.access_token);
    assert(Array.isArray(rows));
});

Deno.test('replaying a consumed code is a 401 no-op', async () => {
    const db = await freshDb();
    await seedAuthorizationCodeMessagePair(
        db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const first = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
        client_id: 'web',
    }));
    assertStrictEquals(first.status, 201);
    const before = (await deriveIdentityTokens(db)).length;
    const replay = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
        client_id: 'web',
    }));
    assertStrictEquals(replay.status, 401);
    // no new token chain minted on the replay
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, before);
});

Deno.test(
    'concurrent authorization_code grants spend the'
    + ' code exactly once',
    async () => {
        const db = await freshDb();
        await seedRootAdmin(db);
        await seedAuthorizationCodeMessagePair(
            db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web');
        const [a, b] = await Promise.all([
            handleRequest(db, tokenRequest({
                grant_type: 'authorization_code',
                code: 'the-code',
                client_id: 'web',
            })),
            handleRequest(db, tokenRequest({
                grant_type: 'authorization_code',
                code: 'the-code',
                client_id: 'web',
            })),
        ]);
        assertEquals(
            [a.status, b.status].sort(), [201, 401],
        );
        assertStrictEquals(
            (await deriveIdentityTokens(db)).length, 1,
            'exactly one token chain minted',
        );
    },
);

Deno.test('an unknown code is a 401', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'ghost',
    }));
    assertStrictEquals(res.status, 401);
});

// GATE 3 (Phase 13 Task 7): the code-spend guard's three 401
// classes — unknown (never issued), spent (replayed), raced
// (lost a concurrent exchange) — all carry the SAME byte-exact
// body. The message-plane guard (authorizeCodeIssuer /
// authorizationCodeSpent, api/authentication.ts) makes no
// distinction between them at the wire, exactly as the retired
// codeState-driven guard never did either.
Deno.test('GATE 3: unknown / spent / raced code all 401 with the'
+ ' SAME byte-exact body', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);

    const unknown = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'ghost',
    }));
    assertStrictEquals(unknown.status, 401);
    assertEquals(
        await unknown.json(), { error: INVALID_CODE_ERROR });

    await seedAuthorizationCodeMessagePair(
        db, 'the-code-spent', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const first = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'the-code-spent',
        client_id: 'web',
    }));
    assertStrictEquals(first.status, 201);
    const spent = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code',
        code: 'the-code-spent',
        client_id: 'web',
    }));
    assertStrictEquals(spent.status, 401);
    assertEquals(
        await spent.json(), { error: INVALID_CODE_ERROR });

    await seedAuthorizationCodeMessagePair(
        db, 'the-code-raced', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const [a, b] = await Promise.all([
        handleRequest(db, tokenRequest({
            grant_type: 'authorization_code',
            code: 'the-code-raced',
            client_id: 'web',
        })),
        handleRequest(db, tokenRequest({
            grant_type: 'authorization_code',
            code: 'the-code-raced',
            client_id: 'web',
        })),
    ]);
    assertEquals([a.status, b.status].sort(), [201, 401]);
    const raced = a.status === 401 ? a : b;
    assertEquals(
        await raced.json(), { error: INVALID_CODE_ERROR });

    // The derived id itself: a live-minted spend is visible on
    // the message plane by exactly that id, the SAME value the
    // guard above already checked internally.
    const derivedId =
        await deriveAuthorizationCodeId('the-code-spent');
    assertStrictEquals(
        await authorizationCodeSpent(db, derivedId, 'XXZruirZyAOoRpNxaDnpSA'),
        true);
});

async function initialPair(
    db: MemoryDbAdapter,
): Promise<{ access_token: string; refresh_token: string }> {
    await seedAuthorizationCodeMessagePair(
        db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web');
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
        client_id: 'web',
    }));
    const body = await res.json() as { access_token: string };
    return {
        access_token: body.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
}

Deno.test('refresh grant rotates from the Cookie, not the body',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: 'refresh_token=' + pair1.refresh_token,
            },
            body: JSON.stringify({ grant_type: 'refresh' }),
        }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as Record<string, unknown>;
    assertStrictEquals(body['refresh_token'], undefined);
    assert(typeof body['access_token'] === 'string');
    assertNotStrictEquals(
        refreshTokenFromSetCookie(res), pair1.refresh_token);
    assert(Array.isArray(
        await GET(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/',
            body['access_token'] as string,
        )));
});

Deno.test('stale body refresh_token loses to a live Cookie',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const rotated = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    assertStrictEquals(rotated.status, 201);
    const liveCookie = refreshTokenFromSetCookie(rotated);
    const res = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: 'refresh_token=' + liveCookie,
            },
            body: JSON.stringify({
                grant_type: 'refresh',
                refresh_token: pair1.refresh_token,
            }),
        }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as {
        access_token: string;
    };
    assert(Array.isArray(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , body.access_token)));
});

Deno.test('refresh rotates to a new pair', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    assertStrictEquals(res.status, 201);
    const pair2 = await res.json() as {
        access_token: string;
    };
    assertNotStrictEquals(
        refreshTokenFromSetCookie(res), pair1.refresh_token);
    assert(Array.isArray(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , pair2.access_token)));
});

Deno.test('replaying a rotated refresh token revokes the chain',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const rotated = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    const pair2 = {
        refresh_token: refreshTokenFromSetCookie(rotated),
    };
    // replay the now-rotated pair1 token → reuse detected
    const replay = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    assertStrictEquals(replay.status, 401);
    // the whole chain is dead — even the new refresh fails
    const after = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair2.refresh_token,
    }));
    assertStrictEquals(after.status, 401);
});

Deno.test('an invalid refresh token is a 401 no-op', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'refresh', refresh_token: 'not.a.jwt',
    }));
    assertStrictEquals(res.status, 401);
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, 0);
});

Deno.test('token-exchange shapes sub=subject and act=actor',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        actor_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assertStrictEquals(claims.sub, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(claims.act?.sub, 'XXZruirZyAOoRpNxaDnpSA');
    // the delegated token passes the gate (current = admin)
    assert(Array.isArray(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , body.access_token)));
});

Deno.test('token-exchange 201 has no refresh Set-Cookie',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair = await initialPair(db);
    const rotated = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: 'refresh_token=' + pair.refresh_token,
            },
            body: JSON.stringify({ grant_type: 'refresh' }),
        }));
    assertStrictEquals(rotated.status, 201);
    assertMatch(setCookieHeader(rotated), /refresh_token=/);
    const access = (await rotated.json() as {
        access_token: string;
    }).access_token;
    const exchange = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: access,
        actor_token: access,
    }));
    assertStrictEquals(exchange.status, 201);
    const body = await exchange.json() as Record<
        string, unknown
    >;
    assertStrictEquals(body['refresh_token'], undefined);
    assertStrictEquals(setCookieHeader(exchange), '');
});

Deno.test('token-exchange denies cross-party delegation',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const before =
        (await deriveIdentityTokens(db)).length;
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        actor_token: await devToken('agent-7'),
    }));
    assertStrictEquals(res.status, 403);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /self-delegation/);
    // grant-first: a denied exchange mints nothing
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, before);
});

Deno.test('token-exchange rejects unverifiable tokens with 401',
async () => {
    const db = await freshDb();
    // missing tokens, and a structurally-present but unsigned
    // token, both fail verification (signature/exp/aud)
    assertStrictEquals((await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
    }))).status, 401);
    assertStrictEquals((await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: 'a.b.c', actor_token: 'a.b.c',
    }))).status, 401);
});

Deno.test('token-exchange into a member org carries org + orgs',
async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, 'm-current', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        actor_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organization: 'AjdvjuECVZEgZoFajaIEkg',
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assertStrictEquals(claims.organization, 'AjdvjuECVZEgZoFajaIEkg');
    assertEquals(claims.organizations, ['AjdvjuECVZEgZoFajaIEkg']);
});

Deno.test('token-exchange into a non-member org is 403',
async () => {
    const db = await freshDb();
    // current is a member of 'AjdvjuECVZEgZoFajaIEkg' but not org '7'
    await seedMembershipMessagePair(db, 'm-current', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const before =
        (await deriveIdentityTokens(db)).length;
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        actor_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organization: '7',
    }));
    assertStrictEquals(res.status, 403);
    // grant-first: a denied exchange mints nothing
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, before);
});

Deno.test('a flat exchange carries orgs but no active org',
async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, 'm-current', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
        actor_token: await devToken('XXZruirZyAOoRpNxaDnpSA'),
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assertStrictEquals(claims.organization, undefined);
    assertEquals(claims.organizations, ['AjdvjuECVZEgZoFajaIEkg']);
});

const activeClient = {
    grant_types: 'client_credentials',
    redirect_uris: '', jwks: '{"keys":[]}',
    aud: 'fusion-angle', status: 'active',
};

// A really-signed assertion: fresh in-test key pair, public
// JWKS registered on the client row, RFC 7523 claims.
async function signedClientSetup() {
    const signer = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signer.sign({
        iss: 'uYaHKbNeVUcsFjuooOjMew', sub: 'uYaHKbNeVUcsFjuooOjMew',
        aud: 'fusion-angle',
        exp: now + 300, iat: now, jti: 'assert-1',
    });
    return {
        client: { ...activeClient, jwks: signer.jwks },
        assertion,
    };
}

Deno.test('client_credentials issues a gate-valid token', async () => {
    const db = await freshDb();
    // the service principal (client id) holds an admin role
    await seedMembershipMessagePair(db, 'm-svc', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'uYaHKbNeVUcsFjuooOjMew',
        type: 'member',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', client);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as { access_token: string };
    assert(Array.isArray(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , body.access_token)));
    assertNotStrictEquals(
        decodeAccessToken(body.access_token).jti, 'assert-1',
    );
});

Deno.test('a second client_credentials grant with the same jti'
+ ' is 401 invalid_grant and mints nothing', async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, 'm-svc-replay', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'uYaHKbNeVUcsFjuooOjMew',
        type: 'member',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', client);
    const first = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(first.status, 201);
    const before = await db.messagePairs.getAll();
    const grantCount = before.filter((row) =>
        row.uri_collection === '/authentication/token/',
    ).length;
    const eventCount = before.filter((row) =>
        row.uri_collection === '/identities/uYaHKbNeVUcsFjuooOjMew/tokens/',
    ).length;
    const second = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(second.status, 401);
    assertEquals(
        await second.json(), { error: 'invalid_grant' },
    );
    const after = await db.messagePairs.getAll();
    assertStrictEquals(
        after.filter((row) =>
            row.uri_collection === '/authentication/token/',
        ).length,
        grantCount,
    );
    assertStrictEquals(
        after.filter((row) =>
            row.uri_collection ===
                '/identities/uYaHKbNeVUcsFjuooOjMew/tokens/'
                + '',
        ).length,
        eventCount,
    );
});

Deno.test('an expired assertion-jti ticket is still spent',
async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, 'm-svc-expired', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'uYaHKbNeVUcsFjuooOjMew',
        type: 'member',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const signer = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const jti = 'assert-expired-spent';
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', {
        ...activeClient, jwks: signer.jwks,
    });
    const ticket = await formWriteMessagePair({
        method: 'PUT',
        pathname:
            '/authentication/assertion-jtis/' + jti,
        routePattern:
            'authentication/assertion-jtis/:jti',
        routeSegments: [
            'authentication', 'assertion-jtis', ':jti',
        ],
        pathSegments: [
            'authentication', 'assertion-jtis', jti,
        ],
        headerFields: [],
        body: { exp: now - 60 },
        requesterIdentityId: 'uYaHKbNeVUcsFjuooOjMew',
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: 200,
        responseBody: { exp: now - 60 },
        operationId: TEST_OPERATION_ID,
    });
    await putMessagePair(db, ticket);
    const assertion = await signer.sign({
        iss: 'uYaHKbNeVUcsFjuooOjMew', sub: 'uYaHKbNeVUcsFjuooOjMew',
        aud: 'fusion-angle',
        exp: now + 300, iat: now, jti,
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(res.status, 401);
    assertEquals(
        await res.json(), { error: 'invalid_grant' },
    );
    assertStrictEquals(
        (await deriveIdentityTokens(db)).length, 0,
    );
});

Deno.test('client_credentials refuses an unsigned assertion',
async () => {
    const db = await freshDb();
    const { client } = await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', client);
    // Well-formed JWT shape, right claims, NO valid
    // signature from the registered key.
    const impostor = await makeAssertionSigner('ES256');
    const now = Math.floor(Date.now() / 1000);
    const forged = await impostor.sign({
        iss: 'uYaHKbNeVUcsFjuooOjMew', sub: 'uYaHKbNeVUcsFjuooOjMew',
        aud: 'fusion-angle',
        exp: now + 300, iat: now, jti: 'assert-2',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: forged,
    }));
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'invalid_client');
});

Deno.test('client_credentials with a malformed assertion is 401',
async () => {
    const db = await freshDb();
    await seedClientRegistration(
        db, 'uYaHKbNeVUcsFjuooOjMew', activeClient,
    );
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: 'not-a-jwt',
    }));
    assertStrictEquals(res.status, 401);
});

Deno.test('client_credentials for an unknown client is 401',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'ghost', client_assertion: 'a.b.c',
    }));
    assertStrictEquals(res.status, 401);
});

Deno.test('a registration-read fault is a 500, never 401',
async () => {
    const db = await freshDb();
    // Only an EntityNotFoundError means 'unknown client';
    // any other fault is a bug and must surface, not wear a
    // 401 mask. The derive's first read is
    // requests.getAllWhere — the fault-injection point that
    // replaced the retired rawReadRow stub.
    (db.messagePairs as unknown as {
        getAllWhere: () => Promise<never>;
    }).getAllWhere = async () => {
        throw new Error('store exploded');
    };
    const { result: res, calls } = await captureConsole(
        'error',
        () => handleRequest(db, tokenRequest({
            grant_type: 'client_credentials',
            client_id: 'uYaHKbNeVUcsFjuooOjMew',
            client_assertion: 'a.b.c',
        })),
    );
    assertStrictEquals(res.status, 500);
    assert(
        calls.some(args =>
            args.includes('request failed')),
        'the domain-boundary catch must keep'
        + ' console evidence',
    );
});

Deno.test('client_credentials for a disabled registration is 401',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', {
        ...client, status: 'disabled',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /client is disabled/);
});

Deno.test('client_credentials without the grant type is 400',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', {
        ...client, grant_types: 'authorization_code',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(res.status, 400);
});

Deno.test('client_credentials for a deregistered client is 401',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'uYaHKbNeVUcsFjuooOjMew', client);
    await seedClientRegistrationTombstone(db, 'uYaHKbNeVUcsFjuooOjMew');
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'uYaHKbNeVUcsFjuooOjMew',
        client_assertion: assertion,
    }));
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /unknown client/);
});

// A person identity with a password and no seat anywhere,
// minted on top of the mock seed. The slice seed used to
// supply one; the covenant is the token's silence about
// organizations, not where the identity came from.
const UNSEATED = 'dtmZgnDBlVcoyjxKzlaKgA';
const UNSEATED_CREDENTIAL = 'CYr8sAaDTpCQEUSZUqUxOg';
const UNSEATED_EMAIL = 'unseated@example.com';
const UNSEATED_PASSWORD = 'unseated-s3cret';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const STARK_ADMIN = 'XXZruirZyAOoRpNxaDnpSA';

Deno.test('unseated password grant has no org claims',
async () => {
    const db = await seededMockDb();
    await seedPersonIdentity(db, UNSEATED, {
        name: 'Unseated Person',
        email: UNSEATED_EMAIL,
        phone: '+1 (555) 000-0000',
        bio: 'Invited, not yet seated.',
    });
    await seedIdentityCredential(
        db, UNSEATED, UNSEATED_CREDENTIAL, {
            identity_id: UNSEATED,
            kind: 'password',
            status: 'set',
            secret: await testHashPassword(
                UNSEATED_PASSWORD,
            ),
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
    const password = UNSEATED_PASSWORD;
    const starkOrganization = STARK;
    const starkAdmin = STARK_ADMIN;
    const verifier = 'pkce-verifier-unseated';
    const challenge = await s256Challenge(verifier);
    const authorized = await handleRequest(
        db,
        new Request(`${BASE}/authentication/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                method: 'password',
                username: UNSEATED_EMAIL,
                password,
                client_id: 'web',
                code_challenge: challenge,
                code_challenge_method: 'S256',
            }),
        }),
    );
    assertStrictEquals(authorized.status, 201);
    const { code } = await authorized.json() as {
        code: string;
    };
    const exchanged = await handleRequest(
        db, tokenRequest({
            grant_type: 'authorization_code',
            code, client_id: 'web',
            code_verifier: verifier,
        }),
    );
    assertStrictEquals(exchanged.status, 201);
    const exchangedBody = await exchanged.json() as {
        access_token: string;
    };
    const exchangedClaims = decodeAccessToken(
        exchangedBody.access_token,
    );
    assertStrictEquals(
        exchangedClaims.organization, undefined,
    );
    assertStrictEquals(
        exchangedClaims.organizations, undefined,
    );
    const seats = await handleRequest(db, new Request(
        `${BASE}/identities/` + UNSEATED
            + '/organizations/',
        {
            headers: {
                Authorization: 'Bearer '
                    + exchangedBody.access_token,
            },
        },
    ));
    assertStrictEquals(seats.status, 200);
    assertEquals(await seats.json(), []);
    const refreshToken =
        refreshTokenFromSetCookie(exchanged);
    const refreshed = await handleRequest(
        db, new Request(
            `${BASE}/authentication/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: 'refresh_token='
                        + refreshToken,
                },
                body: JSON.stringify({
                    grant_type: 'refresh',
                }),
            },
        ),
    );
    assertStrictEquals(refreshed.status, 201);
    const refreshedBody = await refreshed.json() as {
        access_token: string;
    };
    const refreshedClaims = decodeAccessToken(
        refreshedBody.access_token,
    );
    assertStrictEquals(
        refreshedClaims.organization, undefined,
    );
    assertStrictEquals(
        refreshedClaims.organizations, undefined,
    );
    const starkAdminToken = await claimToken({
        sub: starkAdmin,
        organization: starkOrganization,
        organizations: [starkOrganization],
        roles: ['admin:' + starkOrganization],
    });
    const granted = await handleRequest(db, new Request(
        `${BASE}/organizations/` + starkOrganization
            + '/invitations/',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + starkAdminToken,
                'operation-id': generateIdentifier(),
            },
            body: JSON.stringify({
                email: UNSEATED_EMAIL,
                invitationId: generateIdentifier(),
                grantEventId: generateIdentifier(),
                grantAt: nowUtc(),
            }),
        },
    ));
    assertStrictEquals(granted.status, 200);
    const pending = await handleRequest(db, new Request(
        `${BASE}/identities/` + UNSEATED
            + '/invitations/',
        {
            headers: {
                Authorization: 'Bearer '
                    + refreshedBody.access_token,
            },
        },
    ));
    assertStrictEquals(pending.status, 200);
    const invitations = await pending.json() as {
        state: string;
    }[];
    assertStrictEquals(invitations.length, 1);
    assertStrictEquals(invitations[0]!.state, 'pending');
    const reachableClaims = decodeAccessToken(
        await reachableToken(UNSEATED, []),
    );
    assertEquals(
        reachableClaims.organizations, [],
    );
    assertEquals(
        exchangedClaims.organizations ?? [],
        reachableClaims.organizations ?? [],
    );
    assertEquals(
        refreshedClaims.organizations ?? [],
        reachableClaims.organizations ?? [],
    );
});

