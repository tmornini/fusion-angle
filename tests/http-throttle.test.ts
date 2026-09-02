import { assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { HTTP_TOO_MANY_REQUESTS } from
    '../api/http-errors.ts';
import {
    listenHttp,
    type HttpListener,
    type RequestHandler,
} from '../server/http-server.ts';
import { createAuthThrottle } from '../server/throttle.ts';
import { fetchDiscardingBody } from
    './fixtures/fetch-discarding-body.ts';

async function withServer(
    handle: RequestHandler,
    run: (base: string) => Promise<void>,
    trustedProxyHops?: string,
): Promise<void> {
    const root = await Deno.makeTempDir({
        prefix: 'fusion-throttle-',
    });
    let listener: HttpListener | undefined;
    try {
        listener = await listenHttp({
            adapter: memoryDbAdapter(),
            staticRoot: root,
            port: 0,
            host: '127.0.0.1',
            handle,
            log: () => {},
            ...(trustedProxyHops !== undefined
                ? { trustedProxyHops }
                : {}),
        });
        await run(
            'http://127.0.0.1:' + String(listener.port),
        );
    } finally {
        if (listener !== undefined) await listener.close();
        await Deno.remove(root, { recursive: true });
    }
}

// fetch's own URL parsing normalizes a dot-segment out of
// `path` client-side, so the literal string never reaches
// the wire — but that no longer matters either way:
// server/http-server.ts:466-467 unconditionally re-parses
// `request.url` through `new URL(...)`, which normalizes
// it again server-side regardless of transport. Measured
// directly (raw socket vs. fetch, same listener): the
// server-observed path was identical both ways. So the
// throttle-keying this test proves is unchanged by
// dropping the raw socket.
function postRaw(
    base: string,
    path: string,
): Promise<number> {
    return fetchDiscardingBody(base + path, {
        method: 'POST',
    }).then((res) => res.status);
}

Deno.test('sixth authorize in a minute is 429', async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetchDiscardingBody(url, { method: 'POST' });
            assertStrictEquals(res.status, 200);
        }
        const sixth = await fetchDiscardingBody(url, { method: 'POST' });
        assertStrictEquals(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 5);
    });
});

Deno.test('six refresh token grants reach the handler',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/token';
        const body = JSON.stringify({
            grant_type: 'refresh',
        });
        for (let i = 0; i < 6; i++) {
            const res = await fetchDiscardingBody(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assertStrictEquals(res.status, 200);
        }
        assertStrictEquals(handled, 6);
    });
});

Deno.test('six token-exchange grants reach the handler',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/token';
        const body = JSON.stringify({
            grant_type: 'token-exchange',
        });
        for (let i = 0; i < 6; i++) {
            const res = await fetchDiscardingBody(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assertStrictEquals(res.status, 200);
        }
        assertStrictEquals(handled, 6);
    });
});

Deno.test('sixth non-refresh token grant in a minute is 429',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/token';
        const body = JSON.stringify({
            grant_type: 'client_credentials',
        });
        for (let i = 0; i < 5; i++) {
            const res = await fetchDiscardingBody(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assertStrictEquals(res.status, 200);
        }
        const sixth = await fetchDiscardingBody(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body,
        });
        assertStrictEquals(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 5);
    });
});

Deno.test('sixth authorize with a trailing slash is 429',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize/';
        for (let i = 0; i < 5; i++) {
            const res = await fetchDiscardingBody(url, { method: 'POST' });
            assertStrictEquals(res.status, 200);
        }
        const sixth = await fetchDiscardingBody(url, { method: 'POST' });
        assertStrictEquals(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 5);
    });
});

Deno.test('spoofed X-Forwarded-For from a non-trusted hop is ignored',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetchDiscardingBody(url, {
                method: 'POST',
                headers: {
                    'x-forwarded-for': '203.0.113.10',
                },
            });
            assertStrictEquals(res.status, 200);
        }
        const sixth = await fetchDiscardingBody(url, {
            method: 'POST',
            headers: {
                'x-forwarded-for': '203.0.113.20',
            },
        });
        assertStrictEquals(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 5);
    });
});

Deno.test('trusted hop keys distinct XFF and Forwarded clients',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetchDiscardingBody(url, {
                method: 'POST',
                headers: {
                    'x-forwarded-for': '203.0.113.10',
                },
            });
            assertStrictEquals(res.status, 200);
        }
        const other = await fetchDiscardingBody(url, {
            method: 'POST',
            headers: {
                'forwarded': 'for=203.0.113.20',
            },
        });
        assertStrictEquals(other.status, 200);
        const sixth = await fetchDiscardingBody(url, {
            method: 'POST',
            headers: {
                'x-forwarded-for': '203.0.113.10',
            },
        });
        assertStrictEquals(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 6);
    }, '127.0.0.1');
});

Deno.test('sixth dot-segment authorize is 429', async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const path = '/api/authentication/./authorize';
        for (let i = 0; i < 5; i++) {
            const status = await postRaw(base, path);
            assertStrictEquals(status, 200);
        }
        const sixth = await postRaw(base, path);
        assertStrictEquals(sixth, HTTP_TOO_MANY_REQUESTS);
        assertStrictEquals(handled, 5);
    });
});

Deno.test('IPv4-mapped remote matches a trusted IPv4 hop',
() => {
    const throttle = createAuthThrottle('10.0.0.1');
    const remote = '::ffff:10.0.0.1';
    for (let i = 0; i < 5; i++) {
        assertStrictEquals(
            throttle.limited(
                remote, undefined, '203.0.113.10',
            ),
            false,
        );
    }
    assertStrictEquals(
        throttle.limited(
            remote, undefined, '203.0.113.20',
        ),
        false,
    );
    assertStrictEquals(
        throttle.limited(
            remote, undefined, '203.0.113.10',
        ),
        true,
    );
});

Deno.test('injected clock expires the 60s throttle window',
() => {
    let now = 1_000_000;
    const throttle = createAuthThrottle(
        undefined,
        () => now,
    );
    const remote = '127.0.0.1';
    for (let i = 0; i < 5; i++) {
        assertStrictEquals(
            throttle.limited(
                remote, undefined, undefined,
            ),
            false,
        );
    }
    assertStrictEquals(
        throttle.limited(remote, undefined, undefined),
        true,
    );
    now += 60_000;
    assertStrictEquals(
        throttle.limited(remote, undefined, undefined),
        false,
    );
});

Deno.test('trusted hop keys the rightmost X-Forwarded-For',
() => {
    const throttle = createAuthThrottle('10.0.0.1');
    const remote = '10.0.0.1';
    for (let i = 0; i < 5; i++) {
        assertStrictEquals(
            throttle.limited(
                remote,
                undefined,
                '203.0.113.10, 198.51.100.1',
            ),
            false,
        );
    }
    assertStrictEquals(
        throttle.limited(
            remote,
            undefined,
            '203.0.113.20, 198.51.100.1',
        ),
        true,
    );
});
