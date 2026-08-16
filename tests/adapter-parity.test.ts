import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
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
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

test('K5 reactivation on the memory adapter',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(
            db, await devToken(),
        );
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const active = await getActiveObjectives(ctx);
        const archivedIds =
            await getArchivedObjectiveIds(ctx);
        assert.ok(active.some(o => o.id === 'o1'),
            'o1 returns to active list');
        assert.equal(archivedIds.size, 0,
            'active event supersedes archived');
    });
