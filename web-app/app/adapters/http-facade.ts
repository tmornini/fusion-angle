import {
    UnauthorizedError,
    RequestError,
    HTTP_UNAUTHORIZED,
} from '../../../shared/http-errors.ts';
import { OPERATION_ID_HEADER } from '../../../shared/message-id-fields.ts';
import { putSessionToken } from './session-token.ts';
import { runSingleFlightRefresh } from
    './session-refresh-mutex.ts';
import { navigateTo } from '../navigation.ts';
import { principalFromToken } from
    '../../../shared/access-token-decode.ts';
import { authParam } from './authentication.ts';

// Fetch transport for the server ZIP. Same RequestContext
// verbs as the in-page facade, over real HTTP. No import of
// api/api.ts — that graph stays out of the server client.
// The caller supplies operation-id. This facade does not
// mint one and does not send request-id. A 401
// single-flights a cookie refresh POST carrying that id,
// retries once, and bounces to /auth if the refresh fails.

export interface HttpFacade {
    GET<T>(
        resource: string,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<T>;
    GETWithEtag<T>(
        resource: string,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<{ body: T; etag: string | undefined }>;
    PUT<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<T>;
    PUTWithEtag<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<{ body: T; etag: string | undefined }>;
    PATCH<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<T>;
    PATCHWithEtag<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<{ body: T; etag: string | undefined }>;
    DELETE(
        resource: string,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<void>;
    POST<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<T>;
    postForHeaders(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?:
            readonly (readonly [string, string])[],
    ): Promise<{
        readonly status: number;
        readonly headers: Headers;
        readonly body: string;
    }>;
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

function isCredentialDoor(
    resource: string,
): boolean {
    return resource === 'authentication/authorize'
        || resource === 'authentication/token';
}

function organizationToRestore(
    deadToken: string,
): string | undefined {
    try {
        const principal =
            principalFromToken(deadToken);
        return principal.organization
            ?? principal.organizations?.[0];
    } catch {
        return undefined;
    }
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
    contentType: boolean,
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
    if (extra !== undefined) {
        for (const [name, value] of extra) {
            headers.set(name, value);
        }
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
        payload: Record<string, unknown> | undefined,
        extra: readonly (readonly [string, string])[]
            | undefined,
    ): Promise<Response> {
        return fetch(origin + '/api/' + resource, {
            method,
            credentials: 'same-origin',
            headers: requestHeaders(
                token,
                payload !== undefined,
                extra,
            ),
            ...(payload !== undefined
                ? { body: JSON.stringify(payload) }
                : {}),
        });
    }

    async function postCookieRefresh(
        operationId: string | undefined,
    ): Promise<string | null> {
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        if (operationId !== undefined) {
            headers.set(OPERATION_ID_HEADER, operationId);
        }
        const response = await fetch(
            origin + '/api/authentication/token', {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({
                    grant_type: 'refresh',
                }),
            },
        );
        await response.text();
        if (!response.ok) return null;
        return authParam(
            response.headers.get('authentication-info'),
            'access_token',
        );
    }

    async function postOrganizationExchange(
        flat: string,
        organization: string,
        operationId: string | undefined,
    ): Promise<string | null> {
        const headers = new Headers();
        headers.set(
            'Content-Type', 'application/json',
        );
        headers.set(
            'Authorization', 'Bearer ' + flat,
        );
        if (operationId !== undefined) {
            headers.set(OPERATION_ID_HEADER, operationId);
        }
        const response = await fetch(
            origin + '/api/authentication/token', {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({
                    grant_type: 'token-exchange',
                    organization,
                }),
            },
        );
        await response.text();
        if (!response.ok) return null;
        return authParam(
            response.headers.get('authentication-info'),
            'access_token',
        );
    }

    async function refreshAndScope(
        deadToken: string,
        operationId: string | undefined,
    ): Promise<string | null> {
        const flat = await postCookieRefresh(operationId);
        if (flat === null) return null;
        const organization =
            organizationToRestore(deadToken);
        if (organization === undefined) {
            return flat;
        }
        return await postOrganizationExchange(
            flat, organization, operationId,
        ) ?? flat;
    }

    async function exchangeOnce(
        method: string,
        resource: string,
        token: string,
        payload: Record<string, unknown> | undefined,
        extra: readonly (readonly [string, string])[]
            | undefined,
    ): Promise<Response> {
        const first = await exchange(
            method, resource, token, payload, extra,
        );
        if (first.status !== HTTP_UNAUTHORIZED) {
            return first;
        }
        if (isCredentialDoor(resource)) {
            return first;
        }
        let operationId: string | undefined;
        if (extra !== undefined) {
            for (const [name, value] of extra) {
                if (name.toLowerCase()
                    === OPERATION_ID_HEADER) {
                    operationId = value;
                    break;
                }
            }
        }
        const access = await runSingleFlightRefresh(
            () => refreshAndScope(token, operationId),
        );
        if (access === null) {
            navigateTo('auth');
            return first;
        }
        putSessionToken(access);
        return exchange(
            method, resource, access, payload, extra,
        );
    }

    const facade: HttpFacade = {
        GET: async (resource, token, headerFields) =>
            unwrapResponse(
                await exchangeOnce(
                    'GET', resource, token,
                    undefined, headerFields,
                ),
            ),
        GETWithEtag: async (
            resource, token, headerFields,
        ) => {
            const response = await exchangeOnce(
                'GET', resource, token,
                undefined, headerFields,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        PUT: async (
            resource, payload, token, headerFields,
        ) => unwrapResponse(
            await exchangeOnce(
                'PUT', resource, token,
                payload, headerFields,
            ),
        ),
        PUTWithEtag: async (
            resource, payload, token, headerFields,
        ) => {
            const response = await exchangeOnce(
                'PUT', resource, token,
                payload, headerFields,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        PATCH: async (
            resource, payload, token, headerFields,
        ) => unwrapResponse(
            await exchangeOnce(
                'PATCH', resource, token,
                payload, headerFields,
            ),
        ),
        PATCHWithEtag: async (
            resource, payload, token, headerFields,
        ) => {
            const response = await exchangeOnce(
                'PATCH', resource, token,
                payload, headerFields,
            );
            return {
                body: await unwrapResponse(response),
                etag: etagFromHeader(response),
            };
        },
        DELETE: async (
            resource, token, headerFields,
        ) => {
            await unwrapResponse(
                await exchangeOnce(
                    'DELETE', resource, token,
                    undefined, headerFields,
                ),
            );
        },
        POST: async (
            resource, payload, token, headerFields,
        ) => unwrapResponse(
            await exchangeOnce(
                'POST', resource, token,
                payload, headerFields,
            ),
        ),
        postForHeaders: async (
            resource, payload, token, headerFields,
        ) => {
            const response = await exchange(
                'POST', resource, token,
                payload, headerFields,
            );
            return {
                status: response.status,
                headers: response.headers,
                body: await response.text(),
            };
        },
    };
    return facade;
}
