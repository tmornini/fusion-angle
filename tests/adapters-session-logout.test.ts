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

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postSessionLogout,
} from '../web-app/app/adapters/session-logout.ts';
import {
    getSessionCredentials,
    putSessionCredentials,
} from '../web-app/app/adapters/session-credentials.ts';
import { devToken, orgToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

test('logout revokes this identity and clears credentials',
async () => {
    localStorage.clear();
    const { db, ctx } = await setup();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await orgToken(),
    });
    await postSessionLogout(ctx);
    const rows = await db.identityTokenRevocations.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.identity_id, 'current');
    assert.equal(getSessionCredentials(), null);
});

test('logout scrubs locally even when the revoke fails',
async () => {
    localStorage.clear();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await orgToken(),
    });
    // identity is read from the vessel; the server PUT throws.
    const ctx = {
        identity: { id: 'current' },
        PUT: async () => {
            throw new Error('revoke endpoint down');
        },
    } as unknown as RequestContext;
    await assert.rejects(
        () => postSessionLogout(ctx), /revoke endpoint down/);
    // teardown ran in finally despite the server fault
    assert.equal(getSessionCredentials(), null);
});
