import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import {
    LocalStorageBackend,
} from '../api/backend-localstorage.ts';
import type { StorageBackend } from '../api/db.ts';

// Reads must hand out copies, never the buffered or
// committed row objects — IndexedDB structured-clones every
// read, and the simulated tiers must share its value
// semantics. A caller mutating a fetched row must never
// rewrite committed state.

interface Row { id: string; n: number; k: string }

function installLocalStorageShim(): void {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(key: string): string | null;
            setItem(key: string, value: string): void;
            removeItem(key: string): void;
        };
    }).localStorage = {
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) { map.set(key, value); },
        removeItem(key) { map.delete(key); },
    };
}

async function seeded(
    backend: StorageBackend,
): Promise<StorageBackend> {
    await backend.ensureTables(['t']);
    await backend.transaction(
        ['t'], 'readwrite',
        tx => tx.put<Row>(
            't', { id: 'a', n: 1, k: 'x' },
        ),
    );
    return backend;
}

function readBack(
    backend: StorageBackend,
): Promise<Row | null> {
    return backend.transaction(
        ['t'], 'readonly',
        tx => tx.get<Row>('t', 'a'),
    );
}

const TIERS: ReadonlyArray<{
    name: string;
    make: () => StorageBackend;
}> = [
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

for (const tier of TIERS) {
    test(
        `${tier.name}: mutating a get() row does not`
            + ' reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const fetched = await readBack(backend);
            assert.ok(fetched !== null);
            fetched.n = 999;
            const again = await readBack(backend);
            assert.equal(again?.n, 1);
        },
    );

    test(
        `${tier.name}: mutating a getAll() row does not`
            + ' reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const rows = await backend.transaction(
                ['t'], 'readonly',
                tx => tx.getAll<Row>('t'),
            );
            rows[0]!.n = 999;
            const again = await readBack(backend);
            assert.equal(again?.n, 1);
        },
    );

    test(
        `${tier.name}: mutating a getWhere() row does`
            + ' not reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const rows = await backend.transaction(
                ['t'], 'readonly',
                tx => tx.getWhere<Row>('t', 'k', 'x'),
            );
            rows[0]!.n = 999;
            const again = await readBack(backend);
            assert.equal(again?.n, 1);
        },
    );

    test(
        `${tier.name}: in-tx mutation of a fetched row`
            + ' does not survive the transaction',
        async () => {
            const backend = await seeded(tier.make());
            await backend.transaction(
                ['t'], 'readonly',
                async (tx) => {
                    const row =
                        await tx.get<Row>('t', 'a');
                    row!.n = 999;
                },
            );
            const again = await readBack(backend);
            assert.equal(again?.n, 1);
        },
    );
}
