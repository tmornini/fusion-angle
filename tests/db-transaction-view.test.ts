import {
    assertEquals, assertRejects, assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

const aMessagePair = {
    uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    uri_id: '42',
    requester_identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    method: 'PUT',
    request_at: '2026-01-01T00:00:00.000000Z',
    request_hash: 'a'.repeat(64),
    request: '{"kind":"request"}',
    response_at: '2026-01-01T00:00:00.000000Z',
    response: '{"kind":"response"}',
    operation_id: '0123456789ABCDEFGHIJKw',
};

Deno.test(
    'a view commits writes atomically',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['message_pairs'],
            async (view) => {
                await view.messagePairs.put(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
            },
        );
        const messagePair = await db.messagePairs.getById(
            'syWUUcdBSbBgMwBiCrgbDw',
        );
        assertStrictEquals(messagePair.id, 'syWUUcdBSbBgMwBiCrgbDw');
    },
);

Deno.test(
    'a throw inside the view rolls back',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assertRejects(
            () => db.transaction(
                ['message_pairs'],
                async (view) => {
                    await view.messagePairs.put(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
                    throw new Error('boom');
                },
            ),
            Error, 'boom',
        );
        const messagePairs = await db.messagePairs.getAll();
        assertEquals(messagePairs, []);
    },
);

Deno.test(
    'stores in the view share one uncommitted buffer',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['message_pairs'],
            async (view) => {
                await view.messagePairs.put(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.messagePairs.getAll();
            },
        );
        assertStrictEquals(seen.length, 1);
        assertStrictEquals(seen[0]!.id, 'syWUUcdBSbBgMwBiCrgbDw');
    },
);

Deno.test(
    'a nested view transaction joins the open tx',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['message_pairs'],
            async (view) => {
                await view.transaction(
                    ['message_pairs'],
                    async (inner) => {
                        await inner.messagePairs.put(
                            'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                        );
                    },
                );
            },
        );
        const messagePair = await db.messagePairs.getById(
            'syWUUcdBSbBgMwBiCrgbDw',
        );
        assertStrictEquals(messagePair.id, 'syWUUcdBSbBgMwBiCrgbDw');
    },
);

Deno.test(
    'a nested write rolls back with the outer tx',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assertRejects(
            () => db.transaction(
                ['message_pairs'],
                async (view) => {
                    await view.transaction(
                        ['message_pairs'],
                        async (inner) => {
                            await inner.messagePairs.put(
                                'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                            );
                        },
                    );
                    throw new Error('boom');
                },
            ),
            Error, 'boom',
        );
        assertEquals(
            await db.messagePairs.getAll(), [],
        );
    },
);

Deno.test(
    'a nested out-of-scope table throws a clear error',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assertRejects(
            () => db.transaction(
                ['message_pairs'],
                async (view) => {
                    await view.transaction(
                        ['other'],
                        async () => undefined,
                    );
                },
            ),
            Error, 'other',
        );
    },
);

Deno.test(
    'reads work through readTransaction',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.messagePairs.put('syWUUcdBSbBgMwBiCrgbDw', aMessagePair);
        const seen = await db.readTransaction(
            ['message_pairs'],
            (view) => view.messagePairs.getAll(),
        );
        assertStrictEquals(seen.length, 1);
        assertStrictEquals(seen[0]!.id, 'syWUUcdBSbBgMwBiCrgbDw');
    },
);

Deno.test(
    'a put through readTransaction rejects',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await assertRejects(
            () => db.readTransaction(
                ['message_pairs'],
                (view) => view.messagePairs.put(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                ),
            ),
            Error, 'readonly transaction',
        );
        assertEquals(
            await db.messagePairs.getAll(), [],
        );
    },
);

Deno.test(
    'nested readTransaction inside transaction re-enters',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['message_pairs'],
            async (view) => {
                await view.messagePairs.put(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
                // Nested read joins the open write tx so the
                // uncommitted put is visible (read-your-writes).
                return view.readTransaction(
                    ['message_pairs'],
                    (inner) => inner.messagePairs.getAll(),
                );
            },
        );
        assertStrictEquals(seen.length, 1);
        assertStrictEquals(seen[0]!.id, 'syWUUcdBSbBgMwBiCrgbDw');
        assertStrictEquals(
            (await db.messagePairs.getById('syWUUcdBSbBgMwBiCrgbDw')).id
                , 'syWUUcdBSbBgMwBiCrgbDw',
        );
    },
);
