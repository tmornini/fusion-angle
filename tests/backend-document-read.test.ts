import {
    assertEquals,
} from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { HistoryEntityStore } from
    '../api/store-history-entity.ts';
import { backendRunner } from '../api/db.ts';

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
    await backend.ensureTable();
    await backend.transaction('readwrite',
        async (tx) => {
            for (const row of ROWS) {
                await tx.append(row);
            }
        },
    );
    const got = await backend.transaction('readonly',
        (tx) => tx.getDocumentHistory<Row>(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'AjdvjuECVZEgZoFajaIEkg',
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
    await backend.ensureTable();
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
