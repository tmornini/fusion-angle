import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import type { StorageBackend } from '../api/db.ts';

// `getWhere` is the keyed-read seam. On the memory tier
// it must be byte-identical to `getAll(table).filter` on
// the indexed column — same matches, same order.

interface Row { id: string; fk: string; n: number }

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
    { id: 'a', fk: 'x', n: 1 },
    { id: 'b', fk: 'y', n: 2 },
    { id: 'c', fk: 'x', n: 3 },
];

async function seed(
    backend: StorageBackend,
    rows: Row[],
): Promise<void> {
    await backend.ensureTables(['t']);
    await backend.transaction(
        ['t'], 'readwrite',
        async (tx) => {
            for (const row of rows) {
                await tx.put<Row>('t', row);
            }
        },
    );
}

function byIndex(
    backend: StorageBackend,
    key: string,
): Promise<Row[]> {
    return backend.transaction(
        ['t'], 'readonly',
        tx => tx.getWhere<Row>('t', 'fk', key),
    );
}

function byScan(
    backend: StorageBackend,
    key: string,
): Promise<Row[]> {
    return backend.transaction(
        ['t'], 'readonly',
        async (tx) => {
            const all = await tx.getAll<Row>('t');
            return all.filter(r => r.fk === key);
        },
    );
}

for (const { name, make } of BACKENDS) {
    test(
        `${name}: getWhere equals getAll filter for one`,
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, 'y');
            assert.deepEqual(got, await byScan(backend, 'y'));
            assert.equal(got.length, 1);
        },
    );

    test(
        `${name}: getWhere keeps order across N matches`,
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, 'x');
            assert.deepEqual(got, await byScan(backend, 'x'));
            assert.deepEqual(got.map(r => r.id), ['a', 'c']);
        },
    );

    test(
        `${name}: getWhere is empty for an absent key`,
        async () => {
            const backend = make();
            await seed(backend, SAMPLE);
            const got = await byIndex(backend, 'z');
            assert.deepEqual(got, await byScan(backend, 'z'));
            assert.deepEqual(got, []);
        },
    );

    test(
        `${name}: getWhere is empty on an empty table`,
        async () => {
            const backend = make();
            await seed(backend, []);
            assert.deepEqual(await byIndex(backend, 'x'), []);
        },
    );
}
