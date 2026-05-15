import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createLocalStorageAdapter,
} from '../api/db-localstorage.ts';
import { createRequestContext }
    from '../web-app/app/adapters/shared.ts';
import {
    postObjectiveCreation,
    postObjectiveDeprecation,
    postObjectiveReactivation,
    getActiveObjectives,
} from '../web-app/app/adapters/objectives.ts';
import type { DbAdapter } from '../api/db.ts';

function installLocalStorageShim(): void {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(key: string): string | null;
            setItem(
                key: string, value: string,
            ): void;
            removeItem(key: string): void;
        };
    }).localStorage = {
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) { map.set(key, value); },
        removeItem(key) { map.delete(key); },
    };
}

async function runReactivationScenario(db: DbAdapter): Promise<{
    active: { id: string }[];
    tombstoneIds: Set<string>;
    deprecated: { id: string }[];
}> {
    const ctx = createRequestContext(db);
    await postObjectiveCreation(
        ctx, 'o1', 'Rev', 'd', 0,
    );
    await postObjectiveDeprecation(ctx, 'o1');
    await postObjectiveReactivation(ctx, 'o1');
    return {
        active: await getActiveObjectives(ctx),
        tombstoneIds:
            await db.deleted.allDeletedIds(),
        deprecated:
            await db.deprecatedObjectives.getAll(),
    };
}

// The K5 reactivation path executes identically against
// memory and localStorage adapters because they instantiate
// the same EntityStore / HistoryEntityStore / SingletonStore
// / DeletedStore classes over different StorageBackends.
// This test makes that structural guarantee observable —
// any future drift between the adapters fails here.
test('K5 reactivation parity across memory and localStorage',
    async () => {
        installLocalStorageShim();
        const memDb = new MemoryDbAdapter();
        const lsDb = await createLocalStorageAdapter();
        await lsDb.createSchema();

        const mem = await runReactivationScenario(memDb);
        const ls = await runReactivationScenario(lsDb);

        assert.ok(mem.active.some(o => o.id === 'o1'),
            'memory: o1 returns to active list');
        assert.ok(ls.active.some(o => o.id === 'o1'),
            'localStorage: o1 returns to active list');

        assert.ok(!mem.tombstoneIds.has('o1'),
            'memory: no global tombstone for o1');
        assert.ok(!ls.tombstoneIds.has('o1'),
            'localStorage: no global tombstone for o1');

        assert.equal(mem.deprecated.length, 0,
            'memory: deprecation row spliced');
        assert.equal(ls.deprecated.length, 0,
            'localStorage: deprecation row spliced');
    });
