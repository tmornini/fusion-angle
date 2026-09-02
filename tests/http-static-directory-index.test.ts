import { assertMatch, assertStrictEquals } from '@std/assert';
import { join } from '@std/path';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    HTTP_NOT_FOUND,
    HTTP_UNAUTHORIZED,
} from '../api/http-errors.ts';
import {
    listenHttp,
    type HttpListener,
    type RequestHandler,
} from '../server/http-server.ts';
import { fetchDiscardingBody } from
    './fixtures/fetch-discarding-body.ts';

async function withServer(
    files: Record<string, string>,
    handle: RequestHandler | undefined,
    run: (
        base: string,
        logs: Record<string, unknown>[],
    ) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir({
        prefix: 'fusion-http-',
    });
    const logs: Record<string, unknown>[] = [];
    let listener: HttpListener | undefined;
    try {
        for (const [rel, body] of Object.entries(files)) {
            const path = join(root, rel);
            await Deno.mkdir(join(path, '..'), {
                recursive: true,
            });
            await Deno.writeTextFile(path, body);
        }
        const options = {
            adapter: memoryDbAdapter(),
            staticRoot: root,
            port: 0,
            host: '127.0.0.1',
            log: (line: Record<string, unknown>) => {
                logs.push(line);
            },
            ...(handle !== undefined ? { handle } : {}),
        };
        listener = await listenHttp(options);
        await run(
            'http://127.0.0.1:' + String(listener.port),
            logs,
        );
    } finally {
        if (listener !== undefined) await listener.close();
        await Deno.remove(root, { recursive: true });
    }
}

// PROBE 11 (Task 30, re-verified independently): unlike
// Node's fetch, Deno's fetch does not overwrite a
// caller-supplied Sec-Fetch-Mode, so the document
// navigation this proves no longer needs a raw socket.
function getDocument(
    url: string,
): Promise<Response> {
    return fetch(url, {
        headers: { 'sec-fetch-mode': 'navigate' },
    });
}

Deno.test('/api-documentation/get/identities/ serves'
    + ' index.html',
async () => {
    await withServer({
        'api-documentation/get/identities/index.html':
            '<p>identities collection</p>',
    }, undefined, async (base) => {
        const res = await fetch(
            base + '/api-documentation/get/identities/',
        );
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            res.headers.get('content-type'),
            'text/html; charset=utf-8',
        );
        assertStrictEquals(
            await res.text(),
            '<p>identities collection</p>',
        );
    });
});

Deno.test('missing room under /api-documentation/ is'
    + ' 404 JSON, not an API hop',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({}, handle, async (base) => {
        const res = await fetch(
            base
            + '/api-documentation/get/missing/',
        );
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'Not found');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('/ideas/ serves ideas/index.html',
async () => {
    await withServer({
        'ideas/index.html': '<p>ideas page</p>',
    }, undefined, async (base) => {
        const res = await fetch(base + '/ideas/');
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            res.headers.get('content-type'),
            'text/html; charset=utf-8',
        );
        assertStrictEquals(
            await res.text(),
            '<p>ideas page</p>',
        );
    });
});

Deno.test('/ideas without a slash is a miss',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({
        'ideas/index.html': '<p>ideas page</p>',
    }, handle, async (base) => {
        const res = await fetch(base + '/ideas');
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'Not found');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('/assets/ is a miss when no index.html',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({
        'assets/inter-400.woff2': 'woff',
    }, handle, async (base) => {
        const res = await fetch(base + '/assets/');
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'Not found');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('/api-documentation/post/ is a miss when'
    + ' no index.html',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({
        'api-documentation/index.html':
            '<p>docs home</p>',
    }, handle, async (base) => {
        const res = await fetchDiscardingBody(
            base + '/api-documentation/post/',
        );
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        assertStrictEquals(handled, 0);
    });
});

Deno.test('/api-documentation/ serves index.html',
async () => {
    await withServer({
        'api-documentation/index.html':
            '<p>docs home</p>',
    }, undefined, async (base) => {
        const res = await fetch(
            base + '/api-documentation/',
        );
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            await res.text(),
            '<p>docs home</p>',
        );
    });
});

Deno.test('a document navigation to a leftover path'
    + ' serves not-found HTML',
async () => {
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, undefined, async (base) => {
        const res = await getDocument(
            base + '/oPmOpJCSqfhhTFTjvPkLpw',
        );
        assertStrictEquals(res.status, 200);
        assertMatch(
            res.headers.get('content-type') ?? '',
            /text\/html/,
        );
        assertStrictEquals(await res.text(), '<p>gone</p>');
    });
});

Deno.test('a fetch to a leftover path is 404 JSON',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, handle, async (base) => {
        const res = await fetch(
            base + '/oPmOpJCSqfhhTFTjvPkLpw',
        );
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        assertMatch(
            res.headers.get('content-type') ?? '',
            /application\/json/,
        );
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'Not found');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('the door strips /api/ and hands the remainder',
async () => {
    let seen = '';
    const handle: RequestHandler = async (
        _adapter, request,
    ) => {
        seen = new URL(request.url).pathname;
        return new Response('ok', { status: 200 });
    };
    await withServer({}, handle, async (base) => {
        const res = await fetchDiscardingBody(
            base + '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        );
        assertStrictEquals(res.status, 200);
        assertStrictEquals(
            seen, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        );
    });
});

Deno.test('bare /api is a miss, not a strip',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('api', { status: 200 });
    };
    await withServer({}, handle, async (base) => {
        const res = await fetch(base + '/api');
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'Not found');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('GET /api/ hops to handleRequest as /',
async () => {
    let seen = '';
    const handle: RequestHandler = async (
        _adapter, request,
    ) => {
        seen = new URL(request.url).pathname;
        return new Response('ok', { status: 200 });
    };
    await withServer({}, handle, async (base) => {
        await fetchDiscardingBody(base + '/api/');
        assertStrictEquals(seen, '/');
    });
});

Deno.test('unsigned fetch under /api/ is 401 JSON',
async () => {
    await withServer({}, undefined, async (base) => {
        const res = await fetch(
            base + '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        );
        assertStrictEquals(res.status, HTTP_UNAUTHORIZED);
        assertMatch(
            res.headers.get('content-type') ?? '',
            /application\/json/,
        );
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'invalid_token');
    });
});
