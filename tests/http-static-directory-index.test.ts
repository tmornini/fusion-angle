import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from
    'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Node fetch overwrites Sec-Fetch-Mode to the request
// mode (`cors`). A document navigation can only be
// sent on the raw socket.
function getDocument(
    url: string,
): Promise<Response> {
    const parsed = new URL(url);
    return new Promise((resolve, reject) => {
        const req = request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname,
            agent: false,
            headers: {
                'sec-fetch-mode': 'navigate',
            },
        }, (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            incoming.on('end', () => {
                resolve(new Response(
                    Buffer.concat(chunks),
                    {
                        status:
                            incoming.statusCode ?? 0,
                        headers: {
                            'content-type':
                                incoming.headers
                                    ['content-type']
                                ?? '',
                        },
                    },
                ));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

test('/api-documentation/get/identities/ serves'
    + ' index.html',
async () => {
    await withServer({
        'api-documentation/get/identities/index.html':
            '<p>identities collection</p>',
    }, undefined, async (base) => {
        const res = await fetch(
            base + '/api-documentation/get/identities/',
        );
        assert.equal(res.status, 200);
        assert.equal(
            res.headers.get('content-type'),
            'text/html; charset=utf-8',
        );
        assert.equal(
            await res.text(),
            '<p>identities collection</p>',
        );
    });
});

test('/ideas/ does not become a static hit',
async () => {
    await withServer({}, undefined, async (base) => {
        const res = await fetch(base + '/ideas/');
        assert.equal(res.status, HTTP_UNAUTHORIZED);
        assert.match(
            res.headers.get('content-type') ?? '',
            /application\/json/,
        );
    });
});

test('missing room under /api-documentation/ is'
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
        assert.equal(res.status, HTTP_NOT_FOUND);
        const body = await res.json() as {
            error: string;
        };
        assert.equal(body.error, 'Not found');
        assert.equal(handled, 0);
    });
});

test('a document navigation to a retired path'
    + ' serves not-found HTML',
async () => {
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, undefined, async (base) => {
        const res = await getDocument(
            base + '/snapshots',
        );
        assert.equal(res.status, 200);
        assert.match(
            res.headers.get('content-type') ?? '',
            /text\/html/,
        );
        assert.equal(await res.text(), '<p>gone</p>');
    });
});

test('a fetch to a retired path stays 401 JSON',
async () => {
    await withServer({
        'not-found/index.html': '<p>gone</p>',
    }, undefined, async (base) => {
        const res = await fetch(base + '/snapshots');
        assert.equal(res.status, HTTP_UNAUTHORIZED);
        assert.match(
            res.headers.get('content-type') ?? '',
            /application\/json/,
        );
        const body = await res.json() as {
            error: string;
        };
        assert.equal(body.error, 'invalid_token');
    });
});
