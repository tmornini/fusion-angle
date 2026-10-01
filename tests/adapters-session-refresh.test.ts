import {
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, UnauthorizedError } from '../api/api.ts';
import { inPageContext, GET } from './in-page-facade.ts';
import {
    postSessionRefresh,
} from '../client/session-refresh.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    runWrite,
    attemptFor,
    formAuthMessagePair,
    formWriteMessagePair,
} from '../api/message-pair.ts';
import type { AuthMessagePairSeed } from '../api/message-pair.ts';
import { nowUtc } from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { sha256Hex } from '../shared/digest.ts';
import {
    framedRequest,
    presentedFields,
    refreshTokenFromSetCookie,
} from './http-fixtures.ts';
import { basicAuthorization } from
    '../api/authentication.ts';
import { operationIdHeader } from './operation-id-header.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
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
): Promise<void> {
    const seed: AuthMessagePairSeed = {
        requestAt: nowUtc(),
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
        bodyBytes: new Uint8Array(),
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    };
    const requestBody = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: 'web',
    };
    const messagePair = await formAuthMessagePair(
        {
            ...seed,
            bodyBytes: new TextEncoder().encode(
                JSON.stringify(requestBody),
            ),
        },
        requestBody, 'XXZruirZyAOoRpNxaDnpSA', undefined,
        seed.operationId, seed.requestId,
        [{
            name: 'authentication-info',
            value: 'code="' + code + '"',
        }],
    );
    const codeName = await sha256Hex(code);
    const codePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/authentication/authorization-codes/'
            + codeName,
        routePattern:
            'authentication/authorization-codes/:hash',
        routeSegments: [
            'authentication',
            'authorization-codes',
            ':hash',
        ],
        pathSegments: [
            'authentication',
            'authorization-codes',
            codeName,
        ],
        headerFields: [],
        body: undefined,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: seed.requestAt,
        organization: undefined,
        responseBody: { client_id: 'web' },
        operationId: seed.operationId,
        requestId: seed.requestId,
        genesis: 'handler',
        emptyRequest: true,
    });
    await runWrite(
        db,
        attemptFor([codePair, messagePair]),
        [codePair, messagePair],
    );
}

// Drive the real authorization_code grant to mint a genuine
// token chain — there is no shortcut fixture for refresh tokens.
async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodeMessagePair(db, 'the-code');
    const res = await handleRequest(db, framedRequest(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: basicAuthorization(
                    'the-code', '',
                ),
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: 'web',
            }),
        }));
    const body = await presentedFields(res) as {
        access_token: string;
    };
    return {
        access_token: body.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
}

Deno.test('a live refresh token rotates to a usable pair',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = inPageContext(db, await devToken());
    const creds =
        await postSessionRefresh(ctx, pair.refresh_token);
    assertNotStrictEquals(creds.refreshToken, pair.refresh_token);
    assertStrictEquals((await GET(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/',
        creds.accessToken, operationIdHeader(),
    )).query('status').toNumber(), 200);
});

Deno.test('a garbage refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const ctx = inPageContext(db, await devToken());
    await assertRejects(
        () => postSessionRefresh(ctx, 'not.a.jwt'),
        UnauthorizedError);
});

Deno.test('a reused refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = inPageContext(db, await devToken());
    await postSessionRefresh(ctx, pair.refresh_token);
    // the rotated-away token is now poison — reuse → 401
    await assertRejects(
        () => postSessionRefresh(ctx, pair.refresh_token),
        UnauthorizedError);
});
