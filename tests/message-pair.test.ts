import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { requestMessageHash } from '../api/message-form.ts';
import {
    formWriteMessagePair,
    headMessagePairIdAt,
    storedResponseFor,
    appendMessagePair,
} from '../api/message-pair.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

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
    operationId: TEST_OPERATION_ID,
} as const;

test('an org-owned pair stores at the org-nested prefix',
async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assert.equal(
        messagePair.uriCollection,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
});

test('a global-plane pair keeps its flat prefix',
async () => {
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        pathname: '/identities/ada/pii',
        routePattern: 'identities/:id/pii',
        routeSegments: ['identities', ':id', 'pii'],
        pathSegments: ['identities', 'ada', 'pii'],
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        messagePair.uriCollection, '/identities/ada/pii/',
    );
});

test('nested attribute pattern stores under type attributes',
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
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        messagePair.uriCollection,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
        + typeId + '/attributes/',
    );
});

test('nested record-type detail stores at type prefix',
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
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        messagePair.uriCollection,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/',
    );
});

test('a formed pair binds request and response by one id',
async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assert.equal(
        messagePair.uriCollection,
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    );
    assert.equal(messagePair.uriId, '42');
    assert.equal(
        messagePair.requestHash,
        await requestMessageHash(messagePair.requestMessage),
    );
    assert.equal(
        messagePair.responseHash,
        await requestMessageHash(messagePair.responseMessage),
    );
});

test('the event at rides the body byte-exact; the arrival '
+ 'stamp passes through verbatim', async () => {
    const messagePair = await formWriteMessagePair({ ...INPUT });
    assert.ok(messagePair.requestMessage
        .includes('2026-01-02T03:04:05.000111Z'));
    assert.equal(messagePair.requestAt, INPUT.requestAt);
});

test('formed response has no follows or supersedes',
async () => {
    const messagePair = await formWriteMessagePair({
        ...INPUT,
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        'follows' in messagePair, false,
    );
    assert.equal(
        'supersedes' in messagePair, false,
    );
    const model = parseWire(messagePair.responseMessage);
    assert.equal(
        model.fields.some(
            (f) => f.name === 'follows'
                || f.name === 'supersedes',
        ),
        false,
    );
});

test('append then head-read round-trips', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const messagePair = await formWriteMessagePair({ ...INPUT });
    await db.transaction(
        MESSAGE_TABLES,
        (view) => appendMessagePair(view, messagePair),
    );
    assert.equal(
        await headMessagePairIdAt(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42',
        ),
        messagePair.id,
    );
    const stored =
        await storedResponseFor(db, messagePair.requestHash);
    assert.equal(stored?.id, messagePair.id);
    // Early request, late response: the request row keeps
    // the arrival stamp verbatim; response_at was minted
    // at append time, strictly after arrival.
    const request = await db.messagePairs.getById(messagePair.id);
    assert.equal(request.request_at, INPUT.requestAt);
    assert.ok(request.request_at < stored!.response_at);
});

test('a same-hash re-append writes nothing', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const messagePair = await formWriteMessagePair({ ...INPUT });
    const replay = { ...messagePair, id: 'other-uuidAAAAAAAAAAAAw' };
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            await appendMessagePair(view, messagePair);
            await appendMessagePair(view, replay);
        },
    );
    assert.equal((await db.messagePairs.getAll()).length, 1);
});
