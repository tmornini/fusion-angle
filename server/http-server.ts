// HTTP adapter. Deno.serve (Request, info) →
// handleRequest → Response. Static files from the
// composed site root.

import {
    extname,
    relative,
    resolve,
    SEPARATOR,
} from '@std/path';
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

// The nine directives the page metas carried. A header
// governs from the first byte; a meta governs only from
// its parse point and browsers ignore frame-ancestors in
// meta. HTML only: API.svg is its own document under
// <object> with an inline <style>; JSON never becomes a
// document.
export const CONTENT_SECURITY_POLICY =
    "default-src 'self'; script-src 'self';"
    + " style-src 'self';"
    + " style-src-attr 'unsafe-inline';"
    + " font-src 'self'; img-src 'self' data:;"
    + " frame-ancestors 'none'; base-uri 'self';"
    + " form-action 'self'";

const MIME_BY_EXT: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

const LOG_ENCODER = new TextEncoder();

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
    | {
        readonly kind: 'bytes';
        readonly bytes: Uint8Array<ArrayBuffer>;
    }
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

function stripApiMount(
    pathname: string,
): string | undefined {
    if (!pathname.startsWith('/api/')) {
        return undefined;
    }
    return pathname.slice('/api'.length);
}

function headerLine(
    value: string | null,
): string | undefined {
    if (value === null || value === '') return undefined;
    return value;
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
    if (rel.split(SEPARATOR).includes('..')) {
        return undefined;
    }
    return full;
}

function isDocumentNavigation(
    request: Request,
): boolean {
    return request.method === 'GET'
        && headerLine(
            request.headers.get('sec-fetch-mode'),
        ) === 'navigate';
}

async function existingStaticFile(
    root: string,
    urlPath: string,
): Promise<string | undefined> {
    const filePath = safeStaticPath(root, urlPath);
    if (filePath === undefined) return undefined;
    try {
        const info = await Deno.stat(filePath);
        if (info.isFile) return filePath;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return undefined;
        }
        throw error;
    }
    return undefined;
}

function contentLengthOf(
    request: Request,
): number | undefined {
    const raw = request.headers.get('content-length');
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
}

function concatBytes(
    chunks: readonly Uint8Array[],
    size: number,
): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function readCappedBody(
    request: Request,
): Promise<BodyRead> {
    const declared = contentLengthOf(request);
    if (declared !== undefined
        && declared > REQUEST_BODY_MAX_BYTES) {
        if (request.body !== null) {
            await request.body.cancel();
        }
        return { kind: 'too-large' };
    }
    if (request.body === null) {
        return { kind: 'empty' };
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > REQUEST_BODY_MAX_BYTES) {
            await reader.cancel();
            return { kind: 'too-large' };
        }
        chunks.push(value);
    }
    reader.releaseLock();
    if (size === 0) return { kind: 'empty' };
    return {
        kind: 'bytes',
        bytes: concatBytes(chunks, size),
    };
}

function apiRequest(
    request: Request,
    body: Uint8Array<ArrayBuffer> | undefined,
    pathOverride: string,
): Request {
    const url = new URL(pathOverride, request.url);
    const method = request.method;
    const init: RequestInit = {
        method,
        headers: request.headers,
    };
    if (body !== undefined
        && method !== 'GET'
        && method !== 'HEAD') {
        init.body = body;
    }
    return new Request(url, init);
}

function jsonResponse(
    status: number,
    body: { readonly error: string },
    extra?: Readonly<Record<string, string>>,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type':
                'application/json; charset=utf-8',
            'Cache-Control': NO_STORE,
            ...(extra ?? {}),
        },
    });
}

function internalError(): Response {
    return jsonResponse(
        HTTP_INTERNAL_ERROR,
        { error: 'internal error' },
    );
}

async function serveStatic(
    request: Request,
    filePath: string,
): Promise<Response> {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        return jsonResponse(
            HTTP_METHOD_NOT_ALLOWED,
            { error: 'Method not allowed' },
            { Allow: 'GET, HEAD' },
        );
    }
    let info: Deno.FileInfo;
    try {
        info = await Deno.stat(filePath);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return jsonResponse(
                HTTP_NOT_FOUND, { error: 'Not found' },
            );
        }
        throw error;
    }
    if (!info.isFile) {
        return jsonResponse(
            HTTP_NOT_FOUND, { error: 'Not found' },
        );
    }
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_BY_EXT[ext]
        ?? 'application/octet-stream';
    const name = filePath.split(SEPARATOR).pop() ?? '';
    const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(info.size),
        'Cache-Control': staticCacheControl(name),
    };
    if (ext === '.html') {
        headers['Content-Security-Policy'] =
            CONTENT_SECURITY_POLICY;
    }
    if (method === 'HEAD') {
        return new Response(null, {
            status: 200,
            headers,
        });
    }
    let file: Deno.FsFile;
    try {
        file = await Deno.open(filePath, { read: true });
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return jsonResponse(
                HTTP_NOT_FOUND, { error: 'Not found' },
            );
        }
        throw error;
    }
    try {
        return new Response(file.readable, {
            status: 200,
            headers,
        });
    } catch (error) {
        file.close();
        throw error;
    }
}

