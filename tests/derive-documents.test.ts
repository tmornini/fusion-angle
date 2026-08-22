import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    documentPairsAt,
    deriveDocumentsAt,
} from '../api/derive-documents.ts';
import { formWritePair } from '../api/message-pair.ts';
import type {
    PairEntity,
} from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// A stored pair for a given method, built through the SAME
// formWritePair every live write uses — never hand-assembled
// JSON — so the fixture's message shape stays truthful to
// what appendMessagePair actually persists.
async function storedPairAt(
    method: string,
    status: number,
): Promise<PairEntity> {
    const pair = await formWritePair({
        method,
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw',
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', 'XufQcWIKhZshfJYOVNeUSw'],
        headerFields: [],
        body: { a: 1 },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: AT,
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: status,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    return {
        id: pair.id,
        uri_collection: pair.uriCollection,
        uri_id: pair.uriId,
        requester_identity_id: pair.requesterIdentityId,
        method: pair.method,
        request_at: AT,
        request_hash: pair.requestHash,
        request: pair.requestMessage,
        response_at: AT,
        version: pair.responseEtag,
        response: pair.responseMessage,
        operation_id: pair.operationId,
    };
}

// design decision 6: a document-address pair's method decides
// whether it is a DOCUMENT (PUT/DELETE) or an OPERATION (POST,
// e.g. a create-shaped genesis pair sharing the document's own
// address). No-op for organizations/AjdvjuECVZEgZoFajaIEkg/ideas/projects
// today
// (neither ever POSTs at its own document address);
// load-bearing once a family's create pair shares the
// document address (flows).

test('2-arg documentPairsAt decodes a PUT pair',
async () => {
    const pair = await storedPairAt('PUT', 200);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const fromOne = documentPairsAt([pair], prefix);
    assert.equal(fromOne.length, 1);
    assert.equal(fromOne[0]!.method, 'PUT');
    assert.equal(fromOne[0]!.at, pair.response_at);
});

test('documentPairsAt excludes a POST pair at a document'
+ ' address', async () => {
    const pair = await storedPairAt('POST', 200);
    const pairs = documentPairsAt(
        [pair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(pairs.length, 0);
});

test('documentPairsAt includes a PUT pair at a document'
+ ' address', async () => {
    const pair = await storedPairAt('PUT', 200);
    const pairs = documentPairsAt(
        [pair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]!.method, 'PUT');
});

test('documentPairsAt includes a DELETE pair at a document'
+ ' address', async () => {
    const pair = await storedPairAt(
        'DELETE', 204,
    );
    const pairs = documentPairsAt(
        [pair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]!.method, 'DELETE');
});

test('deriveDocumentsAt never sees a POST-only address',
async () => {
    const pair = await storedPairAt('POST', 200);
    const documents = deriveDocumentsAt(
        [pair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(documents.size, 0);
});
