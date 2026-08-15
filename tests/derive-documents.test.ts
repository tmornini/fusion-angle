import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    documentPairsAt,
    deriveDocumentsAt,
} from '../api/derive-documents.ts';
import { formWritePair } from '../api/message-pair.ts';
import type { RequestEntity, ResponseEntity } from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// A stored request/response row pair for a given method, built
// through the SAME formWritePair every live write uses — never
// hand-assembled JSON — so the fixture's message shape stays
// truthful to what appendMessagePair actually persists.
async function storedPairAt(
    method: string,
    status: number,
): Promise<{
    readonly request: RequestEntity;
    readonly response: ResponseEntity;
}> {
    const pair = await formWritePair({
        method,
        pathname: '/ideas/doc-1',
        routePattern: 'ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', 'doc-1'],
        headerFields: [],
        body: { a: 1 },
        requesterIdentityId: 'current',
        requestAt: AT,
        organization: '1',
        responseStatus: status,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    return {
        request: {
            id: pair.id,
            uri_collection: pair.uriCollection,
            uri_id: pair.uriId,
            at: AT,
            requester_identity_id: pair.requesterIdentityId,
            message_hash: pair.requestHash,
            message: pair.requestMessage,
            method: pair.method,
            operation_id: pair.operationId,
        },
        response: {
            id: pair.id,
            uri_collection: pair.uriCollection,
            uri_id: pair.uriId,
            at: AT,
            version: pair.responseEtag,
            message: pair.responseMessage,
            operation_id: pair.operationId,
        },
    };
}

// design decision 6: a document-address pair's method decides
// whether it is a DOCUMENT (PUT/DELETE) or an OPERATION (POST,
// e.g. a create-shaped genesis pair sharing the document's own
// address). No-op for ideas/projects today (neither ever POSTs
// at its own document address); load-bearing once a family's
// create pair shares the document address (flows).

test('documentPairsAt excludes a POST pair at a document'
+ ' address', async () => {
    const { request, response } = await storedPairAt('POST', 200);
    const pairs = documentPairsAt(
        [request], [response], '/organizations/1/ideas/',
    );
    assert.equal(pairs.length, 0);
});

test('documentPairsAt includes a PUT pair at a document'
+ ' address', async () => {
    const { request, response } = await storedPairAt('PUT', 200);
    const pairs = documentPairsAt(
        [request], [response], '/organizations/1/ideas/',
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]!.method, 'PUT');
});

test('documentPairsAt includes a DELETE pair at a document'
+ ' address', async () => {
    const { request, response } = await storedPairAt(
        'DELETE', 204,
    );
    const pairs = documentPairsAt(
        [request], [response], '/organizations/1/ideas/',
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]!.method, 'DELETE');
});

test('deriveDocumentsAt never sees a POST-only address',
async () => {
    const { request, response } = await storedPairAt('POST', 200);
    const documents = deriveDocumentsAt(
        [request], [response], '/organizations/1/ideas/',
    );
    assert.equal(documents.size, 0);
});
