import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    GET, handleRequest, UnauthorizedError,
} from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postSessionRefresh,
} from '../web-app/app/adapters/session-refresh.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    putMessagePair, formAuthPair,
} from '../api/message-pair.ts';
import type { AuthPairSeed } from '../api/message-pair.ts';
import { nowUtc } from '../api/types.ts';
import { refreshTokenFromSetCookie } from './http-fixtures.ts';

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
async function seedAuthorizationCodePair(
    db: MemoryDbAdapter,
    code: string,
): Promise<void> {
    const seed: AuthPairSeed = {
        requestAt: nowUtc(),
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
    };
    const requestBody = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: 'web',
    };
    const pair = await formAuthPair(
        seed, requestBody, 'current', 200, { code },
    );
    await putMessagePair(db, pair);
}

// Drive the real authorization_code grant to mint a genuine
// token chain — there is no shortcut fixture for refresh tokens.
async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodePair(db, 'the-code');
    const res = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: 'the-code',
                client_id: 'web',
            }),
        }));
    const body = await res.json() as { access_token: string };
    return {
        access_token: body.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
}

test('a live refresh token rotates to a usable pair',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = createRequestContext(db, await devToken());
    const creds =
        await postSessionRefresh(ctx, pair.refresh_token);
    assert.notEqual(creds.refreshToken, pair.refresh_token);
    assert.ok(Array.isArray(
        await GET(db, 'organizations/1/members', creds.accessToken)));
});

test('a garbage refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const ctx = createRequestContext(db, await devToken());
    await assert.rejects(
        () => postSessionRefresh(ctx, 'not.a.jwt'),
        UnauthorizedError);
});

test('a reused refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = createRequestContext(db, await devToken());
    await postSessionRefresh(ctx, pair.refresh_token);
    // the rotated-away token is now poison — reuse → 401
    await assert.rejects(
        () => postSessionRefresh(ctx, pair.refresh_token),
        UnauthorizedError);
});
