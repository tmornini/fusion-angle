import { assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    ANONYMOUS_ID,
} from '../api/access-token.ts';

async function tokenFor(sub: string): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'j-' + sub,
    });
}

Deno.test('identity is resolved once from the token', async () => {
    const ctx = createRequestContext(
        memoryDbAdapter(), await tokenFor('XXZruirZyAOoRpNxaDnpSA'));
    assertStrictEquals(ctx.identity.id, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(ctx.identity, ctx.identity);
});

Deno.test('an anonymous token yields the anonymous principal',
async () => {
    const ctx = createRequestContext(
        memoryDbAdapter(), await tokenFor(ANONYMOUS_ID));
    assertStrictEquals(ctx.identity.id, ANONYMOUS_ID);
});
