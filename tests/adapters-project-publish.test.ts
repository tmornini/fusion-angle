import {
    assertMatch,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    validateProjectForApproval,
    validateProjectForArchival,
    postProjectApproval,
    postProjectArchival,
} from '../web-app/app/adapters/project-publish.ts';
import {
    getProjectEntity,
    putProject,
} from '../web-app/app/adapters/projects.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// organization_id EXCLUDED — the client never supplies it (the
// org fence stamps it downstream); see ProjectDocumentFields.
const SAMPLE_PROJECT_BODY = {
    title: 't',
    description: 'd', progress: 0,
    start_date: '2026-05-14',
    target_end_date: '2026-05-14',
    estimated_cost: 0, actual_cost: 0,
    position: 0,
};

Deno.test('validator: not ready when objectives unscored',
    () => {
        const r = validateProjectForApproval(
            [
                {
                    id: 'ohqxgUBEaFQwYbXsonRPmg',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    position: 0,
                    state: 'active',
                },
                {
                    id: generateIdentifier(),
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    position: 1,
                    state: 'active',
                },
            ],
            [],
        );
        assertStrictEquals(r.ready, false);
        assertStrictEquals(r.problems.length, 2);
    });

Deno.test('validator: ready when all scored', () => {
    const r = validateProjectForApproval(
        [{
            id: 'ohqxgUBEaFQwYbXsonRPmg',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            position: 0,
            state: 'active',
        }],
        [{ id: generateIdentifier(),
           projectId: 'pnXmXrxOWayANgDLdCjuBw',
           objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 50,
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           at: '2026-05-14T00:00:00.000000Z' }],
    );
    assertStrictEquals(r.ready, true);
    assertStrictEquals(r.problems.length, 0);
});

Deno.test('archival validator: not ready when actuals missing',
    () => {
        const r = validateProjectForArchival(
            [{ id: generateIdentifier(),
               projectId: 'pnXmXrxOWayANgDLdCjuBw',
               objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 50,
               memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
               at: '2026-05-14T00:00:00.000000Z' }],
            [],
        );
        assertStrictEquals(r.ready, false);
        assertStrictEquals(
            r.problems[0]!.kind, 'actual_unscored',
        );
    });

Deno.test('postProjectApproval moves state to approved',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        // Seeded through the live document PUT (not a raw
        // db.projects.put + db.states.postEvent) so pnXmXrxOWayANgDLdCjuBw's
        // message pair exists — postProjectApproval /
        // postProjectArchival gate on the flipped GET
        // organizations/:id/projects/:id existence check (Phase 3 Task 6).
        await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
            ...SAMPLE_PROJECT_BODY,
            state: 'under_review',
        });
        // The objective and its baseline score are seeded the
        // SAME wire-reachable way (Phase 7 Task 7) — a raw
        // db.objectives.put/db.projectObjectiveBaselineScores.put
        // leaves no pair at these addresses, and
        // validateProjectForApproval now reads them through the
        // flipped GET objectives / GET
        // organizations/:id/projects/:id/objective-
        // baseline-scores routes.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', {
            position: 0,
            state: 'active',
        });
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
                + generateIdentifier(),
            { project_id: 'pnXmXrxOWayANgDLdCjuBw'
                , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50,
              member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
              at: '2026-05-14T00:00:00.000000Z' },
        );
        await postProjectApproval(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        const row = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(row.state, 'approved');
    });

Deno.test('postProjectApproval throws when not ready',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        // A SYNTHESIZED trio (this fixture never carried one) —
        // the state itself is irrelevant to this test.
        await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
            ...SAMPLE_PROJECT_BODY,
            state: 'under_review',
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', {
            position: 0,
            state: 'active',
        });
        const err = await assertRejects(
            () => postProjectApproval(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
        ) as Error;
        assertMatch(err.message, /not ready|unscored/i);
    });

Deno.test('postProjectArchival moves state to archived',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await organizationToken());
        await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
            ...SAMPLE_PROJECT_BODY,
            state: 'approved',
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', {
            position: 0,
            state: 'active',
        });
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
                + generateIdentifier(),
            { project_id: 'pnXmXrxOWayANgDLdCjuBw'
                , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50,
              member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
              at: '2026-05-14T00:00:00.000000Z' },
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + 'UQTJZvCoKlFjEoDlDUwekw',
            { project_id: 'pnXmXrxOWayANgDLdCjuBw'
                , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 40,
              member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
              at: '2026-05-15T00:00:00.000000Z' },
        );
        await postProjectArchival(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        const row = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(row.state, 'archived');
    });
