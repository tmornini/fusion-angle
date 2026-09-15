import { assert, assertStrictEquals } from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import type { StorageBackend } from '../api/db.ts';

// Reads hand out copies, never the buffered or committed
// row objects — the seam's value semantics: Postgres
// materializes a fresh row per read, and the test backend
// must not be weaker. A caller mutating a fetched row can
// never rewrite committed state.

interface Row { id: string; n: number; path: string }

async function seeded(
    backend: StorageBackend,
): Promise<StorageBackend> {
    await backend.ensureTable();
    await backend.transaction('readwrite',
        tx => tx.append<Row>({ id: 'a', n: 1, path: '/x/' },
        ),
    );
    return backend;
}

function readBack(
    backend: StorageBackend,
): Promise<Row | null> {
    return backend.transaction('readonly',
        tx => tx.getById<Row>('a'),
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
];

for (const tier of TIERS) {
    Deno.test(
        `${tier.name}: mutating a get() row does not`
            + ' reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const fetched = await readBack(backend);
            assert(fetched !== null);
            fetched.n = 999;
            const again = await readBack(backend);
            assertStrictEquals(again?.n, 1);
        },
    );

    Deno.test(
        `${tier.name}: mutating a getAll() row does not`
            + ' reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const rows = await backend.transaction('readonly',
                tx => tx.getAll<Row>(),
            );
            rows[0]!.n = 999;
            const again = await readBack(backend);
            assertStrictEquals(again?.n, 1);
        },
    );

    Deno.test(
        `${tier.name}: mutating a getCollectionPairs()`
            + ' row does not reach committed state',
        async () => {
            const backend = await seeded(tier.make());
            const rows = await backend.transaction('readonly',
                tx => tx.getCollectionPairs<Row>('/x/',
                ),
            );
            rows[0]!.n = 999;
            const again = await readBack(backend);
            assertStrictEquals(again?.n, 1);
        },
    );

    Deno.test(
        `${tier.name}: in-tx mutation of a fetched row`
            + ' does not survive the transaction',
        async () => {
            const backend = await seeded(tier.make());
            await backend.transaction('readonly',
                async (tx) => {
                    const row =
                        await tx.getById<Row>('a');
                    row!.n = 999;
                },
            );
            const again = await readBack(backend);
            assertStrictEquals(again?.n, 1);
        },
    );
}
