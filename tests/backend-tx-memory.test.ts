import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { MissingTableError } from '../api/db.ts';

interface Row { id: string; n: number }

Deno.test(
    'ensureTable creates a missing table empty',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        const rows = await backend.transaction('readonly',
            tx => tx.getAll<Row>(),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'ensureTable leaves an existing table intact',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.transaction('readwrite',
            tx => tx.append<Row>({ id: 'a', n: 1 }),
        );
        await backend.ensureTable();
        const rows = await backend.transaction('readonly',
            tx => tx.getAll<Row>(),
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.id, 'a');
    },
);

Deno.test(
    'transaction before ensureTable throws',
    async () => {
        const backend = new MemoryStorageBackend();
        await assertRejects(
            () => backend.transaction('readonly',
                tx => tx.getAll(),
            ),
            MissingTableError,
        );
    },
);

Deno.test(
    'a single put in a tx persists and reads back',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.transaction('readwrite',
            tx => tx.append<Row>({ id: 'a', n: 7 }),
        );
        const got = await backend.transaction('readonly',
            tx => tx.getById<Row>('a'),
        );
        assertStrictEquals(got!.n, 7);
    },
);

Deno.test(
    'get returns null for an absent row',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        const got = await backend.transaction('readonly',
            tx => tx.getById<Row>('nope'),
        );
        assertStrictEquals(got, null);
    },
);

Deno.test(
    'a NULL field rejects the put and rolls back',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await assertRejects(
            () => backend.transaction('readwrite',
                tx => tx.append({ id: 'a', x: null } as {
                        id: string;
                    },
                ),
            ),
            Error,
            'NOT NULL',
        );
        const rows = await backend.transaction('readonly',
            tx => tx.getAll<Row>(),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'a readonly tx rejects a put',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await assertRejects(
            () => backend.transaction('readonly',
                tx => tx.append<Row>({ id: 'a', n: 1 }),
            ),
            Error,
            'readonly',
        );
    },
);

Deno.test(
    'concurrent transactions on one table both persist',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        const append = () => backend.transaction('readwrite',
            async (tx) => {
                const rows = await tx.getAll<Row>();
                await tx.append<Row>({
                    id: `r${rows.length}`,
                    n: rows.length,
                });
            },
        );
        await Promise.all([append(), append()]);
        const rows = await backend.transaction('readonly',
            tx => tx.getAll<Row>(),
        );
        assertStrictEquals(rows.length, 2);
    },
);
