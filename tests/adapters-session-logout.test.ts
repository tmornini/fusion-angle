// @ts-expect-error — Node global stub
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
import {
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postSessionLogout,
} from '../web-app/app/adapters/session-logout.ts';
import {
    getSessionCredentials,
    putSessionCredentials,
} from '../web-app/app/adapters/session-credentials.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import { deriveTokenRevocationsFor } from
    '../api/derive-identity-spine.ts';

test('logout revokes this identity and clears credentials',
async () => {
    localStorage.clear();
    const { db, ctx } = await adminContext();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    });
    await postSessionLogout(ctx);
    // Phase Final Task 2: identity_token_revocations ROW half
    // stripped — oracle is the pair plane.
    const rows = await deriveTokenRevocationsFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    // Phase Final Stage B: identity spine tables retired.
    assert.equal(getSessionCredentials(), null);
});

test('logout scrubs locally even when the revoke fails',
async () => {
    localStorage.clear();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    });
    // identity is read from the vessel; the server PUT throws.
    const ctx = {
        identity: { id: 'XXZruirZyAOoRpNxaDnpSA' },
        PUT: async () => {
            throw new Error('revoke endpoint down');
        },
    } as unknown as RequestContext;
    await assert.rejects(
        () => postSessionLogout(ctx), /revoke endpoint down/);
    // teardown ran in finally despite the server fault
    assert.equal(getSessionCredentials(), null);
});
