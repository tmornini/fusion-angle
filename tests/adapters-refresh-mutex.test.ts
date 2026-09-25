import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    createHttpFacade,
} from '../client/http-facade.ts';
import { createAppClient } from '../web-app/app/client.ts';
import { UnauthorizedError } from
    '../shared/http-errors.ts';
import {
    expiredToken,
    organizationToken,
    reachableToken,
    claimToken,
} from './token-fixtures.ts';
import { principalFromToken } from
    '../shared/access-token-decode.ts';

// The tab's one client: each test's transport binds it, as
// the client binds its own.
const client = createAppClient(
    createHttpFacade(
        'http://example.test',
        (input, init) => globalThis.fetch(input, init),
    ),
);

// The single-flight mutex opens ONE refresh channel per
// process, lazily, and a test process has no unload to
// reclaim it. Release after each test, so the handle never
// outlives the test that opened it; the next refresh
// reopens it.
Deno.test.afterEach(() => {
    client.setCookieSession(false);
    client.deleteRefreshChannel();
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

Deno.test('two concurrent 401s cause one refresh POST',
async () => {
    client.setCookieSession(true);
    client.putSessionToken('dead-access');
    let refreshPosts = 0;
    let nextAccess = 0;
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            refreshPosts += 1;
            nextAccess += 1;
            return new Response(
                JSON.stringify({
                    token_type: 'Bearer',
                    expires_in: 900,
                }),
                {
                    status: 200,
                    headers: {
                        'authentication-info':
                            'access_token="fresh-'
                            + nextAccess + '"',
                    },
                },
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
            (input, init) => globalThis.fetch(input, init),
        )(client);
        const [a, b] = await Promise.all([
            facade.GET('members', 'dead-access'),
            facade.GET('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'dead-access'),
        ]);
        assert(Array.isArray(a));
        assert(Array.isArray(b));
    });
    assertStrictEquals(refreshPosts, 1);
});

Deno.test('cookie-session recover after a failed facade refresh'
+ ' does not POST again',
async () => {
    globalThis.document = {
        documentElement: {
            getAttribute: () => 'dashboard',
        },
    } as unknown as Document;
    // @ts-expect-error — Node stub for navigateTo
    globalThis.window = { location: { href: '', search: '' } };
    client.setCookieSession(true);
    const deadAccess = await expiredToken();
    client.putSessionToken(deadAccess);
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
        const ctx = client.recoveringRequestContext(
            deadAccess);
        await assertRejects(
            () => ctx.GET('members'),
            UnauthorizedError,
        );
    });
    assertStrictEquals(refreshPosts, 1);
});

Deno.test('idle tab ignores a peer refresh broadcast',
async () => {
    let posts = 0;
    await client.runSingleFlightRefresh(async () => {
        posts += 1;
        return 'first';
    });
    const peer = new BroadcastChannel('fusion-angle:refresh');
    peer.postMessage({ accessToken: null });
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setImmediate(r));
    }
    peer.close();
    const result = await client.runSingleFlightRefresh(async () => {
        posts += 1;
        return 'second';
    });
    assertStrictEquals(posts, 2);
    assertStrictEquals(result, 'second');
});

Deno.test('cookie refresh re-scopes the session to the'
+ ' dead token org',
async () => {
    client.setCookieSession(true);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const scoped = await organizationToken();
    const flat = await reachableToken();
    const rescoped = await claimToken({
        organization: org,
        organizations: [org],
        roles: ['admin:' + org],
        jti: 'rescoped-after-refresh',
    });
    client.putSessionToken(scoped);
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
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="'
                                + flat + '"',
                        },
                    },
                );
            }
            if (body.grant_type
                === 'token-exchange') {
                const asked = (
                    body as {
                        organization?: string;
                    }
                ).organization;
                assertStrictEquals(asked, org);
                const bearer = new Headers(init?.headers)
                    .get('Authorization');
                assertStrictEquals(
                    bearer, 'Bearer ' + flat,
                );
                return new Response(
                    JSON.stringify({
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="'
                                + rescoped + '"',
                        },
                    },
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
            (input, init) => globalThis.fetch(input, init),
        )(client);
        const rows = await facade.GET(
            'organizations/' + org + '/flows/x',
            scoped,
        );
        assert(Array.isArray(rows));
    });
    assertEquals(
        grants, ['refresh', 'token-exchange'],
    );
    assertStrictEquals(
        client.sessionIsOrganizationScoped(), true,
    );
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization,
        org,
    );
});
