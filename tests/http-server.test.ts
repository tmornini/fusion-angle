import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    HTTP_NOT_FOUND,
    HTTP_PAYLOAD_TOO_LARGE,
    HTTP_UNAUTHORIZED,
} from '../api/http-errors.ts';
import {
    CONTENT_SECURITY_POLICY,
    HASHED_CACHE_CONTROL,
    NO_STORE,
    REQUEST_BODY_MAX_BYTES,
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

Deno.test('body over 1 MiB is 413 and is not parsed',
async () => {
    let handled = 0;
    const handle: RequestHandler = async () => {
        handled += 1;
        return new Response('parsed', { status: 200 });
    };
    await withServer({}, handle, async (base) => {
        const res = await fetch(base + '/ideas', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: 'x'.repeat(REQUEST_BODY_MAX_BYTES + 1),
        });
        assertStrictEquals(res.status, HTTP_PAYLOAD_TOO_LARGE);
        assertStrictEquals(
            res.headers.get('cache-control'),
            NO_STORE,
        );
        const body = await res.json() as {
            error: string;
        };
        assertStrictEquals(body.error, 'payload too large');
        assertStrictEquals(handled, 0);
    });
});

Deno.test('HTML is no-store and hashed assets are immutable',
async () => {
    await withServer({
        'landing/index.html': '<p>hi</p>',
        'assets/app.js': 'console.log(1)',
        'assets/app.deadbeef.js': 'ok',
    }, undefined, async (base) => {
        const page = await fetch(
            base + '/landing/index.html',
        );
        assertStrictEquals(page.status, 200);
        assertStrictEquals(
            page.headers.get('cache-control'),
            NO_STORE,
        );
        assertStrictEquals(await page.text(), '<p>hi</p>');

        const app = await fetchDiscardingBody(base + '/assets/app.js');
        assertStrictEquals(app.status, 200);
        assertStrictEquals(
            app.headers.get('cache-control'),
            NO_STORE,
        );

        const hashed = await fetchDiscardingBody(
            base + '/assets/app.deadbeef.js',
        );
        assertStrictEquals(hashed.status, 200);
        assertStrictEquals(
            hashed.headers.get('cache-control'),
            HASHED_CACHE_CONTROL,
        );
    });
});

Deno.test('HTML carries the Content-Security-Policy header',
async () => {
    await withServer({
        'landing/index.html': '<p>hi</p>',
        'assets/app.js': 'console.log(1)',
    }, undefined, async (base) => {
        const page = await fetchDiscardingBody(
            base + '/landing/index.html',
        );
        assertStrictEquals(page.status, 200);
        assertStrictEquals(
            page.headers.get('content-security-policy'),
            "default-src 'self'; script-src 'self';"
            + " style-src 'self';"
            + " style-src-attr 'unsafe-inline';"
            + " font-src 'self'; img-src 'self' data:;"
            + " frame-ancestors 'none'; base-uri 'self';"
            + " form-action 'self'",
        );
        assertStrictEquals(
            page.headers.get('content-security-policy'),
            CONTENT_SECURITY_POLICY,
        );

        const head = await fetchDiscardingBody(
            base + '/landing/index.html',
            { method: 'HEAD' },
        );
        assertStrictEquals(head.status, 200);
        assertStrictEquals(
            head.headers.get('content-security-policy'),
            CONTENT_SECURITY_POLICY,
        );

        const app = await fetchDiscardingBody(base + '/assets/app.js');
        assertStrictEquals(app.status, 200);
        assertStrictEquals(
            app.headers.get('content-security-policy'),
            null,
        );

        const miss = await fetchDiscardingBody(base + '/assets/no.js');
        assertStrictEquals(miss.status, 404);
        assertStrictEquals(
            miss.headers.get('content-security-policy'),
            null,
        );
    });
});

Deno.test('missing static file is 404', async () => {
    await withServer({}, undefined, async (base) => {
        const res = await fetchDiscardingBody(base + '/assets/no.js');
        assertStrictEquals(res.status, HTTP_NOT_FOUND);
    });
});

Deno.test('API path without a token is 401 before 404',
async () => {
    await withServer({}, undefined, async (base, logs) => {
        const res = await fetchDiscardingBody(
            base
            + '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas?secret=1',
        );
        assertStrictEquals(res.status, HTTP_UNAUTHORIZED);
        const last = logs[logs.length - 1];
        assert(last !== undefined);
        assertStrictEquals(
            last['path'],
            '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas',
        );
        assertStrictEquals(last['method'], 'GET');
        assertStrictEquals(last['status'], HTTP_UNAUTHORIZED);
        assertStrictEquals(typeof last['at'], 'string');
        assertMatch(
            String(last['at']),
            /^\d{4}-\d{2}-\d{2}T/,
        );
        assertStrictEquals(last['operationId'], undefined);
    });
});

Deno.test('no web-app HTML carries a CSP meta; the server does',
() => {
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of Deno.readDirSync(dir)) {
            const path = join(dir, entry.name);
            if (entry.isDirectory) {
                walk(path);
            } else if (entry.name.endsWith('.html')) {
                files.push(path);
            }
        }
    };
    walk('web-app');
    assert(files.length >= 30);
    for (const path of files) {
        assertNotMatch(
            Deno.readTextFileSync(path),
            /Content-Security-Policy/,
            path + ' carries a CSP meta',
        );
    }
    assertMatch(
        Deno.readTextFileSync('server/http-server.ts'),
        /Content-Security-Policy/,
    );
});
