import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { MissingTableError } from '../api/db.ts';

interface Row { id: string; n: number }

test(
    'ensureTables creates a missing table empty',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assert.deepEqual(rows, []);
    },
);

test(
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
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.id, 'a');
    },
);

test(
    'transaction over a never-created table throws',
    async () => {
        const backend = new MemoryStorageBackend();
        await assert.rejects(
            () => backend.transaction(
                ['ghost'], 'readonly',
                tx => tx.getAll('ghost'),
            ),
            (e: unknown) => e instanceof MissingTableError,
        );
    },
);

test(
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
        assert.equal(got!.n, 7);
    },
);

test(
    'get returns null for an absent row',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const got = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'nope'),
        );
        assert.equal(got, null);
    },
);

test(
    'a tx spanning two tables commits both',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['a', 'b']);
        await backend.transaction(
            ['a', 'b'], 'readwrite',
            async (tx) => {
                await tx.put<Row>('a', { id: '1', n: 1 });
                await tx.put<Row>('b', { id: '2', n: 2 });
            },
        );
        const [ra, rb] = await backend.transaction(
            ['a', 'b'], 'readonly',
            async (tx) => [
                await tx.getAll<Row>('a'),
                await tx.getAll<Row>('b'),
            ],
        );
        assert.equal(ra.length, 1);
        assert.equal(rb.length, 1);
    },
);

test(
    'a throw inside the tx rolls back every table',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['a', 'b']);
        await assert.rejects(
            () => backend.transaction(
                ['a', 'b'], 'readwrite',
                async (tx) => {
                    await tx.put<Row>(
                        'a', { id: '1', n: 1 },
                    );
                    await tx.put<Row>(
                        'b', { id: '2', n: 2 },
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const [ra, rb] = await backend.transaction(
            ['a', 'b'], 'readonly',
            async (tx) => [
                await tx.getAll<Row>('a'),
                await tx.getAll<Row>('b'),
            ],
        );
        assert.deepEqual(ra, []);
        assert.deepEqual(rb, []);
    },
);

test(
    'a NULL field rejects the put and rolls back',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await assert.rejects(
            () => backend.transaction(
                ['t'], 'readwrite',
                tx => tx.put(
                    't',
                    { id: 'a', x: null } as {
                        id: string;
                    },
                ),
            ),
            /NOT NULL/,
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assert.deepEqual(rows, []);
    },
);

test(
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
        assert.deepEqual(rows, []);
    },
);

test(
    'a rolled-back tx discards a clear',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 1 }),
        );
        await assert.rejects(
            () => backend.transaction(
                ['t'], 'readwrite',
                async (tx) => {
                    await tx.clear('t');
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const rows = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.getAll<Row>('t'),
        );
        assert.equal(rows.length, 1);
    },
);

test(
    'a readonly tx rejects a put',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await assert.rejects(
            () => backend.transaction(
                ['t'], 'readonly',
                tx => tx.put<Row>('t', { id: 'a', n: 1 }),
            ),
            /readonly/,
        );
    },
);

test(
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
        assert.deepEqual(rows, []);
    },
);

test(
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
        assert.equal(rows.length, 2);
    },
);
