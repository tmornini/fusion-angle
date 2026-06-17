import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';

const aState = {
    entity_id: 'm1',
    state: 'active',
    member_id: 'm1',
    at: '2026-01-01T00:00:00.000000Z',
};

test(
    'a view commits writes across stores atomically',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['members', 'states'],
            async (view) => {
                await view.members.put('m1', {
                    type: 'human',
                });
                await view.states.put('s1', aState);
            },
        );
        const member = await db.members.getById('m1');
        const state = await db.states.getById('s1');
        assert.equal(member.id, 'm1');
        assert.equal(state.id, 's1');
    },
);

test(
    'a throw inside the view rolls back every store',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['members', 'states'],
                async (view) => {
                    await view.members.put('m1', {
                        type: 'human',
                    });
                    await view.states.put('s1', aState);
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        const members = await db.members.getAll();
        const states = await db.states.getAll();
        assert.deepEqual(members, []);
        assert.deepEqual(states, []);
    },
);

test(
    'stores in the view share one uncommitted buffer',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        const seen = await db.transaction(
            ['members', 'states'],
            async (view) => {
                await view.members.put('m1', {
                    type: 'human',
                });
                // Read back inside the same tx — the put is
                // visible before commit.
                return view.members.getAll();
            },
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.id, 'm1');
    },
);

test(
    'a nested view transaction joins the open tx',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await db.transaction(
            ['members', 'states'],
            async (view) => {
                await view.transaction(
                    ['members'],
                    async (inner) => {
                        await inner.members.put('m1', {
                            type: 'human',
                        });
                    },
                );
                await view.states.put('s1', aState);
            },
        );
        const member = await db.members.getById('m1');
        const state = await db.states.getById('s1');
        assert.equal(member.id, 'm1');
        assert.equal(state.id, 's1');
    },
);

test(
    'a nested write rolls back with the outer tx',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['members', 'states'],
                async (view) => {
                    await view.transaction(
                        ['members'],
                        async (inner) => {
                            await inner.members.put('m1', {
                                type: 'human',
                            });
                        },
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        assert.deepEqual(await db.members.getAll(), []);
    },
);

test(
    'a nested out-of-scope table throws a clear error',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await assert.rejects(
            () => db.transaction(
                ['members'],
                async (view) => {
                    await view.transaction(
                        ['states'],
                        async () => undefined,
                    );
                },
            ),
            /states/,
        );
    },
);
