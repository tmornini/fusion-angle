import {
    handleRequest,
    type ClientFacadeAdapter,
} from '../api/api.ts';
import {
    createHttpFacade,
    type HeaderFields,
    type HttpFacade,
    type HttpTransport,
    type TransportClient,
} from '../client/http-facade.ts';
import type { Client } from '../client/create-client.ts';
import type { RequestContext } from '../client/request-context.ts';
import { createAppClient } from '../web-app/app/client.ts';

// Test wrap: the real transport over a fetch that reaches
// handleRequest in-process. Product boot uses the browser's
// fetch; this stays off the server-core graph.

export const IN_PROCESS_ORIGIN = 'http://localhost';
const API_MOUNT = '/api';

// What the server and the browser would do around
// handleRequest: the adapter's simulated latency, once per
// request; the /api mount stripped
// (server/http-server.ts:111-117); and the body framed with
// the content-length a browser sends.
export function inProcessFetch(
    adapter: ClientFacadeAdapter,
): typeof fetch {
    return async (input, init) => {
        await adapter.simulateLatency();
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (!url.pathname.startsWith(API_MOUNT + '/')) {
            throw new Error(
                'the in-process fetch reaches only the API: '
                    + url.pathname,
            );
        }
        const bytes = new Uint8Array(await request.arrayBuffer());
        const headers = new Headers(request.headers);
        if (bytes.byteLength > 0) {
            headers.set('content-length', String(bytes.byteLength));
        }
        return handleRequest(adapter, new Request(
            IN_PROCESS_ORIGIN
                + url.pathname.slice(API_MOUNT.length)
                + url.search,
            {
                method: request.method,
                headers,
                ...(bytes.byteLength > 0 ? { body: bytes } : {}),
            },
        ));
    };
}

export function wrapInPageAdapter(
    adapter: ClientFacadeAdapter,
): HttpTransport {
    return createHttpFacade(
        IN_PROCESS_ORIGIN, inProcessFetch(adapter),
    );
}

// A client over the in-process handler, with the app's
// hands.
export function inPageClient(
    adapter: ClientFacadeAdapter,
): Client {
    return createAppClient(wrapInPageAdapter(adapter));
}

// A context over the in-process handler, for a test that
// holds a memory adapter and a token.
export function inPageContext(
    adapter: ClientFacadeAdapter,
    token: string,
): RequestContext {
    return inPageClient(adapter).requestContext(token);
}

// A caller that holds no session: a 401 answers as it was
// answered, with no refresh to try and nowhere to go.
const NO_SESSION: TransportClient = {
    runSingleFlightRefresh: () => Promise.resolve(null),
    putSessionToken: () => {},
    navigateToAuth: () => {},
};

function facadeOver(adapter: ClientFacadeAdapter): HttpFacade {
    return wrapInPageAdapter(adapter)(NO_SESSION);
}

// The retired api/api.ts verbs' names and argument
// order, answering what the real transport answers.
export function GET<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).GET<T>(
        resource, token, headerFields,
    );
}

export function GETCollection<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).GETCollection<T>(
        resource, token, headerFields,
    );
}

export function PUT<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).PUT<T>(
        resource, payload, token, headerFields,
    );
}

export function PATCH<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).PATCH<T>(
        resource, payload, token, headerFields,
    );
}

export function POST<T>(
    adapter: ClientFacadeAdapter,
    resource: string,
    payload: Record<string, unknown>,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).POST<T>(
        resource, payload, token, headerFields,
    );
}

export function DELETE(
    adapter: ClientFacadeAdapter,
    resource: string,
    token: string,
    headerFields?: HeaderFields,
) {
    return facadeOver(adapter).DELETE(
        resource, token, headerFields,
    );
}
