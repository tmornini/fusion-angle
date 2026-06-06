import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    GET, handleRequest, UnauthorizedError,
} from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postSessionRefresh,
} from '../web-app/app/adapters/session-refresh.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';

const issuedCode = {
    code: 'the-code', identity_id: 'current',
    client_id: 'web', status: 'issued',
    at: '2026-06-03T00:00:00.000Z',
};

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return db;
}

// Drive the real authorization_code grant to mint a genuine
// token chain — there is no shortcut fixture for refresh tokens.
async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await db.authorizationCodes.put('ev1', issuedCode);
    const res = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: 'the-code',
            }),
        }));
    return res.json();
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
        await GET(db, 'members', creds.accessToken)));
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
