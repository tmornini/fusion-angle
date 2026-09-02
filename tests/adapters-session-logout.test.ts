import { assertRejects, assertStrictEquals } from '@std/assert';
import {
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
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

// A fresh Map-backed fake per test — bodies below reach
// localStorage only through the session adapter; clear()
// is the fake's own reset, which no body calls.
function freshStorage(): Partial<Storage> {
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
}

Deno.test('logout revokes this identity and clears credentials',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, ctx } = await adminContext();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    });
    await postSessionLogout(ctx);
    // Phase Final Task 2: identity_token_revocations ROW half
    // stripped — oracle is the message plane.
    const rows = await deriveTokenRevocationsFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    // Phase Final Stage B: identity spine tables retired.
    assertStrictEquals(getSessionCredentials(), null);
}));

Deno.test('logout scrubs locally even when the revoke fails',
() => withLocalStorageAsync(freshStorage(), async () => {
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
    await assertRejects(
        () => postSessionLogout(ctx),
        Error,
        'revoke endpoint down',
    );
    // teardown ran in finally despite the server fault
    assertStrictEquals(getSessionCredentials(), null);
}));
