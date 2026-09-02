import {
    assertEquals, assertRejects, assertStrictEquals,
} from '@std/assert';
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

Deno.test('HistoryEntityStore.put invokes the validator',
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
        assertEquals(seen, { n: 7 });
    });

Deno.test('HistoryEntityStore.put rethrows validator errors',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
            () => { throw new Error('nope'); },
        );
        await assertRejects(
            () => store.put('a', { n: 1 }),
            Error, 'nope',
        );
    });

Deno.test('HistoryEntityStore.put writes the validator output',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
            (b) => ({
                n: (b['n'] as number) + 1,
            }),
        );
        const written = await store.put('a', { n: 7 });
        assertStrictEquals(written.n, 8);
        const fetched = await store.getById('a');
        assertStrictEquals(fetched.n, 8);
    });

Deno.test(
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
        assertStrictEquals(
            (await store.getById('a')).n, 1,
        );
        assertStrictEquals(
            (await store.getById('b')).n, 2,
        );
    },
);
