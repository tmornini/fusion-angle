import {
    assertEquals,
} from '@std/assert';
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
    path: string;
    name: string;
    response_at: string;
}

const ROWS: Row[] = [
    {
        id: 'b',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000002Z',
    },
    {
        id: 'a',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
    {
        id: 'c',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: 'BBjWJsjYIDkTRKIIPrzWRw',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
    {
        id: 'd',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/',
        name: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    },
];

Deno.test(
    'getDocumentHistory is path+name, ordered by at,id',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['t']);
    await backend.transaction(
        ['t'], 'readwrite',
        async (tx) => {
            for (const row of ROWS) {
                await tx.append('t', row);
            }
        },
    );
    const got = await backend.transaction(
        ['t'], 'readonly',
        (tx) => tx.getDocumentHistory<Row>(
            't', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'AjdvjuECVZEgZoFajaIEkg',
        ),
    );
    assertEquals(
        got.map((row) => row.id),
        ['a', 'b'],
    );
});

Deno.test(
    'getDocumentHistory delegates to Tx.getDocumentHistory',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    const store = new HistoryEntityStore<Row>(
        'message_pairs',
        backendRunner(backend),
        (body) => body as Omit<Row, 'id'>,
    );
    await store.append('a', {
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: 'AjdvjuECVZEgZoFajaIEkg',
        response_at: '2026-01-01T00:00:00.000001Z',
    });
    await store.append('c', {
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: 'BBjWJsjYIDkTRKIIPrzWRw',
        response_at: '2026-01-01T00:00:00.000001Z',
    });
    const got = await store.getDocumentHistory(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            , 'AjdvjuECVZEgZoFajaIEkg',
    );
    assertEquals(got.map((row) => row.id), ['a']);
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

Deno.test('getWhereBody is collection + JSON containment',
async () => {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['message_pairs']);
    await backend.transaction(
        ['message_pairs'], 'readwrite',
        async (tx) => {
            await tx.append('message_pairs', {
                id: 'hit',
                path: '/authentication/authorize/',
                name: '',
                response_at: '2026-01-01T00:00:00.000001Z',
                response: jsonWire({ code: 'abc' }),
            });
            await tx.append('message_pairs', {
                id: 'miss',
                path: '/authentication/authorize/',
                name: '',
                response_at: '2026-01-01T00:00:00.000002Z',
                response: jsonWire({ code: 'zzz' }),
            });
            await tx.append('message_pairs', {
                id: 'other',
                path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + '',
                name: 'AjdvjuECVZEgZoFajaIEkg',
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
    assertEquals(got.map((row) => row.id), ['hit']);
});