async function serveMiss(
    request: Request,
    root: string,
): Promise<Response> {
    if (isDocumentNavigation(request)) {
        const notFound = await existingStaticFile(
            root, '/not-found/index.html',
        );
        if (notFound !== undefined) {
            return serveStatic(request, notFound);
        }
    }
    return jsonResponse(
        HTTP_NOT_FOUND, { error: 'Not found' },
    );
}

function grantTypeOf(
    bytes: Uint8Array<ArrayBuffer>,
): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(
            new TextDecoder().decode(bytes),
        );
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
    request: Request,
    method: string,
): string | undefined {
    if (!isWriteMethod(method)) return undefined;
    const raw = request.headers.get(OPERATION_ID_HEADER);
    if (raw === null || raw === '') return undefined;
    return raw;
}

function defaultLog(fields: Record<string, unknown>): void {
    Deno.stdout.writeSync(
        LOG_ENCODER.encode(JSON.stringify(fields) + '\n'),
    );
}

function logRequest(
    log: RequestLog,
    request: Request,
    status: number,
    started: number,
): void {
    const method = request.method;
    const fields: Record<string, unknown> = {
        at: new Date().toISOString(),
        level: levelFor(status),
        method,
        path: new URL(request.url).pathname,
        status,
        latencyMs: Math.max(0, Date.now() - started),
    };
    const operationId = operationIdOf(request, method);
    if (operationId !== undefined) {
        fields['operationId'] = operationId;
    }
    log(fields);
}

function remoteHostname(
    addr: Deno.Addr,
): string | undefined {
    if (addr.transport !== 'tcp'
        && addr.transport !== 'udp') {
        return undefined;
    }
    return addr.hostname;
}

async function dispatch(
    request: Request,
    info: Deno.ServeHandlerInfo,
    options: HttpListenOptions,
    handle: RequestHandler,
    log: RequestLog,
    throttle: AuthThrottle,
): Promise<Response> {
    const started = Date.now();
    let status = HTTP_INTERNAL_ERROR;
    try {
        const body = await readCappedBody(request);
        if (body.kind === 'too-large') {
            status = HTTP_PAYLOAD_TOO_LARGE;
            return jsonResponse(
                HTTP_PAYLOAD_TOO_LARGE,
                { error: 'payload too large' },
            );
        }
        const url = new URL(request.url);
        const pathname = url.pathname;

        if (pathname === '/' || pathname === '') {
            const filePath = await existingStaticFile(
                options.staticRoot, '/index.html',
            );
            if (filePath !== undefined) {
                const response = await serveStatic(
                    request, filePath,
                );
                status = response.status;
                return response;
            }
            const response = await serveMiss(
                request, options.staticRoot,
            );
            status = response.status;
            return response;
        }

        const resourcePath = stripApiMount(pathname);
        if (resourcePath !== undefined) {
            const requestPathname = new URL(
                resourcePath + url.search,
                request.url,
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
                    remoteHostname(info.remoteAddr),
                    headerLine(
                        request.headers.get('forwarded'),
                    ),
                    headerLine(
                        request.headers.get(
                            'x-forwarded-for',
                        ),
                    ),
                )) {
                status = HTTP_TOO_MANY_REQUESTS;
                return jsonResponse(
                    HTTP_TOO_MANY_REQUESTS,
                    { error: 'too many requests' },
                );
            }
            const bytes = body.kind === 'bytes'
                ? body.bytes
                : undefined;
            const response = await handle(
                options.adapter,
                apiRequest(
                    request,
                    bytes,
                    resourcePath + url.search,
                ),
            );
            if (!response.headers.has('cache-control')) {
                response.headers.set(
                    'Cache-Control', NO_STORE,
                );
            }
            status = response.status;
            return response;
        }

        if (pathname.endsWith('/')) {
            const filePath = await existingStaticFile(
                options.staticRoot,
                pathname + 'index.html',
            );
            if (filePath !== undefined) {
                const response = await serveStatic(
                    request, filePath,
                );
                status = response.status;
                return response;
            }
            const response = await serveMiss(
                request, options.staticRoot,
            );
            status = response.status;
            return response;
        }

        const filePath = await existingStaticFile(
            options.staticRoot, pathname,
        );
        if (filePath !== undefined) {
            const response = await serveStatic(
                request, filePath,
            );
            status = response.status;
            return response;
        }
        const response = await serveMiss(
            request, options.staticRoot,
        );
        status = response.status;
        return response;
    } catch {
        status = HTTP_INTERNAL_ERROR;
        return internalError();
    } finally {
        logRequest(log, request, status, started);
    }
}

async function closeServer(
    server: Deno.HttpServer,
    controller: AbortController,
    drainMs: number,
): Promise<void> {
    const timer = setTimeout(
        () => { controller.abort(); },
        drainMs,
    );
    try {
        await server.shutdown();
        await server.finished;
    } finally {
        clearTimeout(timer);
    }
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
    const controller = new AbortController();
    return new Promise((resolveListen, reject) => {
        try {
            const server = Deno.serve({
                port: options.port,
                ...(options.host !== undefined
                    ? { hostname: options.host }
                    : {}),
                signal: controller.signal,
                onListen: (addr) => {
                    resolveListen({
                        port: addr.port,
                        close: () => closeServer(
                            server, controller, drainMs,
                        ),
                    });
                },
                onError: internalError,
            }, (request, info) => dispatch(
                request, info, options, handle, log,
                throttle,
            ));
        } catch (error) {
            reject(error);
        }
    });
}
