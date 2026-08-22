import { generateIdentifier } from
    '../shared/identifier.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { messageStore } from '../api/message-store.ts';
import type { DbAdapter } from '../api/db.ts';

const BASE = 'http://localhost';

// Fixed 22-char id for below-gate pair fixtures that do
// not ride a public write (seed/tests). Not a public mint.
export const TEST_OPERATION_ID = '0123456789ABCDEFGHIJKw';

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

export function apiRequest(input: {
    readonly method: string;
    readonly path: string;
    readonly token?: string;
    readonly body?: unknown;
    readonly operationId?: string;
    readonly headers?: Readonly<Record<string, string>>;
}): Request {
    const write = input.method !== 'GET'
        && input.method !== 'HEAD';
    const headers: Record<string, string> = {
        ...(input.headers ?? {}),
    };
    if (input.token !== undefined) {
        headers['Authorization'] =
            'Bearer ' + input.token;
    }
    if (input.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (write && headers['operation-id'] === undefined) {
        headers['operation-id'] =
            input.operationId
            ?? generateIdentifier();
    }
    return new Request(BASE + input.path, {
        method: input.method,
        headers,
        ...(input.body !== undefined
            ? { body: JSON.stringify(input.body) }
            : {}),
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
    const stored = await messageStore(db).get(
        collection, id,
    );
    if (stored === undefined) {
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
