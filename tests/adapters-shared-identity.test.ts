import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    mintAccessToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';

function tokenFor(sub: string): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'j-' + sub,
    });
}

test('identity is resolved once from the token', () => {
    const ctx = createRequestContext(
        new MemoryDbAdapter(), tokenFor('current'));
    assert.equal(ctx.identity.id, 'current');
    assert.equal(ctx.identity, ctx.identity);
});

test('an anonymous token yields the anonymous principal', () => {
    const ctx = createRequestContext(
        new MemoryDbAdapter(), tokenFor(ANONYMOUS_ID));
    assert.equal(ctx.identity.id, ANONYMOUS_ID);
});
