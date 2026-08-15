import { test, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createHttpFacade,
} from '../web-app/app/adapters/http-facade.ts';
import {
    createRecoveringRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    setCookieSession,
} from '../web-app/app/adapters/session-credentials.ts';
import { putSessionToken } from
    '../web-app/app/adapters/session-token.ts';
import { runSingleFlightRefresh } from
    '../web-app/app/adapters/session-refresh-mutex.ts';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import { expiredToken } from './token-fixtures.ts';

afterEach(() => {
    setCookieSession(false);
});

async function withMockFetch(
    handler: typeof fetch,
    run: () => Promise<void>,
): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = handler;
    try {
        await run();
    } finally {
        globalThis.fetch = original;
    }
}

test('two concurrent 401s cause one refresh POST',
async () => {
    setCookieSession(true);
    putSessionToken('dead-access');
    let refreshPosts = 0;
    let nextAccess = 0;
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            refreshPosts += 1;
            nextAccess += 1;
            return new Response(
                JSON.stringify({
                    access_token: 'fresh-' + nextAccess,
                    token_type: 'Bearer',
                    expires_in: 900,
                }),
                { status: 200 },
            );
        }
        const token = new Headers(init?.headers)
            .get('Authorization');
        if (token === 'Bearer dead-access') {
            return new Response(
                JSON.stringify({ error: 'invalid_token' }),
                { status: 401 },
            );
        }
        return new Response('[]', { status: 200 });
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
        );
        const [a, b] = await Promise.all([
            facade.GET('members', 'dead-access'),
            facade.GET('ideas', 'dead-access'),
        ]);
        assert.ok(Array.isArray(a));
        assert.ok(Array.isArray(b));
    });
    assert.equal(refreshPosts, 1);
});

test('cookie-session recover after a failed facade refresh'
+ ' does not POST again',
async () => {
    // @ts-expect-error — Node stub for navigateTo
    globalThis.document = {
        documentElement: {
            getAttribute: () => 'dashboard',
        },
    };
    // @ts-expect-error — Node stub for navigateTo
    globalThis.window = { location: { href: '', search: '' } };
    setCookieSession(true);
    const deadAccess = await expiredToken();
    putSessionToken(deadAccess);
    let refreshPosts = 0;
    await withMockFetch(async (input) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            refreshPosts += 1;
            return new Response(
                JSON.stringify({ error: 'invalid_grant' }),
                { status: 401 },
            );
        }
        return new Response(
            JSON.stringify({ error: 'invalid_token' }),
            { status: 401 },
        );
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
        );
        const ctx = createRecoveringRequestContext(
            facade, deadAccess);
        await assert.rejects(
            () => ctx.GET('members'),
            UnauthorizedError,
        );
    });
    assert.equal(refreshPosts, 1);
});

test('idle tab ignores a peer refresh broadcast',
async () => {
    let posts = 0;
    await runSingleFlightRefresh(async () => {
        posts += 1;
        return 'first';
    });
    const peer = new BroadcastChannel('fusion-ai:refresh');
    peer.postMessage({ accessToken: null });
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setImmediate(r));
    }
    peer.close();
    const result = await runSingleFlightRefresh(async () => {
        posts += 1;
        return 'second';
    });
    assert.equal(posts, 2);
    assert.equal(result, 'second');
});
