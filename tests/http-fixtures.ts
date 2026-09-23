import { generateIdentifier } from
    '../shared/identifier.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { messageStore } from '../api/message-store.ts';
import type { DbAdapter } from '../api/db.ts';

const BASE = 'http://localhost';

// The pair id a response advertises: its strong ETag,
// unquoted. No ETag → null.
export function pairIdOf(response: Response): string | null {
    const raw = response.headers.get('ETag');
    if (raw === null) return null;
    return raw.length >= 2
        && raw.startsWith('"')
        && raw.endsWith('"')
        ? raw.slice(1, -1)
        : raw;
}

export function setCookieHeader(res: Response): string {
    const cookies = typeof res.headers.getSetCookie
        === 'function'
        ? res.headers.getSetCookie()
        : [];
    if (cookies.length > 0) {
        return cookies.join('\n');
    }
    return res.headers.get('Set-Cookie') ?? '';
}

export function refreshTokenFromSetCookie(
    res: Response,
): string {
    const match = /(?:^|[\n,])\s*refresh_token=([^;\n]+)/
        .exec(setCookieHeader(res));
    if (match === null) {
        throw new Error('Set-Cookie missing refresh_token');
    }
    return match[1]!.trim();
}

// In-process tests build Request directly. The gate
// requires operation-id, and a body requires the
// UTF-8 content-length fetch would have set. A
// header the caller already set is left alone.
export function framedRequest(
    input: string | URL,
    init?: RequestInit,
): Request {
    const headers = new Headers(init?.headers);
    const body = init?.body;
    if (
        body !== undefined
        && body !== null
        && !headers.has('content-length')
    ) {
        const length = bodyByteLength(body);
        if (length !== undefined) {
            headers.set('content-length', String(length));
        }
    }
    if (!headers.has('operation-id')) {
        headers.set('operation-id', generateIdentifier());
    }
    return new Request(input, {
        ...init,
        headers,
        ...(body !== undefined ? { body } : {}),
    });
}

function bodyByteLength(body: BodyInit): number | undefined {
    if (typeof body === 'string') {
        return new TextEncoder().encode(body).byteLength;
    }
    if (body instanceof Uint8Array) return body.byteLength;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    if (body instanceof Blob) return body.size;
    return undefined;
}

export function apiRequest(input: {
    readonly method: string;
    readonly path: string;
    readonly token?: string;
    readonly body?: unknown;
    readonly operationId?: string;
    readonly headers?: Readonly<Record<string, string>>;
}): Request {
    const headers: Record<string, string> = {
        ...(input.headers ?? {}),
    };
    if (input.token !== undefined) {
        headers['Authorization'] =
            'Bearer ' + input.token;
    }
    let body: string | undefined;
    if (input.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(input.body);
        headers['content-length'] = String(
            new TextEncoder().encode(body).byteLength,
        );
    }
    if (headers['operation-id'] === undefined) {
        headers['operation-id'] =
            input.operationId
            ?? generateIdentifier();
    }
    return new Request(BASE + input.path, {
        method: input.method,
        headers,
        ...(body !== undefined ? { body } : {}),
    });
}

export function storedMessageBodyText(
    message: string,
): string {
    const body = HttpMessage.fromWire(message).body();
    return body.exists() ? body.toText() : '';
}

export async function storedPutBodyText(
    db: DbAdapter,
    collection: string,
    id: string,
): Promise<string> {
    const stored = await messageStore(db).getDocumentHead(
        collection, id,
    );
    if (stored === null) {
        throw new Error(
            'no live PUT at ' + collection + id,
        );
    }
    return storedMessageBodyText(stored.response);
}

export async function storedCollectionText(
    db: DbAdapter,
    collection: string,
): Promise<string> {
    const rows = await messageStore(db).getCollection(
        collection,
    );
    return JSON.stringify(rows);
}
