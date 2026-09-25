import {
    GET as httpGet,
    GETWithEtag as httpGetWithEtag,
    PUT as httpPut,
    PUTWithEtag as httpPutWithEtag,
    PATCH as httpPatch,
    PATCHWithEtag as httpPatchWithEtag,
    DELETE as httpDelete,
    POST as httpPost,
    postForHeaders as httpPostForHeaders,
    type ClientFacadeAdapter,
} from '../api/api.ts';
import type { HttpTransport } from
    '../client/http-facade.ts';
import type { Client } from '../client/create-client.ts';
import type { RequestContext } from '../client/shared.ts';
import { createAppClient } from '../web-app/app/client.ts';

// Test wrap: in-process handleRequest verbs as HttpFacade.
// Product boot uses the fetch facade; this stays off the
// server-core graph.

export function wrapInPageAdapter(
    adapter: ClientFacadeAdapter,
): HttpTransport {
    return () => ({
        GET: (resource, token, headerFields) =>
            httpGet(
                adapter, resource, token, headerFields,
            ),
        GETWithEtag: (resource, token, headerFields) =>
            httpGetWithEtag(
                adapter, resource, token, headerFields,
            ),
        PUT: (
            resource, payload, token, headerFields,
        ) => httpPut(
            adapter, resource, payload, token,
            headerFields,
        ),
        PUTWithEtag: (
            resource, payload, token, headerFields,
        ) => httpPutWithEtag(
            adapter, resource, payload, token,
            headerFields,
        ),
        PATCH: (
            resource, payload, token, headerFields,
        ) => httpPatch(
            adapter, resource, payload, token,
            headerFields,
        ),
        PATCHWithEtag: (
            resource, payload, token, headerFields,
        ) => httpPatchWithEtag(
            adapter, resource, payload, token,
            headerFields,
        ),
        DELETE: (resource, token, headerFields) =>
            httpDelete(
                adapter, resource, token, headerFields,
            ),
        POST: (
            resource, payload, token, headerFields,
        ) => httpPost(
            adapter, resource, payload, token,
            headerFields,
        ),
        postForHeaders: (
            resource, payload, token, headerFields,
        ) => httpPostForHeaders(
            adapter, resource, payload, token,
            headerFields,
        ),
    });
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
