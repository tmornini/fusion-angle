import { assertEquals, assertStrictEquals } from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import type { StorageBackend } from '../api/db.ts';

// `getCollectionPairs` is the keyed-read seam. On the
// memory tier it must be byte-identical to
// `getAll(table).filter` on path — same matches, same
// order.

interface Row { id: string; path: string; n: number }

const BACKENDS: {
    name: string;
    make: () => StorageBackend;
}[] = [
    {
        name: 'memory',
        make: () => new MemoryStorageBackend(),
    },
];

const SAMPLE: Row[] = [
    { id: 'a', path: '/x/', n: 1 },
    { id: 'b', path: '/y/', n: 2 },
    { id: 'c', path: '/x/', n: 3 },
];

async function seed(
    backend: StorageBackend,
    rows: Row[],
): Promise<void> {
    await backend.ensureTable();
    await backend.transaction('readwrite',
        async (tx) => {
            for (const row of rows) {
                await tx.append<Row>(row);
            }
        },
    );
}

function byIndex(
    backend: StorageBackend,
    key: string,
): Promise<Row[]> {
    return backend.transaction('readonly',
        tx => tx.getCollectionPairs<Row>(key),
    );
}

function byScan(
    backend: StorageBackend,
    key: string,
): Promise<Row[]> {
    return backend.transaction('readonly',
        async (tx) => {
            const all = await tx.getAll<Row>();
            return all.filter(r => r.path === key);
        },
    );
}

for (const { name, make } of BACKENDS) {
    Deno.test(
        `${name}: getCollectionPairs equals getAll filter`
            + ' for one',
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, '/y/');
            assertEquals(got, await byScan(backend, '/y/'));
            assertStrictEquals(got.length, 1);
        },
    );

    Deno.test(
        `${name}: getCollectionPairs keeps order across N`
            + ' matches',
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, '/x/');
            assertEquals(got, await byScan(backend, '/x/'));
            assertEquals(got.map(r => r.id), ['a', 'c']);
        },
    );

    Deno.test(
        `${name}: getCollectionPairs is empty for an`
            + ' absent key',
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, '/z/');
            assertEquals(got, await byScan(backend, '/z/'));
            assertEquals(got, []);
        },
    );

    Deno.test(
        `${name}: getCollectionPairs is empty on an empty`
            + ' table',
        async () => {
            const backend = make();
            await seed(backend, []);
            assertEquals(await byIndex(backend, '/x/'), []);
        },
    );
}
