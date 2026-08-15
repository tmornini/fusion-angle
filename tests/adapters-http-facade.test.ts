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

const OPERATION_ID = /^[0-9A-Za-z]{22}$/;

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
                'ideas/1', { name: 'x' }, 'tok',
            );
        });
        assert.equal(
            url, 'http://example.test/ideas/1',
        );
        assert.equal(credentials, 'same-origin');
        assert.ok(operationId !== null);
        assert.match(operationId, OPERATION_ID);
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
            await ctx.PUT('ideas/1', { name: 'x' });
        });
        assert.ok(operationId !== null);
        assert.match(operationId, OPERATION_ID);
    },
);

test(
    '401 through the fetch facade is UnauthorizedError',
    async () => {
        // @ts-expect-error — Node stub for navigateTo
        globalThis.document = {
            documentElement: {
                getAttribute: () => 'dashboard',
            },
        };
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
                () => facade.GET('members', 'tok'),
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
