// Node-only HTTP adapter. node:http → Request →
// handleRequest → ServerResponse. Static files from
// composed output. Excluded from tsc (no @types/node).

import {
    createReadStream,
} from 'node:fs';
import { stat } from 'node:fs/promises';
import {
    createServer,
    type IncomingMessage,
    type Server,
    type ServerResponse,
} from 'node:http';
import {
    extname,
    relative,
    resolve,
    sep,
} from 'node:path';
import { pipeline } from 'node:stream/promises';
import { handleRequest } from '../api/api.ts';
import type { GuardedDbAdapter } from '../api/db.ts';
import {
    HTTP_INTERNAL_ERROR,
    HTTP_METHOD_NOT_ALLOWED,
    HTTP_NOT_FOUND,
    HTTP_PAYLOAD_TOO_LARGE,
    HTTP_TOO_MANY_REQUESTS,
} from '../api/http-errors.ts';
import { OPERATION_ID_HEADER } from
    '../api/message-pair.ts';
import {
    createAuthThrottle,
    isAuthThrottlePath,
    isAuthTokenPath,
    type AuthThrottle,
} from './throttle.ts';

export const REQUEST_BODY_MAX_BYTES = 1_048_576;
export const DRAIN_TIMEOUT_MS = 10_000;
export const HASHED_CACHE_CONTROL =
    'public, max-age=31536000, immutable';
export const NO_STORE = 'no-store';

const STATIC_EXTENSIONS: ReadonlySet<string> = new Set([
    '.html',
    '.js',
    '.css',
    '.woff2',
    '.ico',
    '.svg',
]);

const MIME_BY_EXT: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

export type RequestHandler = (
    adapter: GuardedDbAdapter,
    request: Request,
) => Promise<Response>;

export type RequestLog = (
    fields: Record<string, unknown>,
) => void;

export interface HttpListenOptions {
    readonly adapter: GuardedDbAdapter;
    readonly staticRoot: string;
    readonly port: number;
    readonly host?: string;
    readonly handle?: RequestHandler;
    readonly log?: RequestLog;
    readonly drainMs?: number;
    readonly trustedProxyHops?: string;
}

export interface HttpListener {
    readonly port: number;
    close(): Promise<void>;
}

type BodyRead =
    | { readonly kind: 'bytes'; readonly bytes: Buffer }
    | { readonly kind: 'empty' }
    | { readonly kind: 'too-large' };

// name.hash.ext — eight or more hex digits. Fixed names
// such as app.js must not match.
export function isHashedAssetName(name: string): boolean {
    return /\.[0-9a-f]{8,}\.[a-z0-9]+$/i.test(name);
}

export function staticCacheControl(name: string): string {
    const ext = extname(name).toLowerCase();
    if (ext === '.html') return NO_STORE;
    if (isHashedAssetName(name)) {
        return HASHED_CACHE_CONTROL;
    }
    return NO_STORE;
}

function lastSegment(pathname: string): string {
    const parts = pathname.split('/');
    return parts[parts.length - 1] ?? '';
}

function staticExtensionOf(pathname: string): string {
    const base = lastSegment(pathname);
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return '';
    return base.slice(dot).toLowerCase();
}

function pathWithoutQuery(raw: string): string {
    const q = raw.indexOf('?');
    return q === -1 ? raw : raw.slice(0, q);
}

function headerLine(
    value: string | string[] | undefined,
): string | undefined {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) {
        if (value.length === 0) return undefined;
        return value.join(',');
    }
    return value === '' ? undefined : value;
}

export function safeStaticPath(
    root: string,
    urlPath: string,
): string | undefined {
    let decoded: string;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        return undefined;
    }
    if (decoded.includes('\0')) return undefined;
    const trimmed = decoded.replace(/^\/+/, '');
    if (trimmed === '') return undefined;
    const rootFull = resolve(root);
    const full = resolve(rootFull, trimmed);
    const rel = relative(rootFull, full);
    if (rel === '' || rel.startsWith('..')) {
        return undefined;
    }
    if (rel.split(sep).includes('..')) return undefined;
    return full;
}

function contentLengthOf(
    req: IncomingMessage,
): number | undefined {
    const raw = req.headers['content-length'];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
}

function drain(req: IncomingMessage): void {
    req.resume();
}

