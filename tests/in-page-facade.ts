import {
    handleRequest,
    type ClientFacadeAdapter,
} from '../api/api.ts';
import {
    createHttpFacade,
    type HttpTransport,
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
