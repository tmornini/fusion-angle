import {
    assertEquals, assertRejects, assertStrictEquals,
} from '@std/assert';
import { HistoryEntityStore }
    from '../api/store-history-entity.ts';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { backendRunner } from '../api/db.ts';

interface Thing { id: string; n: number }

async function primedBackend(): Promise<MemoryStorageBackend> {
    const backend = new MemoryStorageBackend();
    await backend.ensureTable();
    return backend;
}

Deno.test('HistoryEntityStore.append invokes the validator',
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
        await store.append('a', { n: 7 });
        assertEquals(seen, { n: 7 });
    });

Deno.test('HistoryEntityStore.append rethrows validator errors',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
            () => { throw new Error('nope'); },
        );
        await assertRejects(
            () => store.append('a', { n: 1 }),
            Error, 'nope',
        );
    });

Deno.test('HistoryEntityStore.append writes the validator output',
    async () => {
        const backend = await primedBackend();
        const store = new HistoryEntityStore<Thing>(
            'things', backendRunner(backend),
            (b) => ({
                n: (b['n'] as number) + 1,
            }),
        );
        assertStrictEquals(
            await store.append('a', { n: 7 }), true,
        );
        const fetched = await store.getById('a');
        assertStrictEquals(fetched.n, 8);
    });