function readCappedBody(
    req: IncomingMessage,
): Promise<BodyRead> {
    const declared = contentLengthOf(req);
    if (declared !== undefined
        && declared > REQUEST_BODY_MAX_BYTES) {
        drain(req);
        return Promise.resolve({ kind: 'too-large' });
    }
    return new Promise((resolveRead, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const finish = (result: BodyRead): void => {
            if (settled) return;
            settled = true;
            resolveRead(result);
        };
        req.on('data', (chunk: Buffer) => {
            if (settled) return;
            size += chunk.length;
            if (size > REQUEST_BODY_MAX_BYTES) {
                drain(req);
                finish({ kind: 'too-large' });
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            if (size === 0) {
                finish({ kind: 'empty' });
                return;
            }
            finish({
                kind: 'bytes',
                bytes: Buffer.concat(chunks),
            });
        });
        req.on('error', (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });
    });
}

function requestHost(req: IncomingMessage): string {
    const host = req.headers.host;
    if (typeof host === 'string' && host !== '') {
        return host;
    }
    return '127.0.0.1';
}

function incomingToRequest(
    req: IncomingMessage,
    body: Buffer | undefined,
): Request {
    const path = req.url ?? '/';
    const url = 'http://' + requestHost(req) + path;
    const headers = new Headers();
    for (const [name, value] of Object.entries(
        req.headers,
    )) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(name, item);
            }
        } else {
            headers.set(name, value);
        }
    }
    const method = req.method ?? 'GET';
    const init: RequestInit = { method, headers };
    if (body !== undefined
        && method !== 'GET'
        && method !== 'HEAD') {
        init.body = new Uint8Array(body);
    }
    return new Request(url, init);
}

function writeJson(
    res: ServerResponse,
    status: number,
    body: { readonly error: string },
    extra?: Readonly<Record<string, string>>,
): void {
    const payload = Buffer.from(JSON.stringify(body));
    res.statusCode = status;
    res.setHeader(
        'Content-Type',
        'application/json; charset=utf-8',
    );
    res.setHeader('Cache-Control', NO_STORE);
    res.setHeader(
        'Content-Length',
        String(payload.byteLength),
    );
    if (extra !== undefined) {
        for (const [name, value] of Object.entries(
            extra,
        )) {
            res.setHeader(name, value);
        }
    }
    res.end(payload);
}

async function writeFetchResponse(
    res: ServerResponse,
    response: Response,
): Promise<void> {
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
        res.setHeader(name, value);
    });
    if (!res.hasHeader('cache-control')) {
        res.setHeader('Cache-Control', NO_STORE);
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (!res.hasHeader('content-length')) {
        res.setHeader(
            'Content-Length',
            String(buf.byteLength),
        );
    }
    res.end(buf);
}

async function serveStatic(
    req: IncomingMessage,
    res: ServerResponse,
    filePath: string,
): Promise<number> {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        writeJson(
            res,
            HTTP_METHOD_NOT_ALLOWED,
            { error: 'Method not allowed' },
            { Allow: 'GET, HEAD' },
        );
        return HTTP_METHOD_NOT_ALLOWED;
    }
    let info: { isFile(): boolean; size: number };
    try {
        info = await stat(filePath);
    } catch {
        writeJson(
            res, HTTP_NOT_FOUND, { error: 'Not found' },
        );
        return HTTP_NOT_FOUND;
    }
    if (!info.isFile()) {
        writeJson(
            res, HTTP_NOT_FOUND, { error: 'Not found' },
        );
        return HTTP_NOT_FOUND;
    }
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_BY_EXT[ext]
        ?? 'application/octet-stream';
    const name = filePath.split(sep).pop() ?? '';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', staticCacheControl(name));
    if (method === 'HEAD') {
        res.end();
        return 200;
    }
    await pipeline(createReadStream(filePath), res);
    return 200;
}

function grantTypeOf(bytes: Buffer): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
        return undefined;
    }
    if (parsed === null
        || typeof parsed !== 'object'
        || Array.isArray(parsed)) {
        return undefined;
    }
    const grantType = (parsed as {
        readonly grant_type?: unknown;
    }).grant_type;
    return typeof grantType === 'string'
        ? grantType
        : undefined;
}

function isWriteMethod(method: string): boolean {
    return method !== 'GET' && method !== 'HEAD';
}

function levelFor(
    status: number,
): 'info' | 'warn' | 'error' {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    return 'info';
}

function operationIdOf(
    req: IncomingMessage,
    method: string,
): string | undefined {
    if (!isWriteMethod(method)) return undefined;
    const raw = req.headers[OPERATION_ID_HEADER];
    if (typeof raw !== 'string' || raw === '') {
        return undefined;
    }
    return raw;
}

function defaultLog(fields: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify(fields) + '\n');
}

function logRequest(
    log: RequestLog,
    req: IncomingMessage,
    status: number,
    started: number,
): void {
    const method = req.method ?? 'GET';
    const fields: Record<string, unknown> = {
        at: new Date().toISOString(),
        level: levelFor(status),
        method,
        path: pathWithoutQuery(req.url ?? '/'),
        status,
        latencyMs: Math.max(0, Date.now() - started),
    };
    const operationId = operationIdOf(req, method);
    if (operationId !== undefined) {
        fields['operationId'] = operationId;
    }
    log(fields);
}

