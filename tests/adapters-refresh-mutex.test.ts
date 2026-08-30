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
import {
    putSessionToken,
    getSessionToken,
    sessionIsOrganizationScoped,
} from '../web-app/app/adapters/session-token.ts';
import { runSingleFlightRefresh } from
    '../web-app/app/adapters/session-refresh-mutex.ts';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import {
    expiredToken,
    organizationToken,
    reachableToken,
    claimToken,
} from './token-fixtures.ts';
import { principalFromToken } from
    '../shared/access-token-decode.ts';

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
            facade.GET('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'dead-access'),
        ]);
        assert.ok(Array.isArray(a));
        assert.ok(Array.isArray(b));
    });
    assert.equal(refreshPosts, 1);
});

test('cookie-session recover after a failed facade refresh'
+ ' does not POST again',
async () => {
    globalThis.document = {
        documentElement: {
            getAttribute: () => 'dashboard',
        },
    } as unknown as Document;
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
    const peer = new BroadcastChannel('fusion-angle:refresh');
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

test('cookie refresh re-scopes the session to the'
+ ' dead token org',
async () => {
    setCookieSession(true);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const scoped = await organizationToken();
    const flat = await reachableToken();
    const rescoped = await claimToken({
        organization: org,
        organizations: [org],
        roles: ['admin:' + org],
        jti: 'rescoped-after-refresh',
    });
    putSessionToken(scoped);
    const grants: string[] = [];
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            const body = JSON.parse(
                String(init?.body),
            ) as { grant_type?: string };
            grants.push(body.grant_type ?? '');
            if (body.grant_type === 'refresh') {
                return new Response(
                    JSON.stringify({
                        access_token: flat,
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    { status: 200 },
                );
            }
            if (body.grant_type
                === 'token-exchange') {
                const asked = (
                    body as {
                        organization?: string;
                    }
                ).organization;
                assert.equal(asked, org);
                return new Response(
                    JSON.stringify({
                        access_token: rescoped,
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    { status: 200 },
                );
            }
            return new Response(
                JSON.stringify({
                    error: 'unsupported_grant',
                }),
                { status: 400 },
            );
        }
        const token = new Headers(init?.headers)
            .get('Authorization');
        if (token === 'Bearer ' + scoped) {
            return new Response(
                JSON.stringify({
                    error: 'invalid_token',
                }),
                { status: 401 },
            );
        }
        if (token === 'Bearer ' + flat
            || token === 'Bearer ' + rescoped) {
            return new Response(
                '[]', { status: 200 },
            );
        }
        return new Response(
            JSON.stringify({
                error: 'invalid_token',
            }),
            { status: 401 },
        );
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
        );
        const rows = await facade.GET(
            'organizations/' + org + '/flows/x',
            scoped,
        );
        assert.ok(Array.isArray(rows));
    });
    assert.deepEqual(
        grants, ['refresh', 'token-exchange'],
    );
    assert.equal(
        sessionIsOrganizationScoped(), true,
    );
    assert.equal(
        principalFromToken(getSessionToken())
            .organization,
        org,
    );
});
