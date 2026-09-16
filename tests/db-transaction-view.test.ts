import {
    assertEquals, assertRejects, assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';

const aMessagePair = {
    path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    name: '42',
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
        await db.transaction(async (view) => {
                await view.messagePairs.append(
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
            () => db.transaction(async (view) => {
                    await view.messagePairs.append(
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
        const seen = await db.transaction(async (view) => {
                await view.messagePairs.append(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.messagePairs.getCollectionPairs(
                    aMessagePair.path,
                );
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
        await db.transaction(async (view) => {
                await view.transaction(async (inner) => {
                        await inner.messagePairs.append(
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
            () => db.transaction(async (view) => {
                    await view.transaction(async (inner) => {
                            await inner.messagePairs.append(
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
    'reads work through readTransaction',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await db.messagePairs.append('syWUUcdBSbBgMwBiCrgbDw', aMessagePair);
        const seen = await db.readTransaction(
            (view) => view.messagePairs.getCollectionPairs(
                aMessagePair.path,
            ),
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
            () => db.readTransaction((view) => view.messagePairs.append(
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
        const seen = await db.transaction(async (view) => {
                await view.messagePairs.append(
                    'syWUUcdBSbBgMwBiCrgbDw', aMessagePair,
                );
                // Nested read joins the open write tx so the
                // uncommitted put is visible (read-your-writes).
                return view.readTransaction(
                    (inner) => inner.messagePairs
                        .getCollectionPairs(aMessagePair.path),
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
