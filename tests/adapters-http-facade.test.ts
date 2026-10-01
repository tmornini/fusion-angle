import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    createHttpFacade,
} from '../client/http-facade.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import { UnauthorizedError } from
    '../shared/http-errors.ts';
import {
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { isIdentifier } from '../shared/identifier.ts';
import { postPasswordLogin } from
    '../client/authentication.ts';
import { createAppClient } from '../web-app/app/client.ts';

// The tab's one client: each test's transport binds it, as
// the client binds its own.
const client = createAppClient(
    createHttpFacade(
        'http://example.test',
        (input, init) => globalThis.fetch(input, init),
    ),
);

// The single-flight mutex opens one refresh channel per
// client, lazily, but its fixed name still reaches every
// test file's worker in the process, and a test process
// has no unload to reclaim it. Release after each test, so
// the handle never outlives the test that opened it; the
// next refresh reopens it.
Deno.test.afterEach(() => {
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

Deno.test(
    'PUT through the fetch facade sends operation-id',
    async () => {
        let url = '';
        let credentials: RequestCredentials | undefined;
        let operationId: string | null = null;
        let requestId: string | null = null;
        const sent = 'abcdefghijklmnopqrstug';
        await withMockFetch(async (input, init) => {
            url = String(input);
            credentials = init?.credentials;
            const headers = new Headers(init?.headers);
            operationId = headers.get(OPERATION_ID_HEADER);
            requestId = headers.get('request-id');
            return Response.json({});
        }, async () => {
            const facade = createHttpFacade(
                'http://example.test',
                (input, init) => globalThis.fetch(input, init),
            )({ ...client, navigateToAuth: () => {} });
            await facade.PUT(
                'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + 'AjdvjuECVZEgZoFajaIEkg', { name: 'x' },
                'tok',
                [[OPERATION_ID_HEADER, sent]],
            );
        });
        assertStrictEquals(
            url,
            'http://example.test/api/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'ideas/AjdvjuECVZEgZoFajaIEkg',
        );
        assertStrictEquals(credentials, 'same-origin');
        assertStrictEquals(operationId, sent);
        assertStrictEquals(requestId, null);
        assertStrictEquals(isIdentifier(sent), true);
    },
);

Deno.test(
    'cookie refresh posts under the /api/ mount',
    async () => {
        const seen: {
            url: string;
            operationId: string | null;
            requestId: string | null;
        }[] = [];
        let ideas = 0;
        await withMockFetch(async (input, init) => {
            const headers = new Headers(init?.headers);
            seen.push({
                url: String(input),
                operationId: headers.get(
                    OPERATION_ID_HEADER,
                ),
                requestId: headers.get('request-id'),
            });
            if (String(input).endsWith(
                '/authentication/token',
            )) {
                return new Response(
                    JSON.stringify({
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="fresh"',
                        },
                    },
                );
            }
            ideas += 1;
            if (ideas === 1) {
                return Response.json(
                    { error: 'invalid_token' },
                    { status: 401 },
                );
            }
            return new Response(null, { status: 204 });
        }, async () => {
            const ctx =
                client.recoveringRequestContext('');
            await ctx.GETCollection(
                'organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
            );
            assertStrictEquals(seen.length, 3);
            for (const row of seen) {
                assertStrictEquals(
                    row.operationId, ctx.operationId,
                );
                assertStrictEquals(
                    row.requestId, null,
                );
            }
        });
        assertStrictEquals(
            seen[0]!.url,
            'http://example.test/api/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
        );
        assertStrictEquals(
            seen[1]!.url,
            'http://example.test/api/'
            + 'authentication/token',
        );
        assertStrictEquals(
            seen[2]!.url,
            'http://example.test/api/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
        );
    },
);

Deno.test(
    'a 401 raw exchange carries the failing'
        + ' operation-id',
    async () => {
        const seen: {
            url: string;
            operationId: string | null;
            requestId: string | null;
            grant: string;
        }[] = [];
        const token = await organizationToken();
        let ideas = 0;
        await withMockFetch(async (input, init) => {
            const headers = new Headers(init?.headers);
            const raw = init?.body;
            let grant = '';
            if (typeof raw === 'string' && raw !== '') {
                const parsed = JSON.parse(raw) as {
                    grant_type?: unknown;
                };
                if (typeof parsed.grant_type === 'string') {
                    grant = parsed.grant_type;
                }
            }
            seen.push({
                url: String(input),
                operationId: headers.get(
                    OPERATION_ID_HEADER,
                ),
                requestId: headers.get('request-id'),
                grant,
            });
            if (String(input).endsWith(
                '/authentication/token',
            )) {
                return new Response(
                    JSON.stringify({
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="fresh"',
                        },
                    },
                );
            }
            ideas += 1;
            if (ideas === 1) {
                return Response.json(
                    { error: 'invalid_token' },
                    { status: 401 },
                );
            }
            return new Response(null, { status: 204 });
        }, async () => {
            const ctx =
                client.recoveringRequestContext(token);
            await ctx.GETCollection(
                'organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
            );
            assertStrictEquals(seen.length, 4);
            for (const row of seen) {
                assertStrictEquals(
                    row.operationId, ctx.operationId,
                );
                assertStrictEquals(
                    row.requestId, null,
                );
            }
        });
        assertStrictEquals(seen[1]!.grant, 'refresh');
        assertStrictEquals(
            seen[2]!.grant, 'token-exchange',
        );
        assertStrictEquals(seen[0]!.grant, '');
        assertStrictEquals(seen[3]!.grant, '');
    },
);

Deno.test(
    'createRequestContext accepts the fetch facade',
    async () => {
        const operationIds: (string | null)[] = [];
        const requestIds: (string | null)[] = [];
        await withMockFetch(async (_input, init) => {
            const headers = new Headers(init?.headers);
            operationIds.push(
                headers.get(OPERATION_ID_HEADER),
            );
            requestIds.push(headers.get('request-id'));
            if (init?.method === 'GET') {
                return new Response(null, { status: 204 });
            }
            return Response.json({});
        }, async () => {
            const ctx = client.requestContext(DEV_TOKEN);
            const idea = 'organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'AjdvjuECVZEgZoFajaIEkg';
            await ctx.GETCollection(
                'organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
            );
            await ctx.PUT(idea, { name: 'x' });
            await ctx.PATCH(idea, { name: 'y' }, 'creates');
            await ctx.POST(
                'organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
                { name: 'z' },
            );
            await ctx.DELETE(idea);
            assertStrictEquals(operationIds.length, 5);
            for (const operationId of operationIds) {
                assertStrictEquals(
                    operationId, ctx.operationId,
                );
            }
        });
        for (const requestId of requestIds) {
            assertStrictEquals(requestId, null);
        }
        assert(operationIds[0] !== null);
        assertStrictEquals(
            isIdentifier(operationIds[0]!), true,
        );
    },
);

Deno.test(
    '401 through the fetch facade is UnauthorizedError',
    async () => {
        globalThis.document = {
            documentElement: {
                getAttribute: () => 'dashboard',
            },
        } as unknown as Document;
        // @ts-expect-error — Node stub for navigateTo
        globalThis.window = { location: { href: '' } };
        await withMockFetch(async () => Response.json(
            { error: 'invalid_token' },
            { status: 401 },
        ), async () => {
            const facade = createHttpFacade(
                'http://example.test',
                (input, init) => globalThis.fetch(input, init),
            )({ ...client, navigateToAuth: () => {} });
            const err = await assertRejects(
                () => facade.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'members/', 'tok'),
            ) as UnauthorizedError;
            assertInstanceOf(err, UnauthorizedError);
            assertStrictEquals(err.reason, 'invalid_token');
        });
    },
);

Deno.test(
    '401 on authentication/authorize does not'
    + ' refresh or bounce',
    async () => {
        globalThis.document = {
            documentElement: {
                getAttribute: () => 'auth',
            },
        } as unknown as Document;
        globalThis.window = {
            location: { href: '' },
        } as unknown as Window & typeof globalThis;
        const urls: string[] = [];
        await withMockFetch(async (input) => {
            urls.push(String(input));
            return Response.json(
                { error: 'invalid_grant' },
                { status: 401 },
            );
        }, async () => {
            const facade = createHttpFacade(
                'http://example.test',
                (input, init) => globalThis.fetch(input, init),
            )({ ...client, navigateToAuth: () => {} });
            await assertRejects(
                () => facade.POST(
                    'authentication/authorize',
                    {
                        method: 'password',
                        username: 'a@b.c',
                        password: 'WRONG',
                    },
                    'tok',
                ),
                UnauthorizedError,
            );
        });
        assertEquals(urls, [
            'http://example.test/api/'
            + 'authentication/authorize',
        ]);
        assertStrictEquals(
            window.location.href, '',
        );
    },
);

Deno.test(
    'postPasswordLogin wrong password is'
    + ' one fetch and null',
    async () => {
        globalThis.document = {
            documentElement: {
                getAttribute: () => 'auth',
            },
        } as unknown as Document;
        globalThis.window = {
            location: { href: '' },
        } as unknown as Window & typeof globalThis;
        const urls: string[] = [];
        await withMockFetch(async (input) => {
            urls.push(String(input));
            return Response.json(
                { error: 'invalid_grant' },
                { status: 401 },
            );
        }, async () => {
            const ctx = client.requestContext(DEV_TOKEN);
            assertStrictEquals(
                await postPasswordLogin(
                    ctx, 'a@b.c', 'WRONG',
                ),
                null,
            );
        });
        assertStrictEquals(urls.length, 1);
        assertMatch(
            urls[0]!,
            /authentication\/authorize$/,
        );
        assertStrictEquals(
            window.location.href, '',
        );
    },
);
