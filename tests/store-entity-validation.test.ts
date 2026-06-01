import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EntityStore } from '../api/store-entity.ts';
import { HistoryEntityStore }
    from '../api/store-history-entity.ts';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { StateStore } from '../api/store-state.ts';

interface Thing { id: string; n: number }

async function primedBackend(): Promise<MemoryStorageBackend> {
    const backend = new MemoryStorageBackend();
    await backend.write('things', []);
    await backend.write('states', []);
    return backend;
}

test('EntityStore.put invokes the validator', async () => {
    const backend = await primedBackend();
    const stateStore = new StateStore(backend, 'states');
    let seen: Record<string, unknown> | null = null;
    const store = new EntityStore<Thing>(
        'things', backend, stateStore,
        (b) => {
            seen = b;
            return b as unknown as Omit<Thing, 'id'>;
        },
    );
    await store.put('a', { n: 7 });
    assert.deepEqual(seen, { n: 7 });
});

test('EntityStore.put rethrows validator errors',
    async () => {
        const backend = await primedBackend();
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
            () => { throw new Error('nope'); },
        );
        await assert.rejects(
            () => store.put('a', { n: 1 }),
            /nope/,
        );
    });

test('EntityStore.put writes the validator output',
    async () => {
        const backend = await primedBackend();
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
            (b) => ({
                n: (b['n'] as number) + 1,
            }),
        );
        const written = await store.put('a', { n: 7 });
        assert.equal(written.n, 8);
        const fetched = await store.getById('a');
        assert.equal(fetched.n, 8);
    });

test('EntityStore.put without validator passes through',
    async () => {
        const backend = await primedBackend();
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
        );
        const written = await store.put('a', { n: 7 });
        assert.equal(written.n, 7);
    });

test('HistoryEntityStore.put invokes the validator',
    async () => {
        const backend = await primedBackend();
        let seen: Record<string, unknown> | null = null;
        const store = new HistoryEntityStore<Thing>(
            'things', backend,
            (b) => {
                seen = b;
                return b as unknown as Omit<Thing, 'id'>;
            },
        );
        await store.put('a', { n: 7 });
        assert.deepEqual(seen, { n: 7 });
    });

test('HistoryEntityStore.put rethrows validator errors',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backend,
            () => { throw new Error('nope'); },
        );
        await assert.rejects(
            () => store.put('a', { n: 1 }),
            /nope/,
        );
    });

test('HistoryEntityStore.put writes the validator output',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backend,
            (b) => ({
                n: (b['n'] as number) + 1,
            }),
        );
        const written = await store.put('a', { n: 7 });
        assert.equal(written.n, 8);
        const fetched = await store.getById('a');
        assert.equal(fetched.n, 8);
    });

test('HistoryEntityStore.put without validator passes',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backend,
        );
        const written = await store.put('a', { n: 7 });
        assert.equal(written.n, 7);
    });
