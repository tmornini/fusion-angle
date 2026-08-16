import {
    GET as httpGet,
    GETWithEtag as httpGetWithEtag,
    PUT as httpPut,
    PUTWithEtag as httpPutWithEtag,
    PATCH as httpPatch,
    PATCHWithEtag as httpPatchWithEtag,
    DELETE as httpDelete,
    POST as httpPost,
    type ClientFacadeAdapter,
} from '../api/api.ts';
import type { HttpFacade } from
    '../web-app/app/adapters/http-facade.ts';
import { registerInPageWrap } from
    '../web-app/app/adapters/facade-holder.ts';

// Test wrap: in-process handleRequest verbs as HttpFacade.
// Product boot uses the fetch facade; this stays off the
// server-core graph.

export function wrapInPageAdapter(
    adapter: ClientFacadeAdapter,
): HttpFacade {
    return {
        GET: (resource, token, requestId) =>
            httpGet(adapter, resource, token, requestId),
        GETWithEtag: (resource, token, requestId) =>
            httpGetWithEtag(
                adapter, resource, token, requestId,
            ),
        PUT: (
            resource, payload, token,
            headerFields, requestId,
        ) => httpPut(
            adapter, resource, payload, token,
            headerFields, requestId,
        ),
        PUTWithEtag: (
            resource, payload, token,
            headerFields, requestId,
        ) => httpPutWithEtag(
            adapter, resource, payload, token,
            headerFields, requestId,
        ),
        PATCH: (
            resource, payload, token,
            headerFields, requestId,
        ) => httpPatch(
            adapter, resource, payload, token,
            headerFields, requestId,
        ),
        PATCHWithEtag: (
            resource, payload, token,
            headerFields, requestId,
        ) => httpPatchWithEtag(
            adapter, resource, payload, token,
            headerFields, requestId,
        ),
        DELETE: (
            resource, token, requestId, headerFields,
        ) => httpDelete(
            adapter, resource, token, requestId,
            headerFields,
        ),
        POST: (
            resource, payload, token,
            requestId, headerFields,
        ) => httpPost(
            adapter, resource, payload, token,
            requestId, headerFields,
        ),
    };
}

registerInPageWrap(adapter => wrapInPageAdapter(
    adapter as ClientFacadeAdapter,
));
