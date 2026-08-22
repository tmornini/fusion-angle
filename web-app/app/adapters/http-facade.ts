import { generateIdentifier } from
    '../../../shared/identifier.ts';
import {
    UnauthorizedError,
    RequestError,
    HTTP_UNAUTHORIZED,
} from '../../../api/http-errors.ts';
import { REQUEST_ID_HEADER } from
    '../../../api/request-context.ts';
import { OPERATION_ID_HEADER } from
    '../../../api/message-pair.ts';
import { putSessionToken } from './session-token.ts';
import { runSingleFlightRefresh } from
    './session-refresh-mutex.ts';
import { navigateTo } from '../navigation.ts';

// Fetch transport for the server ZIP. Same RequestContext
// verbs as the in-page facade, over real HTTP. No import of
// api/api.ts — that graph stays out of the server client.
// Writes always send Operation-ID. A 401 single-flights a
// cookie refresh POST, retries once, and bounces to /auth
// if that refresh fails.

export interface HttpFacade {
    GET<T>(
        resource: string,
        token: string,
        requestId?: string,
    ): Promise<T>;
    GETWithEtag<T>(
        resource: string,
        token: string,
        requestId?: string,
    ): Promise<{ body: T; etag: string | undefined }>;
    PUT<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: readonly (readonly [string, string])[],
        requestId?: string,
    ): Promise<T>;
    PUTWithEtag<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: readonly (readonly [string, string])[],
        requestId?: string,
    ): Promise<{ body: T; etag: string | undefined }>;
    PATCH<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: readonly (readonly [string, string])[],
        requestId?: string,
    ): Promise<T>;
    PATCHWithEtag<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: readonly (readonly [string, string])[],
        requestId?: string,
    ): Promise<{ body: T; etag: string | undefined }>;
    DELETE(
        resource: string,
        token: string,
        requestId?: string,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<void>;
    POST<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        requestId?: string,
        headerFields?: readonly (readonly [string, string])[],
    ): Promise<T>;
}

async function unwrapResponse<T>(
    response: Response,
): Promise<T> {
    if (response.ok) {
        const text = await response.text();
        if (text === '') return undefined as T;
        return JSON.parse(text) as T;
    }
    const { error } =
        (await response.json()) as {
            error: string;
        };
    if (response.status === HTTP_UNAUTHORIZED) {
        throw new UnauthorizedError(error);
    }
    throw new RequestError(
        `${error} (${response.url})`,
        response.status,
    );
}

function etagFromHeader(
    response: Response,
): string | undefined {
    const raw = response.headers.get('ETag');
    if (raw === null || raw === '') {
        return undefined;
    }
    if (
        raw.length >= 2
        && raw[0] === '"'
        && raw[raw.length - 1] === '"'
    ) {
        return raw.slice(1, -1);
    }
    return raw;
}

function requestHeaders(
    token: string,
    requestId: string | undefined,
    contentType: boolean,
    write: boolean,
    extra: readonly (readonly [string, string])[]
        | undefined,
): Headers {
    const headers = new Headers();
    if (token !== '') {
        headers.set('Authorization', 'Bearer ' + token);
    }
    if (contentType) {
        headers.set('Content-Type', 'application/json');
    }
    if (requestId !== undefined) {
        headers.set(REQUEST_ID_HEADER, requestId);
    }
    if (extra !== undefined) {
        for (const [name, value] of extra) {
            headers.set(name, value);
        }
    }
    if (write && !headers.has(OPERATION_ID_HEADER)) {
        headers.set(
            OPERATION_ID_HEADER,
            generateIdentifier(),
        );
    }
    return headers;
}

export function createHttpFacade(
    origin: string,
): HttpFacade {
    function exchange(
        method: string,
        resource: string,
        token: string,
        requestId: string | undefined,
        payload: Record<string, unknown> | undefined,
        extra: readonly (readonly [string, string])[]
            | undefined,
        write: boolean,
    ): Promise<Response> {
        return fetch(origin + '/api/' + resource, {
            method,
            credentials: 'same-origin',
            headers: requestHeaders(
                token,
                requestId,
                payload !== undefined,
                write,
                extra,
            ),
            ...(payload !== undefined
                ? { body: JSON.stringify(payload) }
                : {}),
        });
    }

    async function postCookieRefresh(
    ): Promise<string | null> {
        const response = await fetch(
            origin + '/api/authentication/token', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    grant_type: 'refresh',
                }),
            },
        );
        if (!response.ok) return null;
        const body = await response.json() as {
            access_token?: unknown;
        };
        return typeof body.access_token === 'string'
            ? body.access_token
            : null;
    }

    async function exchangeOnce(
        method: string,
        resource: string,
        token: string,
        requestId: string | undefined,
        payload: Record<string, unknown> | undefined,
        extra: readonly (readonly [string, string])[]
            | undefined,
        write: boolean,
    ): Promise<Response> {
        const first = await exchange(
            method, resource, token, requestId,
            payload, extra, write,
        );
        if (first.status !== HTTP_UNAUTHORIZED) {
            return first;
        }
        if (resource === 'authentication/token') {
            return first;
        }
        const access = await runSingleFlightRefresh(
            postCookieRefresh,
        );
        if (access === null) {
            navigateTo('auth');
            return first;
        }
        putSessionToken(access);
        return exchange(
            method, resource, access, requestId,
            payload, extra, write,
        );
    }

    const facade: HttpFacade = {
        GET: async (resource, token, requestId) =>
            unwrapResponse(
                await exchangeOnce(
                    'GET', resource, token, requestId,
                    undefined, undefined, false,
                ),
            ),
        GETWithEtag: async (resource, token, requestId) => {
            const response = await exchangeOnce(
                'GET', resource, token, requestId,
                undefined, undefined, false,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        PUT: async (
            resource, payload, token,
            headerFields, requestId,
        ) => unwrapResponse(
            await exchangeOnce(
                'PUT', resource, token, requestId,
                payload, headerFields, true,
            ),
        ),
        PUTWithEtag: async (
            resource, payload, token,
            headerFields, requestId,
        ) => {
            const response = await exchangeOnce(
                'PUT', resource, token, requestId,
                payload, headerFields, true,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        PATCH: async (
            resource, payload, token,
            headerFields, requestId,
        ) => unwrapResponse(
            await exchangeOnce(
                'PATCH', resource, token, requestId,
                payload, headerFields, true,
            ),
        ),
        PATCHWithEtag: async (
            resource, payload, token,
            headerFields, requestId,
        ) => {
            const response = await exchangeOnce(
                'PATCH', resource, token, requestId,
                payload, headerFields, true,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        DELETE: async (
            resource, token, requestId, headerFields,
        ) => {
            await unwrapResponse(
                await exchangeOnce(
                    'DELETE', resource, token, requestId,
                    undefined, headerFields, true,
                ),
            );
        },
        POST: async (
            resource, payload, token,
            requestId, headerFields,
        ) => unwrapResponse(
            await exchangeOnce(
                'POST', resource, token, requestId,
                payload, headerFields, true,
            ),
        ),
    };
    return facade;
}
