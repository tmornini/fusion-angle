import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    documentMessagePairsAt,
    deriveDocumentsAt,
} from '../api/derive-documents.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import type {
    MessagePairEntity,
} from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// A stored pair for a given method, built through the SAME
// formWriteMessagePair every live write uses — never
// hand-assembled JSON — so the fixture's message shape stays
// truthful to what appendMessagePair actually persists.
async function storedMessagePairAt(
    method: string,
    status: number,
): Promise<MessagePairEntity> {
    const messagePair = await formWriteMessagePair({
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
        id: messagePair.id,
        uri_collection: messagePair.uriCollection,
        uri_id: messagePair.uriId,
        requester_identity_id: messagePair.requesterIdentityId,
        method: messagePair.method,
        request_at: AT,
        request_hash: messagePair.requestHash,
        request: messagePair.requestMessage,
        response_at: AT,
        response: messagePair.responseMessage,
        operation_id: messagePair.operationId,
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

test('2-arg documentMessagePairsAt decodes a PUT pair',
async () => {
    const messagePair = await storedMessagePairAt('PUT', 200);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const fromOne = documentMessagePairsAt(
        [messagePair], prefix,
    );
    assert.equal(fromOne.length, 1);
    assert.equal(fromOne[0]!.method, 'PUT');
    assert.equal(fromOne[0]!.at, messagePair.response_at);
});

test('documentMessagePairsAt excludes a POST pair at a'
+ ' document address', async () => {
    const messagePair = await storedMessagePairAt('POST', 200);
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(messagePairs.length, 0);
});

test('documentMessagePairsAt includes a PUT pair at a'
+ ' document address', async () => {
    const messagePair = await storedMessagePairAt('PUT', 200);
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(messagePairs.length, 1);
    assert.equal(messagePairs[0]!.method, 'PUT');
});

test('documentMessagePairsAt includes a DELETE pair at a'
+ ' document address', async () => {
    const messagePair = await storedMessagePairAt(
        'DELETE', 204,
    );
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(messagePairs.length, 1);
    assert.equal(messagePairs[0]!.method, 'DELETE');
});

test('deriveDocumentsAt never sees a POST-only address',
async () => {
    const messagePair = await storedMessagePairAt('POST', 200);
    const documents = deriveDocumentsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(documents.size, 0);
});
