import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryStorageBackend,
} from '../api/backend-memory.ts';
import { StateStore } from '../api/store-state.ts';
import { backendRunner } from '../api/db.ts';
import { validateStateEntity } from '../api/validators.ts';

async function statesStore(): Promise<{
    backend: MemoryStorageBackend;
    states: StateStore;
}> {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['states']);
    const states = new StateStore(
        backendRunner(backend), 'states',
        validateStateEntity,
    );
    return { backend, states };
}

test(
    'getDeletedIdsIn reads the same tx uncommitted buffer',
    async () => {
        const { backend, states } = await statesStore();
        const seen = await backend.transaction(
            ['states'], 'readwrite',
            async (tx) => {
                await tx.put('states', {
                    id: 's1',
                    entity_id: 'e1',
                    state: 'deleted',
                    member_id: 'm1',
                    at: '2026-01-01T00:00:00.000000Z',
                });
                return states.getDeletedIdsIn(tx);
            },
        );
        assert.ok(seen.has('e1'));
    },
);

test(
    'isDeletedIn reflects the latest event in the tx',
    async () => {
        const { backend, states } = await statesStore();
        const deleted = await backend.transaction(
            ['states'], 'readwrite',
            async (tx) => {
                await tx.put('states', {
                    id: 's1',
                    entity_id: 'e1',
                    state: 'active',
                    member_id: 'm1',
                    at: '2026-01-01T00:00:00.000000Z',
                });
                await tx.put('states', {
                    id: 's2',
                    entity_id: 'e1',
                    state: 'deleted',
                    member_id: 'm1',
                    at: '2026-01-02T00:00:00.000000Z',
                });
                return states.isDeletedIn(tx, 'e1');
            },
        );
        assert.equal(deleted, true);
    },
);

test(
    'getCurrentForIn returns the latest event for an entity',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-03T00:00:00.000000Z',
        });
        const current = await backend.transaction(
            ['states'], 'readonly',
            tx => states.getCurrentForIn(tx, 'e1'),
        );
        assert.ok(current !== null);
        assert.equal(current.state, 'b');
    },
);

test(
    'getAllForIn returns one entity sorted ascending by at',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-02T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e2',
            state: 'x',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s3', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const events = await backend.transaction(
            ['states'], 'readonly',
            tx => states.getAllForIn(tx, 'e1'),
        );
        assert.deepEqual(
            events.map(e => e.state), ['a', 'b'],
        );
    },
);

// Tiebreak agreement. Every reader resolves a same-`at` tie
// by the SAME (at, id) total order — larger id wins — so
// list filtering (getDeletedIdsIn), lifecycle checks
// (isDeletedIn), and getCurrentForIn can never contradict each
// other on any backend or row permutation.

test(
    'getCurrentForIn keeps the larger-id row on an at tie',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const current = await backend.transaction(
            ['states'], 'readonly',
            tx => states.getCurrentForIn(tx, 'e1'),
        );
        assert.equal(current!.state, 'b');
    },
);

test(
    'getCurrentForIn isolates its entity from co-at others',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s9', {
            entity_id: 'e2',
            state: 'x',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s3', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const current = await backend.transaction(
            ['states'], 'readonly',
            tx => states.getCurrentForIn(tx, 'e1'),
        );
        assert.equal(current!.state, 'b');
    },
);

test(
    'getCurrentForIn and isDeletedIn agree on a co-at pair',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'deleted',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'active',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const [current, deleted] =
            await backend.transaction(
                ['states'], 'readonly',
                async (tx) => [
                    await states.getCurrentForIn(tx, 'e1'),
                    await states.isDeletedIn(tx, 'e1'),
                ] as const,
            );
        assert.equal(
            current!.state === 'deleted', deleted,
        );
    },
);

test(
    'getCurrentForIn returns null for an unknown entity',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const current = await backend.transaction(
            ['states'], 'readonly',
            tx => states.getCurrentForIn(tx, 'ghost'),
        );
        assert.equal(current, null);
    },
);

test(
    'isDeletedIn takes the larger-id row on an at tie',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'active',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'deleted',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const deleted = await backend.transaction(
            ['states'], 'readonly',
            tx => states.isDeletedIn(tx, 'e1'),
        );
        assert.equal(deleted, true);
    },
);

test(
    'isDeletedIn lets a co-at undelete win on larger id',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'deleted',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'active',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const deleted = await backend.transaction(
            ['states'], 'readonly',
            tx => states.isDeletedIn(tx, 'e1'),
        );
        assert.equal(deleted, false);
    },
);

test(
    'isDeletedIn is false after an undelete over time',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'deleted',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'active',
            member_id: 'm1',
            at: '2026-01-02T00:00:00.000000Z',
        });
        const deleted = await backend.transaction(
            ['states'], 'readonly',
            tx => states.isDeletedIn(tx, 'e1'),
        );
        assert.equal(deleted, false);
    },
);
