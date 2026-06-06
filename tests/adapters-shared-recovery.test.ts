// @ts-expect-error - Node global stub
globalThis.localStorage = (() => {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    };
})();

// Minimal DOM stubs so redirectToLogin (getPageName reads
// data-page; navigateTo sets window.location.href) runs in Node.
// @ts-expect-error - Node global stub
globalThis.window = { location: { href: '', search: '' } };
// @ts-expect-error - Node global stub
globalThis.document = {
    documentElement: { getAttribute: () => 'dashboard' },
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest, UnauthorizedError } from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { setSessionToken } from '../web-app/app/adapters/init.ts';
import {
    getSessionCredentials,
    putSessionCredentials,
} from '../web-app/app/adapters/session-credentials.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { expiredToken } from './token-fixtures.ts';

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

test('a recover context silently refreshes a dead access token',
async () => {
    localStorage.clear();
    const db = await freshDb();
    const pair = await issuePair(db);
    const deadAccess = await expiredToken();
    // the session holds a dead access token but a live refresh
    putSessionCredentials({
        accessToken: deadAccess,
        refreshToken: pair.refresh_token,
    });
    setSessionToken(deadAccess);
    const ctx = createRequestContext(
        db, deadAccess, { recover: true });
    // the 401 triggers refresh + org re-scope + one retry
    const members = await ctx.GET('members');
    assert.ok(Array.isArray(members));
});

test('recovery with both tokens dead scrubs and bounces',
async () => {
    localStorage.clear();
    window.location.href = '';
    const db = await freshDb();
    // both tokens dead → the resolver says login, not refresh
    const dead = await expiredToken();
    putSessionCredentials({
        accessToken: dead, refreshToken: dead,
    });
    setSessionToken(dead);
    const ctx = createRequestContext(
        db, dead, { recover: true });
    // the 401 is unrecoverable: the original error propagates
    await assert.rejects(
        () => ctx.GET('members'), UnauthorizedError);
    // the dead credential was scrubbed...
    assert.equal(getSessionCredentials(), null);
    // ...and the tab was redirected to the login page
    assert.match(
        window.location.href, /auth.*return=dashboard/);
});
