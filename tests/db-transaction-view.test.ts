import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

const aPair = {
    uri_collection: '/organizations/1/ideas/',
    uri_id: '42',
    requester_identity_id: 'current',
    method: 'PUT',
    request_at: '2026-01-01T00:00:00.000000Z',
    request_hash: 'a'.repeat(64),
    request: '{"kind":"request"}',
    response_at: '2026-01-01T00:00:00.000000Z',
    version: 'e'.repeat(64),
    response: '{"kind":"response"}',
    operation_id: '0123456789ABCDEFGHIJKL',
};

test(
    'a view commits writes atomically',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['pairs'],
            async (view) => {
                await view.pairs.put('s1', aPair);
            },
        );
        const pair = await db.pairs.getById('s1');
        assert.equal(pair.id, 's1');
    },
);

test(
    'a throw inside the view rolls back',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['pairs'],
                async (view) => {
                    await view.pairs.put('s1', aPair);
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const pairs = await db.pairs.getAll();
        assert.deepEqual(pairs, []);
    },
);

test(
    'stores in the view share one uncommitted buffer',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['pairs'],
            async (view) => {
                await view.pairs.put('s1', aPair);
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.pairs.getAll();
            },
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 's1');
    },
);

test(
    'a nested view transaction joins the open tx',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['pairs'],
            async (view) => {
                await view.transaction(
                    ['pairs'],
                    async (inner) => {
                        await inner.pairs.put(
                            's1', aPair,
                        );
                    },
                );
            },
        );
        const pair = await db.pairs.getById('s1');
        assert.equal(pair.id, 's1');
    },
);

test(
    'a nested write rolls back with the outer tx',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['pairs'],
                async (view) => {
                    await view.transaction(
                        ['pairs'],
                        async (inner) => {
                            await inner.pairs.put(
                                's1', aPair,
                            );
                        },
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        assert.deepEqual(
            await db.pairs.getAll(), [],
        );
    },
);

test(
    'a nested out-of-scope table throws a clear error',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['pairs'],
                async (view) => {
                    await view.transaction(
                        ['other'],
                        async () => undefined,
                    );
                },
            ),
            /other/,
        );
    },
);

test(
    'reads work through readTransaction',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.pairs.put('s1', aPair);
        const seen = await db.readTransaction(
            ['pairs'],
            (view) => view.pairs.getAll(),
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 's1');
    },
);

test(
    'a put through readTransaction rejects',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.readTransaction(
                ['pairs'],
                (view) => view.pairs.put(
                    's1', aPair,
                ),
            ),
            /readonly transaction/,
        );
        assert.deepEqual(
            await db.pairs.getAll(), [],
        );
    },
);

test(
    'nested readTransaction inside transaction re-enters',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['pairs'],
            async (view) => {
                await view.pairs.put('s1', aPair);
                // Nested read joins the open write tx so the
                // uncommitted put is visible (read-your-writes).
                return view.readTransaction(
                    ['pairs'],
                    (inner) => inner.pairs.getAll(),
                );
            },
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 's1');
        assert.equal(
            (await db.pairs.getById('s1')).id, 's1',
        );
    },
);
