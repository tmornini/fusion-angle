import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    appendMessagePairOnce,
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { messageStore } from '../api/message-store.ts';

const COLLECTION = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';

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
        readonly name: string;
        readonly responseBody?: unknown;
    },
): Promise<{ id: string }> {
    const deleted = input.method === 'DELETE';
    const messagePair = await formWriteMessagePair({
        method: input.method,
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + input.name,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: ['ideas', ':id'],
        pathSegments: ['ideas', input.name],
        headerFields: [],
        body: { title: input.name },
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: nextRequestAt(),
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: deleted ? 204 : 200,
        responseBody: deleted
            ? undefined
            : input.responseBody,
        operationId: generateIdentifier(),
    });
    await db.transaction((view) => appendMessagePairOnce(view, messagePair),
    );
    return {
        id: messagePair.id,
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

Deno.test('getDocumentHead returns the live PUT and ignores POST',
async () => {
    const db = await freshDb();
    const put = await writePair(db, {
        method: 'PUT',
        name: 'XufQcWIKhZshfJYOVNeUSw',
        responseBody: { n: 1 },
    });
    await writePair(db, {
        method: 'POST',
        name: 'XufQcWIKhZshfJYOVNeUSw',
        responseBody: { n: 2 },
    });
    const got = await messageStore(db).getDocumentHead(
        COLLECTION, 'XufQcWIKhZshfJYOVNeUSw',
    );
    assertStrictEquals(got?.id, put.id);
});

Deno.test('getDocumentHead returns null when head is DELETE',
async () => {
    const db = await freshDb();
    await writePair(db, {
        method: 'PUT',
        name: 'XufQcWIKhZshfJYOVNeUSw',
        responseBody: { n: 1 },
    });
    await writePair(db, {
        method: 'DELETE',
        name: 'XufQcWIKhZshfJYOVNeUSw',
    });
    const got = await messageStore(db).getDocumentHead(
        COLLECTION, 'XufQcWIKhZshfJYOVNeUSw',
    );
    assertStrictEquals(got, null);
});

Deno.test('getCollection is oldest live head first',
async () => {
    const db = await freshDb();
    await writePair(db, {
        method: 'PUT',
        name: 'doc-a',
        responseBody: { name: 'a' },
    });
    await writePair(db, {
        method: 'PUT',
        name: 'doc-b',
        responseBody: { name: 'b' },
    });
    const rows = await messageStore(db).getCollection(
        COLLECTION,
    );
    assertEquals(rows, [
        { name: 'a' },
        { name: 'b' },
    ]);
});

Deno.test('seam getAllWhereBody matches one JSON fact',
async () => {
    const db = await freshDb();
    await writePair(db, {
        method: 'PUT',
        name: 'XufQcWIKhZshfJYOVNeUSw',
        responseBody: { code: 'abc', n: 1 },
    });
    await writePair(db, {
        method: 'PUT',
        name: 'YHvbnJSZHECuziaHXcsKpw',
        responseBody: { code: 'zzz', n: 2 },
    });
    const hits = await db.messagePairs.getAllWhereBody(
        COLLECTION, { code: 'abc' },
    );
    assertStrictEquals(hits.length, 1);
    assertStrictEquals(hits[0]!.name, 'XufQcWIKhZshfJYOVNeUSw');
});
