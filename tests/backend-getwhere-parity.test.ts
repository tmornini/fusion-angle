import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { LocalStorageBackend }
    from '../api/backend-localstorage.ts';
import type { StorageBackend } from '../api/db.ts';

// `getWhere` is the keyed-read seam. On the simulated tiers
// it must be byte-identical to `getAll(table).filter` on the
// indexed column — same matches, same per-tier order. These
// tests pin that equivalence on BOTH bufferTx tiers (memory
// and localStorage). The native IDBIndex path is exercised
// only in the browser regression (TEST-PLAN.md).

interface Row { id: string; fk: string; n: number }

function installLocalStorageShim(): void {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(k: string): string | null;
            setItem(k: string, v: string): void;
            removeItem(k: string): void;
        };
    }).localStorage = {
        getItem(k) { return map.get(k) ?? null; },
        setItem(k, v) { map.set(k, v); },
        removeItem(k) { map.delete(k); },
    };
}

const BACKENDS: {
    name: string;
    make: () => StorageBackend;
}[] = [
    {
        name: 'memory',
        make: () => new MemoryStorageBackend(),
    },
    {
        name: 'localStorage',
        make: () => {
            installLocalStorageShim();
            return new LocalStorageBackend();
        },
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
