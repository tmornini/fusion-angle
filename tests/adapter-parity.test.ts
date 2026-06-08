import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';
import { createRequestContext }
    from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postObjectiveCreation,
    postObjectiveArchival,
    postObjectiveReactivation,
    getActiveObjectives,
    getArchivedObjectiveIds,
} from '../web-app/app/adapters/objectives.ts';
import type { DbAdapter } from '../api/db.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

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
    deletedIds: Set<string>;
    archivedIds: Set<string>;
}> {
    await seedHumanMember(db, 'current', 'Demo User');
    const ctx = createRequestContext(db, await devToken());
    await postObjectiveCreation(
        ctx, 'o1', 'Rev', 'd', 0,
    );
    await postObjectiveArchival(ctx, 'o1');
    await postObjectiveReactivation(ctx, 'o1');
    return {
        active: await getActiveObjectives(ctx),
        deletedIds: await db.states.deletedIds(),
        archivedIds:
            await getArchivedObjectiveIds(ctx),
    };
}

// The K5 reactivation path executes identically against
// memory and localStorage adapters because they share the
// same EntityStore / HistoryEntityStore / SingletonStore
// / StateStore classes over different StorageBackends.
// This test makes that structural guarantee observable —
// any future drift between the adapters fails here.
test('K5 reactivation parity across memory and localStorage',
    async () => {
        installLocalStorageShim();
        const memDb = new MemoryDbAdapter();
        await seedAdminSchema(memDb);
        const lsDb = new LocalStorageDbAdapter();
        await seedAdminSchema(lsDb);

        const mem = await runReactivationScenario(memDb);
        const ls = await runReactivationScenario(lsDb);

        assert.ok(mem.active.some(o => o.id === 'o1'),
            'memory: o1 returns to active list');
        assert.ok(ls.active.some(o => o.id === 'o1'),
            'localStorage: o1 returns to active list');

        assert.ok(!mem.deletedIds.has('o1'),
            'memory: no deleted state event for o1');
        assert.ok(!ls.deletedIds.has('o1'),
            'localStorage: no deleted state event for o1');

        assert.equal(mem.archivedIds.size, 0,
            'memory: active event supersedes archived');
        assert.equal(ls.archivedIds.size, 0,
            'localStorage: active event supersedes '
            + 'archived');
    });
