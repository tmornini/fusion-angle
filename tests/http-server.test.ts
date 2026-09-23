import {
    assert,
    assertEquals,
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
import { generateIdentifier } from
    '../shared/identifier.ts';

async function gzipBytes(
    text: string,
): Promise<Uint8Array> {
    const source = new Blob([text]).stream()
        .pipeThrough(
            new CompressionStream('gzip'),
        );
    return new Uint8Array(
        await new Response(source).arrayBuffer(),
    );
}

function concatChunks(
    chunks: readonly Uint8Array[],
): Uint8Array {
    let size = 0;
    for (const chunk of chunks) size += chunk.byteLength;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

// Deno fetch decompresses gzip and injects Accept-Encoding
// gzip,br, so a pin of sidecar bytes has to speak HTTP/1.1.
async function rawRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
): Promise<{
    status: number;
    header(name: string): string | null;
    body: Uint8Array;
}> {
    const parsed = new URL(url);
    const conn = await Deno.connect({
        hostname: parsed.hostname,
        port: Number(parsed.port),
    });
    try {
        const lines = [
            method + ' ' + parsed.pathname + ' HTTP/1.1',
            'Host: ' + parsed.host,
            'Connection: close',
        ];
        for (const [name, value] of Object.entries(headers)) {
            lines.push(name + ': ' + value);
        }
        await conn.write(
            new TextEncoder().encode(
                lines.join('\r\n') + '\r\n\r\n',
            ),
        );
        const chunks: Uint8Array[] = [];
        const buf = new Uint8Array(8192);
        for (;;) {
            const n = await conn.read(buf);
            if (n === null) break;
            chunks.push(buf.slice(0, n));
        }
        const bytes = concatChunks(chunks);
        const splitAt = new TextDecoder().decode(bytes)
            .indexOf('\r\n\r\n');
        if (splitAt === -1) {
            throw new Error('no HTTP header terminator');
        }
        const head = new TextDecoder().decode(
            bytes.slice(0, splitAt),
        );
        const body = bytes.slice(splitAt + 4);
        const headerLines = head.split('\r\n');
        const status = Number(
            (headerLines[0] ?? '').split(' ')[1],
        );
        const parsedHeaders = new Headers();
        for (const line of headerLines.slice(1)) {
            const colon = line.indexOf(':');
            if (colon === -1) continue;
            parsedHeaders.append(
                line.slice(0, colon).trim(),
                line.slice(colon + 1).trim(),
            );
        }
        return {
            status,
            header: (name) => parsedHeaders.get(name),
            body,
        };
    } finally {
        conn.close();
    }
}

async function withServer(
    files: Record<string, string | Uint8Array>,
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
            if (body instanceof Uint8Array) {
                await Deno.writeFile(path, body);
            } else {
                await Deno.writeTextFile(path, body);
            }
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
            {
                headers: {
                    'operation-id': generateIdentifier(),
                },
            },
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

Deno.test(
    'gzip sidecar is served when accepted',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await rawRequest(
                base + '/assets/app.deadbeef.js',
                'GET',
                { 'Accept-Encoding': 'gzip' },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.header('content-encoding'),
                'gzip',
            );
            assertStrictEquals(
                res.header('vary'),
                'Accept-Encoding',
            );
            assertStrictEquals(
                res.header('cache-control'),
                HASHED_CACHE_CONTROL,
            );
            assertStrictEquals(
                res.header('content-type')
                    ?.startsWith(
                        'text/javascript',
                    )
                    || res.header(
                        'content-type',
                    )?.includes('javascript'),
                true,
            );
            assertStrictEquals(
                res.header('content-length'),
                String(gz.length),
            );
            assertEquals([...res.body], [...gz]);
        });
    },
);

Deno.test(
    'identity body when gzip is not accepted',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
                {
                    headers: {
                        'Accept-Encoding': 'identity',
                    },
                },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                null,
            );
            assertStrictEquals(
                res.headers.get('vary'),
                'Accept-Encoding',
            );
            assertStrictEquals(
                await res.text(), body,
            );
        });
    },
);

Deno.test(
    'HEAD reports the gzip Content-Length',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
                {
                    method: 'HEAD',
                    headers: {
                        'Accept-Encoding': 'gzip',
                    },
                },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                'gzip',
            );
            assertStrictEquals(
                res.headers.get('content-length'),
                String(gz.length),
            );
            assertStrictEquals(
                await res.text(), '',
            );
        });
    },
);

Deno.test(
    'gzip;q=0 does not accept the sidecar',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
                {
                    headers: {
                        'Accept-Encoding': 'gzip;q=0',
                    },
                },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                null,
            );
            assertStrictEquals(
                await res.text(), body,
            );
        });
    },
);

Deno.test(
    'request path ending in .gz is 404',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetchDiscardingBody(
                base + '/assets/app.deadbeef.js.gz',
            );
            assertStrictEquals(res.status, HTTP_NOT_FOUND);
        });
    },
);
