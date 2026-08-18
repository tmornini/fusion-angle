import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { HTTP_TOO_MANY_REQUESTS } from
    '../api/http-errors.ts';
import {
    listenHttp,
    type HttpListener,
    type RequestHandler,
} from '../server/http-server.ts';
import { createAuthThrottle } from '../server/throttle.ts';

async function withServer(
    handle: RequestHandler,
    run: (base: string) => Promise<void>,
    trustedProxyHops?: string,
): Promise<void> {
    const root = await mkdtemp(
        join(tmpdir(), 'fusion-throttle-'),
    );
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
        await rm(root, { recursive: true, force: true });
    }
}

function postRaw(
    base: string,
    path: string,
): Promise<number> {
    const url = new URL(base);
    return new Promise((resolve, reject) => {
        const req = request({
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            path,
        }, (res) => {
            res.resume();
            res.on('end', () => {
                resolve(res.statusCode ?? 0);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

test('sixth authorize in a minute is 429', async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetch(url, { method: 'POST' });
            assert.equal(res.status, 200);
        }
        const sixth = await fetch(url, { method: 'POST' });
        assert.equal(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 5);
    });
});

test('six refresh token grants reach the handler',
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
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assert.equal(res.status, 200);
        }
        assert.equal(handled, 6);
    });
});

test('six token-exchange grants reach the handler',
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
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assert.equal(res.status, 200);
        }
        assert.equal(handled, 6);
    });
});

test('sixth non-refresh token grant in a minute is 429',
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
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body,
            });
            assert.equal(res.status, 200);
        }
        const sixth = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body,
        });
        assert.equal(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 5);
    });
});

test('sixth authorize with a trailing slash is 429',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize/';
        for (let i = 0; i < 5; i++) {
            const res = await fetch(url, { method: 'POST' });
            assert.equal(res.status, 200);
        }
        const sixth = await fetch(url, { method: 'POST' });
        assert.equal(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 5);
    });
});

test('spoofed X-Forwarded-For from a non-trusted hop is ignored',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'x-forwarded-for': '203.0.113.10',
                },
            });
            assert.equal(res.status, 200);
        }
        const sixth = await fetch(url, {
            method: 'POST',
            headers: {
                'x-forwarded-for': '203.0.113.20',
            },
        });
        assert.equal(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 5);
    });
});

test('trusted hop keys distinct XFF and Forwarded clients',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const url = base + '/api/authentication/authorize';
        for (let i = 0; i < 5; i++) {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'x-forwarded-for': '203.0.113.10',
                },
            });
            assert.equal(res.status, 200);
        }
        const other = await fetch(url, {
            method: 'POST',
            headers: {
                'forwarded': 'for=203.0.113.20',
            },
        });
        assert.equal(other.status, 200);
        const sixth = await fetch(url, {
            method: 'POST',
            headers: {
                'x-forwarded-for': '203.0.113.10',
            },
        });
        assert.equal(sixth.status, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 6);
    }, '127.0.0.1');
});

test('sixth dot-segment authorize is 429', async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('ok', { status: 200 });
    };
    await withServer(handle, async (base) => {
        const path = '/api/authentication/./authorize';
        for (let i = 0; i < 5; i++) {
            const status = await postRaw(base, path);
            assert.equal(status, 200);
        }
        const sixth = await postRaw(base, path);
        assert.equal(sixth, HTTP_TOO_MANY_REQUESTS);
        assert.equal(handled, 5);
    });
});

test('IPv4-mapped remote matches a trusted IPv4 hop',
() => {
    const throttle = createAuthThrottle('10.0.0.1');
    const remote = '::ffff:10.0.0.1';
    for (let i = 0; i < 5; i++) {
        assert.equal(
            throttle.limited(
                remote, undefined, '203.0.113.10',
            ),
            false,
        );
    }
    assert.equal(
        throttle.limited(
            remote, undefined, '203.0.113.20',
        ),
        false,
    );
    assert.equal(
        throttle.limited(
            remote, undefined, '203.0.113.10',
        ),
        true,
    );
});

test('injected clock expires the 60s throttle window',
() => {
    let now = 1_000_000;
    const throttle = createAuthThrottle(
        undefined,
        () => now,
    );
    const remote = '127.0.0.1';
    for (let i = 0; i < 5; i++) {
        assert.equal(
            throttle.limited(
                remote, undefined, undefined,
            ),
            false,
        );
    }
    assert.equal(
        throttle.limited(remote, undefined, undefined),
        true,
    );
    now += 60_000;
    assert.equal(
        throttle.limited(remote, undefined, undefined),
        false,
    );
});

test('trusted hop keys the rightmost X-Forwarded-For',
() => {
    const throttle = createAuthThrottle('10.0.0.1');
    const remote = '10.0.0.1';
    for (let i = 0; i < 5; i++) {
        assert.equal(
            throttle.limited(
                remote,
                undefined,
                '203.0.113.10, 198.51.100.1',
            ),
            false,
        );
    }
    assert.equal(
        throttle.limited(
            remote,
            undefined,
            '203.0.113.20, 198.51.100.1',
        ),
        true,
    );
});
