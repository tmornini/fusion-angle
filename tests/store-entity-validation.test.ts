import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HistoryEntityStore }
    from '../api/store-history-entity.ts';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { backendRunner } from '../api/db.ts';

interface Thing { id: string; n: number }

// A passthrough validator for tests exercising transaction
// mechanics, not validation — every store now requires one
// explicitly (no silent default).
const pass = (
    b: Record<string, unknown>,
): Omit<Thing, 'id'> => b as unknown as Omit<Thing, 'id'>;

async function primedBackend(): Promise<MemoryStorageBackend> {
    const backend = new MemoryStorageBackend();
    await backend.ensureTables(['things']);
    return backend;
}

test('HistoryEntityStore.put invokes the validator',
    async () => {
        const backend = await primedBackend();
        let seen: Record<string, unknown> | null = null;
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
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
            'things', backendRunner(backend),
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
            'things', backendRunner(backend),
            (b) => ({
                n: (b['n'] as number) + 1,
            }),
        );
        const written = await store.put('a', { n: 7 });
        assert.equal(written.n, 8);
        const fetched = await store.getById('a');
        assert.equal(fetched.n, 8);
    });

test(
    'HistoryEntityStore.putMany upserts every entry',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
            pass,
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
