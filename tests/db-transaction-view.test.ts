import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

const aResponse = {
    uri_collection: '/organizations/1/flows/',
    uri_id: '7',
    at: '2026-01-01T00:00:00.000000Z',
    version: 'e'.repeat(64),
    message: '{"kind":"response"}',
    operation_id: '0123456789ABCDEFGHIJKL',
};

const aRequest = {
    uri_collection: '/organizations/1/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'current',
    message_hash: 'a'.repeat(64),
    message: '{"kind":"request"}',
    method: 'PUT',
    operation_id: '0123456789ABCDEFGHIJKL',
};

test(
    'a view commits writes across stores atomically',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['responses', 'requests'],
            async (view) => {
                await view.responses.put('s1', aResponse);
                await view.requests.put('r1', aRequest);
            },
        );
        const response = await db.responses.getById('s1');
        const request = await db.requests.getById('r1');
        assert.equal(response.id, 's1');
        assert.equal(request.id, 'r1');
    },
);

test(
    'a throw inside the view rolls back every store',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['responses', 'requests'],
                async (view) => {
                    await view.responses.put('s1', aResponse);
                    await view.requests.put('r1', aRequest);
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const responses = await db.responses.getAll();
        const requests = await db.requests.getAll();
        assert.deepEqual(responses, []);
        assert.deepEqual(requests, []);
    },
);

test(
    'stores in the view share one uncommitted buffer',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['responses', 'requests'],
            async (view) => {
                await view.responses.put('s1', aResponse);
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.responses.getAll();
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
            ['responses', 'requests'],
            async (view) => {
                await view.transaction(
                    ['responses'],
                    async (inner) => {
                        await inner.responses.put(
                            's1', aResponse,
                        );
                    },
                );
                await view.requests.put('r1', aRequest);
            },
        );
        const response = await db.responses.getById('s1');
        const request = await db.requests.getById('r1');
        assert.equal(response.id, 's1');
        assert.equal(request.id, 'r1');
    },
);

test(
    'a nested write rolls back with the outer tx',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['responses', 'requests'],
                async (view) => {
                    await view.transaction(
                        ['responses'],
                        async (inner) => {
                            await inner.responses.put(
                                's1', aResponse,
                            );
                        },
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        assert.deepEqual(
            await db.responses.getAll(), [],
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
                ['responses'],
                async (view) => {
                    await view.transaction(
                        ['requests'],
                        async () => undefined,
                    );
                },
            ),
            /requests/,
        );
    },
);

test(
    'reads work through readTransaction',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.responses.put('s1', aResponse);
        const seen = await db.readTransaction(
            ['responses'],
            (view) => view.responses.getAll(),
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
                ['responses'],
                (view) => view.responses.put(
                    's1', aResponse,
                ),
            ),
            /readonly transaction/,
        );
        assert.deepEqual(
            await db.responses.getAll(), [],
        );
    },
);

test(
    'nested readTransaction inside transaction re-enters',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['responses', 'requests'],
            async (view) => {
                await view.responses.put('s1', aResponse);
                // Nested read joins the open write tx so the
                // uncommitted put is visible (read-your-writes).
                return view.readTransaction(
                    ['responses'],
                    (inner) => inner.responses.getAll(),
                );
            },
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 's1');
        assert.equal(
            (await db.responses.getById('s1')).id, 's1',
        );
    },
);
