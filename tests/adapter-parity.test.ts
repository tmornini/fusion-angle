import { assert, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    postObjectiveCreation,
    postObjectiveArchival,
    postObjectiveReactivation,
    getActiveObjectives,
    getArchivedObjectiveIds,
} from '../client/objectives.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

Deno.test('K5 reactivation on the memory adapter',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await postObjectiveCreation(
            ctx, 'ohqxgUBEaFQwYbXsonRPmg', 'Rev', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'ohqxgUBEaFQwYbXsonRPmg');
        await postObjectiveReactivation(ctx, 'ohqxgUBEaFQwYbXsonRPmg');
        const active = await getActiveObjectives(ctx);
        const archivedIds =
            await getArchivedObjectiveIds(ctx);
        assert(active.some(o => o.id === 'ohqxgUBEaFQwYbXsonRPmg'),
            'ohqxgUBEaFQwYbXsonRPmg returns to active list');
        assertStrictEquals(archivedIds.size, 0,
            'active event supersedes archived');
    });
