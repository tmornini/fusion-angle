import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    freshStorage,
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
import {
    type RequestContext,
} from '../client/request-context.ts';
import {
    postSessionLogout,
} from '../client/session-logout.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageClient } from './in-page-facade.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import { deriveTokenRevocationsFor } from
    '../api/derive-identity-spine.ts';

Deno.test('logout revokes this identity and clears credentials',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db, ctx } = await adminContext();
    ctx.session.putSessionCredentials({
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
    assertStrictEquals(ctx.session.getSessionCredentials(), null);
}));

Deno.test('logout scrubs locally even when the revoke fails',
() => withLocalStorageAsync(freshStorage(), async () => {
    const client = inPageClient(memoryDbAdapter());
    client.putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    });
    // identity is read from the vessel; the server PUT throws.
    const ctx = {
        identity: { id: 'XXZruirZyAOoRpNxaDnpSA' },
        session: client,
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
    assertStrictEquals(client.getSessionCredentials(), null);
}));

Deno.test('logout scrubs the session its context carries',
async () => {
    const scrubbed: string[] = [];
    const { ctx } = await adminContext();
    await postSessionLogout({
        ...ctx,
        session: {
            ...ctx.session,
            deleteSessionCredentials: () => {
                scrubbed.push('credentials');
            },
            deleteSessionToken: () => {
                scrubbed.push('token');
            },
        },
    });
    assertEquals(scrubbed, ['credentials', 'token']);
});
