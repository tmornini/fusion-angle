import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { HistoryEntityStore } from
    '../api/store-history-entity.ts';
import { backendRunner } from '../api/db.ts';
import { serializeWire } from
    '../shared/http-message/wire-codec.ts';
import { Octets } from
    '../shared/http-message/octets.ts';

interface Row {
    id: string;
    uri_collection: string;
    uri_id: string;
    response_at: string;
}

const ROWS: Row[] = [
    {
        id: 'b',
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        uri_id: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000002Z',
    },
    {
        id: 'a',
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        uri_id: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
    {
        id: 'c',
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        uri_id: 'BBjWJsjYIDkTRKIIPrzWRw',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
    {
        id: 'd',
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/',
        uri_id: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
];

test('getAddress is collection+uri_id, ordered by at,id',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['t']);
    await backend.transaction(
        ['t'], 'readwrite',
        async (tx) => {
            for (const row of ROWS) {
                await tx.put('t', row);
            }
        },
    );
    const got = await backend.transaction(
        ['t'], 'readonly',
        (tx) => tx.getAddress<Row>(
            't', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'AjdvjuECVZEgZoFajaIEkg',
        ),
    );
    assert.deepEqual(
        got.map((row) => row.id),
        ['a', 'b'],
    );
});

test('getAllAtAddress delegates to Tx.getAddress',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    const store = new HistoryEntityStore<Row>(
        'message_pairs',
        backendRunner(backend),
        (body) => body as Omit<Row, 'id'>,
    );
    await store.put('a', {
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        uri_id: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    });
    await store.put('c', {
        uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        uri_id: 'BBjWJsjYIDkTRKIIPrzWRw',
        response_at: '2026-01-01T00:00:00.000001Z',
    });
    const got = await store.getAllAtAddress(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            , 'AjdvjuECVZEgZoFajaIEkg',
    );
    assert.deepEqual(got.map((row) => row.id), ['a']);
});

function jsonWire(body: unknown): string {
    const json = JSON.stringify(body);
    return serializeWire({
        startLine: {
            kind: 'response',
            version: 'HTTP/1.1',
            status: 200,
            reason: 'OK',
        },
        fields: [
            {
                name: 'content-type',
                value: 'application/json',
            },
        ],
        body: Octets.fromLatin1(json),
        trailer: undefined,
    });
}

test('getWhereBody is collection + JSON containment',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    await backend.transaction(
        ['message_pairs'], 'readwrite',
        async (tx) => {
            await tx.put('message_pairs', {
                id: 'hit',
                uri_collection: '/authentication/authorize/',
                uri_id: '',
                response_at: '2026-01-01T00:00:00.000001Z',
                response: jsonWire({ code: 'abc' }),
            });
            await tx.put('message_pairs', {
                id: 'miss',
                uri_collection: '/authentication/authorize/',
                uri_id: '',
                response_at: '2026-01-01T00:00:00.000002Z',
                response: jsonWire({ code: 'zzz' }),
            });
            await tx.put('message_pairs', {
                id: 'other',
                uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + '',
                uri_id: 'AjdvjuECVZEgZoFajaIEkg',
                response_at: '2026-01-01T00:00:00.000001Z',
                response: jsonWire({ code: 'abc' }),
            });
        },
    );
    const got = await backend.transaction(
        ['message_pairs'], 'readonly',
        (tx) => tx.getWhereBody(
            'message_pairs',
            '/authentication/authorize/',
            { code: 'abc' },
        ),
    );
    assert.deepEqual(got.map((row) => row.id), ['hit']);
});

test('memory getWhere refuses uri_id', async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    await assert.rejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs', 'uri_id', 'AjdvjuECVZEgZoFajaIEkg',
            ),
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message
                === 'getWhere does not accept uri_id',
    );
});

test('memory getWhere refuses operation_id',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    await assert.rejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs', 'operation_id', 'x',
            ),
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message
                === 'getWhere does not accept'
                + ' operation_id',
    );
});
