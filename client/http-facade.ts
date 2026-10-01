import {
    UnauthorizedError,
    RequestError,
    HTTP_NO_CONTENT,
    HTTP_UNAUTHORIZED,
} from '../shared/http-errors.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import { principalFromToken } from
    '../shared/access-token-decode.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { Octets } from '../shared/http-message/octets.ts';
import { splitParts } from '../shared/http-message/multipart.ts';
import {
    HttpMessageError,
    type FieldLine,
} from '../shared/http-message/types.ts';
import { authParam } from './authentication.ts';

// Fetch transport for the server ZIP. Same RequestContext
// verbs as the in-page facade, over real HTTP. No import of
// api/api.ts — that graph stays out of the server client.
// The caller supplies operation-id. This facade does not
// mint one and does not send request-id. A 401
// single-flights a cookie refresh POST carrying that id,
// retries once, and bounces to /auth if the refresh fails.

export type HeaderFields = readonly (readonly [string, string])[];

export interface HttpFacade {
    GET<T>(
        resource: string,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
    // A collection's parts, each a document's whole
    // message; a 204 is none.
    GETCollection<T>(
        resource: string,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>[]>;
    PUT<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
    PATCH<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
    POST<T>(
        resource: string,
        payload: Record<string, unknown>,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
    DELETE<T = unknown>(
        resource: string,
        token: string,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
    POSTUnauthenticated<T>(
        resource: string,
        payload: Record<string, unknown>,
        headerFields?: HeaderFields,
    ): Promise<HttpMessage<T>>;
}

// The response whole: status, header lines, and octets.
// Fetch has removed any content coding already, so a
// coded response's content-encoding and content-length
// lines, which describe octets this message does not hold,
// are not kept. set-cookie stays one line per cookie.
async function messageOf<T>(
    response: Response,
): Promise<HttpMessage<T>> {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const coded = response.headers.has('content-encoding');
    const fields: FieldLine[] = [];
    response.headers.forEach((value, name) => {
        if (name === 'set-cookie') return;
        if (coded && (name === 'content-encoding'
            || name === 'content-length')) return;
        fields.push({ name, value });
    });
    const cookies = typeof response.headers.getSetCookie
        === 'function'
        ? response.headers.getSetCookie()
        : [];
    for (const value of cookies) {
        fields.push({ name: 'set-cookie', value });
    }
    return HttpMessage.fromModel<T>({
        startLine: {
            kind: 'response',
            version: 'HTTP/1.1',
            status: response.status,
            reason: '',
        },
        fields,
        body: bytes.byteLength > 0
            ? Octets.fromBytes(bytes)
            : undefined,
        trailer: undefined,
    });
}

// A 2xx is the message; anything else throws, its text
// the content's `error`, carrying the message it was
// answered. What a body that is not JSON does stays with
// the retries bullet.
async function answered<T>(
    response: Response,
): Promise<HttpMessage<T>> {
    const message = await messageOf<T>(response);
    if (response.ok) return message;
    const error = message.query('body.error').toText();
    if (response.status === HTTP_UNAUTHORIZED) {
        throw new UnauthorizedError(error, message);
    }
    throw new RequestError(
        `${error} (${response.url})`,
        response.status,
        message,
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

// What the transport's own 401 layer asks of the client
// that binds it: the client's refresh flight and its
// bearer.
export interface TransportClient {
    runSingleFlightRefresh(
        refresh: () => Promise<string | null>,
    ): Promise<string | null>;
    putSessionToken(token: string): void;
    navigateToAuth(): void;
}

// A transport before its client binds it. The client hands
// in its session once, at construction; the facade it gets
// back belongs to that client alone.
export type HttpTransport = (
    client: TransportClient,
) => HttpFacade;

export function createHttpFacade(
    origin: string,
    fetch: typeof globalThis.fetch,
): HttpTransport {
    return (client) => {
        // Bound once as a local, then called with no
        // receiver. A property call (`deps.fetch(url)`)
        // hands Chrome's `fetch` a receiver and throws
        // "Illegal invocation" (Review Focus 1).
        const send = fetch;

        function exchange(
            method: string,
            resource: string,
            token: string,
            payload: Record<string, unknown> | undefined,
            extra: readonly (readonly [string, string])[]
                | undefined,
        ): Promise<Response> {
            return send(origin + '/api/' + resource, {
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
            const response = await exchange(
                'POST', 'authentication/token', '',
                { grant_type: 'refresh' },
                operationId === undefined
                    ? undefined
                    : [[OPERATION_ID_HEADER, operationId]],
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
            const response = await exchange(
                'POST', 'authentication/token', flat,
                { grant_type: 'token-exchange', organization },
                operationId === undefined
                    ? undefined
                    : [[OPERATION_ID_HEADER, operationId]],
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
            const access = await client.runSingleFlightRefresh(
                () => refreshAndScope(token, operationId),
            );
            if (access === null) {
                client.navigateToAuth();
                return first;
            }
            client.putSessionToken(access);
            return exchange(
                method, resource, access, payload, extra,
            );
        }

        const facade: HttpFacade = {
            GET: async (resource, token, headerFields) =>
                answered(await exchangeOnce(
                    'GET', resource, token,
                    undefined, headerFields,
                )),
            // The boundary is read from the raw line: the
            // structured parser would take its leading digit
            // for a number. The body is split as Latin-1, one
            // char per octet, so a part's content-length
            // counts what it framed.
            GETCollection: async <T>(
                resource: string,
                token: string,
                headerFields?: HeaderFields,
            ): Promise<HttpMessage<T>[]> => {
                const response = await exchangeOnce(
                    'GET', resource, token,
                    undefined, headerFields,
                );
                const type = response.headers.get(
                    'content-type',
                );
                const message = await answered(response);
                if (response.status === HTTP_NO_CONTENT) {
                    return [];
                }
                if (type === null) {
                    throw new HttpMessageError(
                        'a collection answer has no content-type',
                    );
                }
                return splitParts(
                    type,
                    Octets.fromBytes(message.body().toBytes())
                        .toLatin1(),
                ).map((part) => HttpMessage.fromWire<T>(part));
            },
            PUT: async (resource, payload, token, headerFields) =>
                answered(await exchangeOnce(
                    'PUT', resource, token,
                    payload, headerFields,
                )),
            PATCH: async (resource, payload, token, headerFields) =>
                answered(await exchangeOnce(
                    'PATCH', resource, token,
                    payload, headerFields,
                )),
            POST: async (resource, payload, token, headerFields) =>
                answered(await exchangeOnce(
                    'POST', resource, token,
                    payload, headerFields,
                )),
            DELETE: async (resource, token, headerFields) =>
                answered(await exchangeOnce(
                    'DELETE', resource, token,
                    undefined, headerFields,
                )),
            POSTUnauthenticated: async (
                resource, payload, headerFields,
            ) => messageOf(await exchange(
                'POST', resource, '', payload, headerFields,
            )),
        };
        return facade;
    };
}
