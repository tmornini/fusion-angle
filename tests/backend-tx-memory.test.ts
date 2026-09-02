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
    'ensureTables creates a missing table empty',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'ensureTables leaves an existing table intact',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 1 }),
        );
        await backend.ensureTables(['t']);
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.id, 'a');
    },
);

Deno.test(
    'transaction over a never-created table throws',
    async () => {
        const backend = new MemoryStorageBackend();
        await assertRejects(
            () => backend.transaction(
                ['ghost'], 'readonly',
                tx => tx.getAll('ghost'),
            ),
            MissingTableError,
        );
    },
);

Deno.test(
    'a single put in a tx persists and reads back',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 7 }),
        );
        const got = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'a'),
        );
        assertStrictEquals(got!.n, 7);
    },
);

Deno.test(
    'get returns null for an absent row',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const got = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'nope'),
        );
        assertStrictEquals(got, null);
    },
);

Deno.test(
    'a tx spanning two tables commits both',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['a', 'b']);
        await backend.transaction(
            ['a', 'b'], 'readwrite',
            async (tx) => {
                await tx.put<Row>('a', { id: 'AjdvjuECVZEgZoFajaIEkg'
                    , n: 1 });
                await tx.put<Row>('b', { id: 'BBjWJsjYIDkTRKIIPrzWRw'
                    , n: 2 });
            },
        );
        const [ra, rb] = await backend.transaction(
            ['a', 'b'], 'readonly',
            async (tx) => [
                await tx.getAll<Row>('a'),
                await tx.getAll<Row>('b'),
            ],
        );
        assertStrictEquals(ra.length, 1);
        assertStrictEquals(rb.length, 1);
    },
);

Deno.test(
    'a throw inside the tx rolls back every table',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['a', 'b']);
        await assertRejects(
            () => backend.transaction(
                ['a', 'b'], 'readwrite',
                async (tx) => {
                    await tx.put<Row>(
                        'a', { id: 'AjdvjuECVZEgZoFajaIEkg', n: 1 },
                    );
                    await tx.put<Row>(
                        'b', { id: 'BBjWJsjYIDkTRKIIPrzWRw', n: 2 },
                    );
                    throw new Error('boom');
                },
            ),
            Error,
            'boom',
        );
        const [ra, rb] = await backend.transaction(
            ['a', 'b'], 'readonly',
            async (tx) => [
                await tx.getAll<Row>('a'),
                await tx.getAll<Row>('b'),
            ],
        );
        assertEquals(ra, []);
        assertEquals(rb, []);
    },
);

Deno.test(
    'a NULL field rejects the put and rolls back',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await assertRejects(
            () => backend.transaction(
                ['t'], 'readwrite',
                tx => tx.put(
                    't',
                    { id: 'a', x: null } as {
                        id: string;
                    },
                ),
            ),
            Error,
            'NOT NULL',
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'clear empties a table within the tx',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            async (tx) => {
                await tx.put<Row>('t', { id: 'a', n: 1 });
                await tx.put<Row>('t', { id: 'b', n: 2 });
            },
        );
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.clear('t'),
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'a rolled-back tx discards a clear',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 1 }),
        );
        await assertRejects(
            () => backend.transaction(
                ['t'], 'readwrite',
                async (tx) => {
                    await tx.clear('t');
                    throw new Error('boom');
                },
            ),
            Error,
            'boom',
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertStrictEquals(rows.length, 1);
    },
);

Deno.test(
    'a readonly tx rejects a put',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await assertRejects(
            () => backend.transaction(
                ['t'], 'readonly',
                tx => tx.put<Row>('t', { id: 'a', n: 1 }),
            ),
            Error,
            'readonly',
        );
    },
);

Deno.test(
    'delete removes a row within the tx',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 1 }),
        );
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.delete('t', 'a'),
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertEquals(rows, []);
    },
);

Deno.test(
    'concurrent transactions on one table both persist',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const append = () => backend.transaction(
            ['t'], 'readwrite',
            async (tx) => {
                const rows = await tx.getAll<Row>('t');
                await tx.put<Row>('t', {
                    id: `r${rows.length}`,
                    n: rows.length,
                });
            },
        );
        await Promise.all([append(), append()]);
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assertStrictEquals(rows.length, 2);
    },
);
