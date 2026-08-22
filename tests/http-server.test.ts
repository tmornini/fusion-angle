import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from
    'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    HTTP_NOT_FOUND,
    HTTP_PAYLOAD_TOO_LARGE,
    HTTP_UNAUTHORIZED,
} from '../api/http-errors.ts';
import {
    HASHED_CACHE_CONTROL,
    NO_STORE,
    REQUEST_BODY_MAX_BYTES,
    listenHttp,
    type HttpListener,
    type RequestHandler,
} from '../server/http-server.ts';

async function withServer(
    files: Record<string, string>,
    handle: RequestHandler | undefined,
    run: (
        base: string,
        logs: Record<string, unknown>[],
    ) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(
        join(tmpdir(), 'fusion-http-'),
    );
    const logs: Record<string, unknown>[] = [];
    let listener: HttpListener | undefined;
    try {
        for (const [rel, body] of Object.entries(files)) {
            const path = join(root, rel);
            await mkdir(join(path, '..'), {
                recursive: true,
            });
            await writeFile(path, body);
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
        await rm(root, { recursive: true, force: true });
    }
}

test('body over 1 MiB is 413 and is not parsed',
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
        assert.equal(res.status, HTTP_PAYLOAD_TOO_LARGE);
        assert.equal(
            res.headers.get('cache-control'),
            NO_STORE,
        );
        const body = await res.json() as {
            error: string;
        };
        assert.equal(body.error, 'payload too large');
        assert.equal(handled, 0);
    });
});

test('HTML is no-store and hashed assets are immutable',
async () => {
    await withServer({
        'landing/index.html': '<p>hi</p>',
        'assets/app.js': 'console.log(1)',
        'assets/app.deadbeef.js': 'ok',
    }, undefined, async (base) => {
        const page = await fetch(
            base + '/landing/index.html',
        );
        assert.equal(page.status, 200);
        assert.equal(
            page.headers.get('cache-control'),
            NO_STORE,
        );
        assert.equal(await page.text(), '<p>hi</p>');

        const app = await fetch(base + '/assets/app.js');
        assert.equal(app.status, 200);
        assert.equal(
            app.headers.get('cache-control'),
            NO_STORE,
        );

        const hashed = await fetch(
            base + '/assets/app.deadbeef.js',
        );
        assert.equal(hashed.status, 200);
        assert.equal(
            hashed.headers.get('cache-control'),
            HASHED_CACHE_CONTROL,
        );
    });
});

test('missing static file is 404', async () => {
    await withServer({}, undefined, async (base) => {
        const res = await fetch(base + '/assets/no.js');
        assert.equal(res.status, HTTP_NOT_FOUND);
    });
});

test('API path without a token is 401 before 404',
async () => {
    await withServer({}, undefined, async (base, logs) => {
        const res = await fetch(
            base
            + '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas?secret=1',
        );
        assert.equal(res.status, HTTP_UNAUTHORIZED);
        const last = logs[logs.length - 1];
        assert.ok(last !== undefined);
        assert.equal(
            last['path'],
            '/api/organizations/AjdvjuECVZEgZoFajaIEkg/ideas',
        );
        assert.equal(last['method'], 'GET');
        assert.equal(last['status'], HTTP_UNAUTHORIZED);
        assert.equal(typeof last['at'], 'string');
        assert.match(
            String(last['at']),
            /^\d{4}-\d{2}-\d{2}T/,
        );
        assert.equal(last['operationId'], undefined);
    });
});
