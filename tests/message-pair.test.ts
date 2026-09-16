import { assert, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { requestMessageHash } from '../api/message-form.ts';
import {
    formWriteMessagePair,
    getPairByRequestHash,
    appendMessagePairOnce,
} from '../api/message-pair.ts';
import { messageStore } from '../api/message-store.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INPUT = {
    method: 'PUT',
    pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
    routePattern: 'organizations/:id/ideas/:id',
    routeSegments: ['ideas', ':id'],
    pathSegments: ['ideas', '42'],
    headerFields: [],
    body: { title: 'T', at: '2026-01-02T03:04:05.000111Z' },
    requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
    requestAt: '2026-01-01T00:00:00.000000Z',
    organization: 'AjdvjuECVZEgZoFajaIEkg',
    responseStatus: 204,
    responseBody: undefined,
    operationId: generateIdentifier(),
} as const;

Deno.test('an org-owned pair stores at the org-nested prefix',
async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assertStrictEquals(
        messagePair.path,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
});

Deno.test('the PII route stores at the identity\'s own path'
+ ' under the name pii', async () => {
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        pathname: '/identities/ada/pii',
        routePattern: 'identities/:id/pii',
        routeSegments: ['identities', ':id', 'pii'],
        pathSegments: ['identities', 'ada', 'pii'],
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        operationId: generateIdentifier(),
    });
    assertStrictEquals(messagePair.path, '/identities/ada/');
    assertStrictEquals(messagePair.name, 'pii');
});

Deno.test('nested attribute pattern stores under type attributes',
async () => {
    const typeId = 'sJxkGGTrPegHqFbQAkXnjw';
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + typeId + '/attributes/rWOtgTQUhMrUpjULbVdncg',
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id/attributes/:attribute-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
            'attributes', ':attribute-id',
        ],
        pathSegments: [
            'organizations', 'AjdvjuECVZEgZoFajaIEkg',
            'record-types', typeId,
            'attributes', 'rWOtgTQUhMrUpjULbVdncg',
        ],
        body: {
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: [],
        },
        operationId: generateIdentifier(),
    });
    assertStrictEquals(
        messagePair.path,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
        + typeId + '/attributes/',
    );
});

Deno.test('nested record-type detail stores at type prefix',
async () => {
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rOEPOcVMQdJiiiMuiiEhlg',
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
        ],
        pathSegments: [
            'organizations', 'AjdvjuECVZEgZoFajaIEkg',
            'record-types', 'rOEPOcVMQdJiiiMuiiEhlg',
        ],
        operationId: generateIdentifier(),
    });
    assertStrictEquals(
        messagePair.path,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/',
    );
});

Deno.test('a formed pair binds request and response by one id',
async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assertStrictEquals(
        messagePair.path,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assertStrictEquals(messagePair.name, '42');
    assertStrictEquals(
        messagePair.requestHash,
        await requestMessageHash(messagePair.requestMessage),
    );
    assertStrictEquals(
        messagePair.responseHash,
        await requestMessageHash(messagePair.responseMessage),
    );
});

Deno.test('the event at rides the body byte-exact; the arrival '
+ 'stamp passes through verbatim', async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assert(messagePair.requestMessage
        .includes('2026-01-02T03:04:05.000111Z'));
    assertStrictEquals(messagePair.requestAt, INPUT.requestAt);
});

Deno.test('formed response has no follows or supersedes',
async () => {
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        operationId: generateIdentifier(),
    });
    assertStrictEquals(
        'follows' in messagePair, false,
    );
    assertStrictEquals(
        'supersedes' in messagePair, false,
    );
    const model = parseWire(messagePair.responseMessage);
    assertStrictEquals(
        model.fields.some(
            (f) => f.name === 'follows'
                || f.name === 'supersedes',
        ),
        false,
    );
});

Deno.test('append then head-read round-trips', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const messagePair = await formWriteMessagePair({ ...INPUT });
    await db.transaction((view) => appendMessagePairOnce(view, messagePair),
    );
    assertStrictEquals(
        (await messageStore(db).getDocumentHead(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42',
        ))?.id,
        messagePair.id,
    );
    const stored =
        await getPairByRequestHash(db, messagePair.requestHash);
    assertStrictEquals(stored?.id, messagePair.id);
    // Early request, late response: the request row keeps
    // the arrival stamp verbatim; response_at was minted
    // at append time, strictly after arrival.
    const request = await db.messagePairs.getById(messagePair.id);
    assertStrictEquals(request.request_at, INPUT.requestAt);
    assert(request.request_at < stored!.response_at);
});

Deno.test('a same-hash re-append writes nothing', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const messagePair = await formWriteMessagePair({ ...INPUT });
    const replay = { ...messagePair, id: 'other-uuidAAAAAAAAAAAAw' };
    await db.transaction(async (view) => {
            await appendMessagePairOnce(view, messagePair);
            await appendMessagePairOnce(view, replay);
        },
    );
    assertStrictEquals((await db.messagePairs.getAll()).length, 1);
});
