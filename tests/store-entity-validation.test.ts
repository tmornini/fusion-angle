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

class CountingBackend extends MemoryStorageBackend {
    writes = 0;
    async write<T extends { id: string }>(
        table: string,
        rows: T[],
    ): Promise<void> {
        this.writes++;
        await super.write(table, rows);
    }
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

test(
    'EntityStore.putMany writes the table once for'
    + ' many entries',
    async () => {
        const backend = new CountingBackend();
        await backend.write('things', []);
        await backend.write('states', []);
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
        );
        backend.writes = 0;
        await store.putMany(
            [
                { id: 'a', fields: { n: 1 } },
                { id: 'b', fields: { n: 2 } },
                { id: 'c', fields: { n: 3 } },
            ],
            [],
        );
        assert.equal(backend.writes, 1);
        assert.equal(
            (await store.getById('b')).n, 2,
        );
    },
);

test(
    'EntityStore.putMany applies deletes and'
    + ' upserts together',
    async () => {
        const backend = await primedBackend();
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
        );
        await store.put('old', { n: 9 });
        await store.putMany(
            [{ id: 'fresh', fields: { n: 5 } }],
            ['old'],
        );
        await assert.rejects(
            () => store.getById('old'),
        );
        assert.equal(
            (await store.getById('fresh')).n, 5,
        );
    },
);

test(
    'EntityStore.putMany writes nothing when an'
    + ' entry fails validation',
    async () => {
        const backend = new CountingBackend();
        await backend.write('things', []);
        await backend.write('states', []);
        const stateStore =
            new StateStore(backend, 'states');
        const store = new EntityStore<Thing>(
            'things', backend, stateStore,
            (b) => {
                if ((b['n'] as number) < 0) {
                    throw new Error('negative');
                }
                return b as unknown as Omit<Thing, 'id'>;
            },
        );
        backend.writes = 0;
        await assert.rejects(
            () => store.putMany(
                [
                    { id: 'a', fields: { n: 1 } },
                    { id: 'b', fields: { n: -1 } },
                ],
                [],
            ),
            /negative/,
        );
        assert.equal(backend.writes, 0);
        await assert.rejects(
            () => store.getById('a'),
        );
    },
);

test(
    'HistoryEntityStore.putMany upserts every entry',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backend,
        );
        await store.putMany(
            [
                { id: 'a', fields: { n: 1 } },
                { id: 'b', fields: { n: 2 } },
            ],
            [],
        );
        assert.equal(
            (await store.getById('a')).n, 1,
        );
        assert.equal(
            (await store.getById('b')).n, 2,
        );
    },
);
