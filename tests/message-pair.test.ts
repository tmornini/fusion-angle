import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { requestMessageHash } from '../api/message-form.ts';
import {
    formWritePair,
    headPairIdAt,
    storedResponseFor,
    appendMessagePair,
} from '../api/message-pair.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const INPUT = {
    method: 'PUT',
    pathname: '/ideas/42',
    routePattern: 'ideas/:id',
    routeSegments: ['ideas', ':id'],
    pathSegments: ['ideas', '42'],
    headerFields: [],
    body: { title: 'T', at: '2026-01-02T03:04:05.000111Z' },
    requesterIdentityId: 'current',
    requestAt: '2026-01-01T00:00:00.000000Z',
    organization: '1',
    responseStatus: 204,
    responseBody: undefined,
    operationId: TEST_OPERATION_ID,
} as const;

test('an org-owned pair stores at the org-nested prefix',
async () => {
    const pair = await formWritePair({ ...INPUT });
    assert.equal(
        pair.uriCollection, '/organizations/1/ideas/',
    );
});

test('a global-plane pair keeps its flat prefix',
async () => {
    const pair = await formWritePair({
        ...INPUT,
        pathname: '/identities/ada/pii',
        routePattern: 'identities/:id/pii',
        routeSegments: ['identities', ':id', 'pii'],
        pathSegments: ['identities', 'ada', 'pii'],
        organization: '1',
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        pair.uriCollection, '/identities/ada/pii/',
    );
});

test('nested attribute pattern stores under type attributes',
async () => {
    const typeId = 'rec01CustProfRec0rdAB1';
    const pair = await formWritePair({
        ...INPUT,
        pathname: '/organizations/1/record-types/'
            + typeId + '/attributes/ra1',
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id/attributes/:attribute-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
            'attributes', ':attribute-id',
        ],
        pathSegments: [
            'organizations', '1',
            'record-types', typeId,
            'attributes', 'ra1',
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
        pair.uriCollection,
        '/organizations/1/record-types/'
        + typeId + '/attributes/',
    );
});

test('nested record-type detail stores at type prefix',
async () => {
    const pair = await formWritePair({
        ...INPUT,
        pathname: '/organizations/1/record-types/r1',
        routePattern:
            'organizations/:organization-id/record-types/'
            + ':record-type-id',
        routeSegments: [
            'organizations', ':organization-id',
            'record-types', ':record-type-id',
        ],
        pathSegments: [
            'organizations', '1',
            'record-types', 'r1',
        ],
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        pair.uriCollection,
        '/organizations/1/record-types/',
    );
});

test('a formed pair binds request and response by one id',
async () => {
    const pair = await formWritePair({ ...INPUT });
    assert.equal(
        pair.uriCollection, '/organizations/1/ideas/',
    );
    assert.equal(pair.uriId, '42');
    assert.equal(
        pair.requestHash,
        await requestMessageHash(pair.requestMessage),
    );
    assert.equal(
        pair.responseHash,
        await requestMessageHash(pair.responseMessage),
    );
});

test('the event at rides the body byte-exact; the arrival '
+ 'stamp passes through verbatim', async () => {
    const pair = await formWritePair({ ...INPUT });
    assert.ok(pair.requestMessage
        .includes('2026-01-02T03:04:05.000111Z'));
    assert.equal(pair.requestAt, INPUT.requestAt);
});

test('formed response has no follows or supersedes',
async () => {
    const pair = await formWritePair({
        ...INPUT,
        operationId: TEST_OPERATION_ID,
    });
    assert.equal(
        'follows' in pair, false,
    );
    assert.equal(
        'supersedes' in pair, false,
    );
    const model = parseWire(pair.responseMessage);
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
    const pair = await formWritePair({ ...INPUT });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    assert.equal(
        await headPairIdAt(
            db, '/organizations/1/ideas/', '42',
        ),
        pair.id,
    );
    const stored =
        await storedResponseFor(db, pair.requestHash);
    assert.equal(stored?.id, pair.id);
    // Early request, late response: the request row keeps
    // the arrival stamp verbatim; the response row's `at`
    // (same column name) was minted at append time,
    // strictly after arrival.
    const request = await db.requests.getById(pair.id);
    assert.equal(request.at, INPUT.requestAt);
    assert.ok(request.at < stored!.at);
});

test('a same-hash re-append writes nothing', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const pair = await formWritePair({ ...INPUT });
    const replay = { ...pair, id: 'other-uuid' };
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
            await appendMessagePair(view, replay);
        },
    );
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});
