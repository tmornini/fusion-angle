import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EntityStore } from '../api/store-entity.ts';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { StateStore } from '../api/store-state.ts';
import { backendRunner } from '../api/db.ts';
import { validateStateEntity } from '../api/validators.ts';

// EntityStore.getAllWhere is the keyed-collection read the
// org fence narrows through. It must equal getAll() filtered
// by the column — same tombstone removal, just a smaller
// source. These pin that equivalence on the simulated tier.

interface Owned { id: string; org: string }

const passOwned = (
    b: Record<string, unknown>,
): Omit<Owned, 'id'> => b as unknown as Omit<Owned, 'id'>;

async function ownedStore(): Promise<{
    store: EntityStore<Owned>;
    states: StateStore;
}> {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['owned', 'states']);
    const run = backendRunner(backend);
    const states = new StateStore(
        run, 'states', validateStateEntity);
    const store = new EntityStore<Owned>(
        'owned', run, states, passOwned);
    return { store, states };
}

test(
    'getAllWhere equals getAll filtered, minus tombstones',
    async () => {
        const { store, states } = await ownedStore();
        await store.put('a', { org: 'o1' });
        await store.put('b', { org: 'o2' });
        await store.put('c', { org: 'o1' });
        await states.postEvent(
            's1', 'c', 'deleted', 'm1',
            '2026-01-01T00:00:00.000000Z',
        );
        const slice = await store.getAllWhere('org', 'o1');
        const all = await store.getAll();
        assert.deepEqual(
            slice, all.filter(r => r.org === 'o1'),
        );
        assert.deepEqual(slice.map(r => r.id), ['a']);
    },
);

test(
    'getAllWhere is empty for an unmatched key',
    async () => {
        const { store } = await ownedStore();
        await store.put('a', { org: 'o1' });
        assert.deepEqual(
            await store.getAllWhere('org', 'zzz'), [],
        );
    },
);
