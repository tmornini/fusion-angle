import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createHttpFacade,
} from '../web-app/app/adapters/http-facade.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { OPERATION_ID_HEADER } from
    '../api/message-pair.ts';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { isIdentifier } from '../shared/identifier.ts';
import { postPasswordLogin } from
    '../web-app/app/adapters/authentication.ts';

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

test(
    'PUT through the fetch facade sends operation-id',
    async () => {
        let url = '';
        let credentials: RequestCredentials | undefined;
        let operationId: string | null = null;
        await withMockFetch(async (input, init) => {
            url = String(input);
            credentials = init?.credentials;
            operationId = new Headers(init?.headers)
                .get(OPERATION_ID_HEADER);
            return new Response('{}', { status: 200 });
        }, async () => {
            const facade = createHttpFacade(
                'http://example.test',
            );
            await facade.PUT(
                'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + 'AjdvjuECVZEgZoFajaIEkg', { name: 'x' }, 'tok',
            );
        });
        assert.equal(
            url,
            'http://example.test/api/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'ideas/AjdvjuECVZEgZoFajaIEkg',
        );
        assert.equal(credentials, 'same-origin');
        assert.ok(operationId !== null);
        assert.equal(isIdentifier(operationId), true);
    },
);

test(
    'cookie refresh posts under the /api/ mount',
    async () => {
        const urls: string[] = [];
        await withMockFetch(async (input) => {
            urls.push(String(input));
            if (String(input).endsWith(
                '/authentication/token',
            )) {
                return new Response(
                    JSON.stringify({
                        access_token: 'fresh',
                    }),
                    { status: 200 },
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
            await assert.rejects(
                () => facade.GET(
                    'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', 'dead',
                ),
                UnauthorizedError,
            );
        });
        assert.equal(
            urls[0],
            'http://example.test/api/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'ideas/',
        );
        assert.equal(
            urls[1],
            'http://example.test/api/authentication/token',
        );
    },
);

test(
    'createRequestContext accepts the fetch facade',
    async () => {
        let operationId: string | null = null;
        await withMockFetch(async (_input, init) => {
            operationId = new Headers(init?.headers)
                .get(OPERATION_ID_HEADER);
            return new Response('{}', { status: 200 });
        }, async () => {
            const ctx = createRequestContext(
                createHttpFacade('http://example.test'),
                DEV_TOKEN,
            );
            await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'AjdvjuECVZEgZoFajaIEkg', { name: 'x' });
        });
        assert.ok(operationId !== null);
        assert.equal(isIdentifier(operationId), true);
    },
);

test(
    '401 through the fetch facade is UnauthorizedError',
    async () => {
        globalThis.document = {
            documentElement: {
                getAttribute: () => 'dashboard',
            },
        } as unknown as Document;
        // @ts-expect-error — Node stub for navigateTo
        globalThis.window = { location: { href: '' } };
        await withMockFetch(async () => new Response(
            JSON.stringify({ error: 'invalid_token' }),
            { status: 401 },
        ), async () => {
            const facade = createHttpFacade(
                'http://example.test',
            );
            await assert.rejects(
                () => facade.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
                    + 'members/', 'tok'),
                (err: unknown) => {
                    assert.ok(
                        err instanceof UnauthorizedError,
                    );
                    assert.equal(
                        err.reason, 'invalid_token');
                    return true;
                },
            );
        });
    },
);

test(
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
            return new Response(
                JSON.stringify({
                    error: 'invalid_grant',
                }),
                { status: 401 },
            );
        }, async () => {
            const facade = createHttpFacade(
                'http://example.test',
            );
            await assert.rejects(
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
        assert.deepEqual(urls, [
            'http://example.test/api/'
            + 'authentication/authorize',
        ]);
        assert.equal(
            window.location.href, '',
        );
    },
);

test(
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
            return new Response(
                JSON.stringify({
                    error: 'invalid_grant',
                }),
                { status: 401 },
            );
        }, async () => {
            const ctx = createRequestContext(
                createHttpFacade(
                    'http://example.test',
                ),
                DEV_TOKEN,
            );
            assert.equal(
                await postPasswordLogin(
                    ctx, 'a@b.c', 'WRONG',
                ),
                null,
            );
        });
        assert.equal(urls.length, 1);
        assert.match(
            urls[0]!,
            /authentication\/authorize$/,
        );
        assert.equal(
            window.location.href, '',
        );
    },
);
