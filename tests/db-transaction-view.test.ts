import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';

const aClient = {
    grant_types: '["password"]',
    redirect_uris: '[]',
    jwks: '{}',
    aud: 'fusion-ai',
    status: 'active' as const,
};

const aRequest = {
    uri_prefix: '/organizations/1/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'current',
    message_hash: 'a'.repeat(64),
    message: '{"kind":"request"}',
};

test(
    'a view commits writes across stores atomically',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['clients', 'requests'],
            async (view) => {
                await view.clients.put('c1', aClient);
                await view.requests.put('r1', aRequest);
            },
        );
        const client = await db.clients.getById('c1');
        const request = await db.requests.getById('r1');
        assert.equal(client.id, 'c1');
        assert.equal(request.id, 'r1');
    },
);

test(
    'a throw inside the view rolls back every store',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['clients', 'requests'],
                async (view) => {
                    await view.clients.put('c1', aClient);
                    await view.requests.put('r1', aRequest);
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const clients = await db.clients.getAll();
        const requests = await db.requests.getAll();
        assert.deepEqual(clients, []);
        assert.deepEqual(requests, []);
    },
);

test(
    'stores in the view share one uncommitted buffer',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['clients', 'requests'],
            async (view) => {
                await view.clients.put('c1', aClient);
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.clients.getAll();
            },
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 'c1');
    },
);

test(
    'a nested view transaction joins the open tx',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['clients', 'requests'],
            async (view) => {
                await view.transaction(
                    ['clients'],
                    async (inner) => {
                        await inner.clients.put(
                            'c1', aClient,
                        );
                    },
                );
                await view.requests.put('r1', aRequest);
            },
        );
        const client = await db.clients.getById('c1');
        const request = await db.requests.getById('r1');
        assert.equal(client.id, 'c1');
        assert.equal(request.id, 'r1');
    },
);

test(
    'a nested write rolls back with the outer tx',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['clients', 'requests'],
                async (view) => {
                    await view.transaction(
                        ['clients'],
                        async (inner) => {
                            await inner.clients.put(
                                'c1', aClient,
                            );
                        },
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        assert.deepEqual(
            await db.clients.getAll(), [],
        );
    },
);

test(
    'a nested out-of-scope table throws a clear error',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['clients'],
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
