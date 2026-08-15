import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';
import {
    appendMessagePair,
    formWritePair,
} from '../api/message-pair.ts';
import { messageStore } from '../api/message-store.ts';

const COLLECTION = '/organizations/1/ideas/';

let requestSeq = 0;

function nextRequestAt(): string {
    requestSeq += 1;
    return '2026-01-01T00:00:00.'
        + String(requestSeq).padStart(6, '0')
        + 'Z';
}

async function writePair(
    db: MemoryDbAdapter,
    input: {
        readonly method: string;
        readonly uriId: string;
        readonly responseBody?: unknown;
    },
): Promise<{ id: string; version: string }> {
    const deleted = input.method === 'DELETE';
    const pair = await formWritePair({
        method: input.method,
        pathname: '/ideas/' + input.uriId,
        routePattern: 'ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', input.uriId],
        headerFields: [],
        body: { title: input.uriId },
        requesterIdentityId: 'current',
        requestAt: nextRequestAt(),
        organization: '1',
        responseStatus: deleted ? 204 : 200,
        responseBody: deleted
            ? undefined
            : input.responseBody,
        operationId: generateCryptoSafeBase62(),
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return {
        id: pair.id,
        version: pair.responseEtag,
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

test('get returns the live PUT and ignores POST',
async () => {
    const db = await freshDb();
    const put = await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 1 },
    });
    await writePair(db, {
        method: 'POST',
        uriId: 'doc-1',
        responseBody: { n: 2 },
    });
    const got = await messageStore(db).get(
        COLLECTION, 'doc-1',
    );
    assert.equal(got?.id, put.id);
});

test('get returns undefined when head is DELETE',
async () => {
    const db = await freshDb();
    await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 1 },
    });
    await writePair(db, {
        method: 'DELETE',
        uriId: 'doc-1',
    });
    const got = await messageStore(db).get(
        COLLECTION, 'doc-1',
    );
    assert.equal(got, undefined);
});

test('getCollection is oldest live head first',
async () => {
    const db = await freshDb();
    await writePair(db, {
        method: 'PUT',
        uriId: 'doc-a',
        responseBody: { name: 'a' },
    });
    await writePair(db, {
        method: 'PUT',
        uriId: 'doc-b',
        responseBody: { name: 'b' },
    });
    const rows = await messageStore(db).getCollection(
        COLLECTION,
    );
    assert.deepEqual(rows, [
        { name: 'a' },
        { name: 'b' },
    ]);
});

test('getByVersion returns the matching revision',
async () => {
    const db = await freshDb();
    const first = await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 1 },
    });
    await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 2 },
    });
    const got = await messageStore(db).getByVersion(
        COLLECTION, 'doc-1', first.version,
    );
    assert.equal(got?.id, first.id);
});

test('getByVersion with N matches uses latest at,id',
async () => {
    const db = await freshDb();
    const first = await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 1 },
    });
    const second = await writePair(db, {
        method: 'PUT',
        uriId: 'doc-1',
        responseBody: { n: 1 },
    });
    assert.equal(first.version, second.version);
    const got = await messageStore(db).getByVersion(
        COLLECTION, 'doc-1', first.version,
    );
    assert.equal(got?.id, second.id);
});
