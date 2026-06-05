import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryStorageBackend,
} from '../api/backend-memory.ts';
import { StateStore } from '../api/store-state.ts';
import { backendRunner } from '../api/db.ts';

async function statesStore(): Promise<{
    backend: MemoryStorageBackend;
    states: StateStore;
}> {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['states']);
    const states = new StateStore(
        backendRunner(backend), 'states',
    );
    return { backend, states };
}

test(
    'deletedIdsIn reads the same tx uncommitted buffer',
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
                    at: '2026-01-01T00:00:00.000Z',
                });
                return states.deletedIdsIn(tx);
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
                    at: '2026-01-01T00:00:00.000Z',
                });
                await tx.put('states', {
                    id: 's2',
                    entity_id: 'e1',
                    state: 'deleted',
                    member_id: 'm1',
                    at: '2026-01-02T00:00:00.000Z',
                });
                return states.isDeletedIn(tx, 'e1');
            },
        );
        assert.equal(deleted, true);
    },
);

test(
    'currentForIn returns the latest event for an entity',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000Z',
        });
        await states.put('s2', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-03T00:00:00.000Z',
        });
        const current = await backend.transaction(
            ['states'], 'readonly',
            tx => states.currentForIn(tx, 'e1'),
        );
        assert.ok(current !== null);
        assert.equal(current.state, 'b');
    },
);

test(
    'allForIn returns one entity sorted ascending by at',
    async () => {
        const { backend, states } = await statesStore();
        await states.put('s1', {
            entity_id: 'e1',
            state: 'b',
            member_id: 'm1',
            at: '2026-01-02T00:00:00.000Z',
        });
        await states.put('s2', {
            entity_id: 'e2',
            state: 'x',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000Z',
        });
        await states.put('s3', {
            entity_id: 'e1',
            state: 'a',
            member_id: 'm1',
            at: '2026-01-01T00:00:00.000Z',
        });
        const events = await backend.transaction(
            ['states'], 'readonly',
            tx => states.allForIn(tx, 'e1'),
        );
        assert.deepEqual(
            events.map(e => e.state), ['a', 'b'],
        );
    },
);
