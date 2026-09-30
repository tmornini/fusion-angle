import { assertStrictEquals } from '@std/assert';
import {
    documentMessagePairsAt,
    deriveDocumentsAt,
} from '../api/derive-documents.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import type {
    MessagePairEntity,
} from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { ledgerFields } from './ledger-row.ts';

const AT = '2026-01-01T00:00:00.000000Z';

// A stored pair for a given method, built through the SAME
// formWriteMessagePair every live write uses — never
// hand-assembled JSON — so the fixture's message shape stays
// truthful to what appendMessagePairOnce actually persists.
async function storedMessagePairAt(
    method: string,
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    return {
        id: messagePair.id,
        ...await ledgerFields({
            id: messagePair.id,
            path: messagePair.path,
            name: messagePair.name,
            requester_identity_id:
                messagePair.requesterIdentityId,
            method: messagePair.method,
            response_at: AT,
            request: messagePair.requestMessage,
            response: messagePair.responseMessage,
            operation_id: messagePair.operationId,
        }),
    };
}

// design decision 6: a document pair's method decides
// whether it is a DOCUMENT (PUT/DELETE) or an OPERATION (POST,
// e.g. a create-shaped genesis pair sharing the document's own
// document). No-op for organizations/AjdvjuECVZEgZoFajaIEkg/ideas/projects
// today
// (neither ever POSTs at its own document);
// load-bearing once a family's create pair shares the
// document (flows).

Deno.test('2-arg documentMessagePairsAt decodes a PUT pair',
async () => {
    const messagePair = await storedMessagePairAt('PUT');
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const fromOne = documentMessagePairsAt(
        [messagePair], prefix,
    );
    assertStrictEquals(fromOne.length, 1);
    assertStrictEquals(fromOne[0]!.method, 'PUT');
    assertStrictEquals(fromOne[0]!.at, messagePair.response_at);
});

Deno.test('documentMessagePairsAt excludes a POST pair at a'
+ ' document', async () => {
    const messagePair = await storedMessagePairAt('POST');
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assertStrictEquals(messagePairs.length, 0);
});

Deno.test('documentMessagePairsAt includes a PUT pair at a'
+ ' document', async () => {
    const messagePair = await storedMessagePairAt('PUT');
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assertStrictEquals(messagePairs.length, 1);
    assertStrictEquals(messagePairs[0]!.method, 'PUT');
});

Deno.test('documentMessagePairsAt includes a DELETE pair at a'
+ ' document', async () => {
    const messagePair = await storedMessagePairAt(
        'DELETE',
    );
    const messagePairs = documentMessagePairsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assertStrictEquals(messagePairs.length, 1);
    assertStrictEquals(messagePairs[0]!.method, 'DELETE');
});

Deno.test('deriveDocumentsAt never sees a POST-only document',
async () => {
    const messagePair = await storedMessagePairAt('POST');
    const documents = deriveDocumentsAt(
        [messagePair],
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assertStrictEquals(documents.size, 0);
});