async function dispatch(
    req: IncomingMessage,
    res: ServerResponse,
    options: HttpListenOptions,
    handle: RequestHandler,
    log: RequestLog,
    throttle: AuthThrottle,
): Promise<void> {
    const started = Date.now();
    let status = HTTP_INTERNAL_ERROR;
    try {
        const body = await readCappedBody(req);
        if (body.kind === 'too-large') {
            writeJson(
                res,
                HTTP_PAYLOAD_TOO_LARGE,
                { error: 'payload too large' },
            );
            status = HTTP_PAYLOAD_TOO_LARGE;
            return;
        }
        let pathname = pathWithoutQuery(req.url ?? '/');
        if (pathname === '' || pathname === '/') {
            pathname = '/index.html';
        }
        const ext = staticExtensionOf(pathname);
        if (STATIC_EXTENSIONS.has(ext)) {
            const filePath = safeStaticPath(
                options.staticRoot, pathname,
            );
            if (filePath === undefined) {
                writeJson(
                    res,
                    HTTP_NOT_FOUND,
                    { error: 'Not found' },
                );
                status = HTTP_NOT_FOUND;
                return;
            }
            status = await serveStatic(req, res, filePath);
            return;
        }
        if (
            pathname === '/api-documentation'
            || pathname.startsWith(
                '/api-documentation/',
            )
        ) {
            const indexed = pathname.endsWith('/')
                ? pathname + 'index.html'
                : pathname + '/index.html';
            const filePath = safeStaticPath(
                options.staticRoot, indexed,
            );
            if (filePath === undefined) {
                writeJson(
                    res,
                    HTTP_NOT_FOUND,
                    { error: 'Not found' },
                );
                status = HTTP_NOT_FOUND;
                return;
            }
            status = await serveStatic(
                req, res, filePath,
            );
            return;
        }
        const requestPathname = new URL(
            'http://'
                + requestHost(req)
                + (req.url ?? '/'),
        ).pathname;
        let grantType: string | undefined;
        if (isAuthTokenPath(requestPathname)
            && body.kind === 'bytes') {
            grantType = grantTypeOf(body.bytes);
        }
        if (isAuthThrottlePath(requestPathname)
            && grantType !== 'refresh'
            && grantType !== 'token-exchange'
            && throttle.limited(
                req.socket.remoteAddress,
                headerLine(req.headers['forwarded']),
                headerLine(req.headers['x-forwarded-for']),
            )) {
            writeJson(
                res,
                HTTP_TOO_MANY_REQUESTS,
                { error: 'too many requests' },
            );
            status = HTTP_TOO_MANY_REQUESTS;
            return;
        }
        const bytes = body.kind === 'bytes'
            ? body.bytes
            : undefined;
        const request = incomingToRequest(req, bytes);
        const response = await handle(
            options.adapter, request,
        );
        await writeFetchResponse(res, response);
        status = response.status;
    } catch {
        if (!res.headersSent) {
            writeJson(
                res,
                HTTP_INTERNAL_ERROR,
                { error: 'internal error' },
            );
            status = HTTP_INTERNAL_ERROR;
        }
    } finally {
        logRequest(log, req, status, started);
    }
}

function closeHttpServer(
    server: Server,
    drainMs: number,
): Promise<void> {
    return new Promise((resolveClose, reject) => {
        const timer = setTimeout(() => {
            server.closeAllConnections();
        }, drainMs);
        server.close((error?: Error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else resolveClose();
        });
    });
}

export function listenHttp(
    options: HttpListenOptions,
): Promise<HttpListener> {
    const handle = options.handle ?? handleRequest;
    const log = options.log ?? defaultLog;
    const drainMs = options.drainMs ?? DRAIN_TIMEOUT_MS;
    const throttle = createAuthThrottle(
        options.trustedProxyHops,
    );
    const server = createServer((req, res) => {
        void dispatch(
            req, res, options, handle, log, throttle,
        );
    });
    return new Promise((resolveListen, reject) => {
        server.once('error', reject);
        const onListening = (): void => {
            const addr = server.address();
            if (addr === null || typeof addr === 'string') {
                reject(new Error('HTTP bind failed'));
                return;
            }
            resolveListen({
                port: addr.port,
                close: () => closeHttpServer(
                    server, drainMs,
                ),
            });
        };
        if (options.host !== undefined) {
            server.listen(
                options.port, options.host, onListening,
            );
        } else {
            server.listen(options.port, onListening);
        }
    });
}
