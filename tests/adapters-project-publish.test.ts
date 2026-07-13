import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
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

test('validator: not ready when objectives unscored',
    () => {
        const r = validateProjectForApproval(
            [{ id: 'o1', position: 0 },
             { id: 'o2', position: 1 }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(r.problems.length, 2);
    });

test('validator: ready when all scored', () => {
    const r = validateProjectForApproval(
        [{ id: 'o1', position: 0 }],
        [{ id: 'b1', projectId: 'p1',
           objectiveId: 'o1', score: 50,
           memberId: 'w1',
           at: '2026-05-14T00:00:00.000000Z' }],
    );
    assert.equal(r.ready, true);
    assert.equal(r.problems.length, 0);
});

test('archival validator: not ready when actuals missing',
    () => {
        const r = validateProjectForArchival(
            [{ id: 'b1', projectId: 'p1',
               objectiveId: 'o1', score: 50,
               memberId: 'w1',
               at: '2026-05-14T00:00:00.000000Z' }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(
            r.problems[0]!.kind, 'actual_unscored',
        );
    });

test('postProjectApproval moves state to approved',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await devToken());
        // Seeded through the live document PUT (not a raw
        // db.projects.put + db.states.postEvent) so p1's
        // message pair exists — postProjectApproval /
        // postProjectArchival gate on the flipped GET
        // projects/:id existence check (Phase 3 Task 6).
        await putProject(ctx, 'p1', {
            ...SAMPLE_PROJECT_BODY,
            state: 'under_review',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-init',
        });
        // The objective and its baseline score are seeded the
        // SAME wire-reachable way (Phase 7 Task 7) — a raw
        // db.objectives.put/db.projectObjectiveBaselineScores.put
        // leaves no pair at these addresses, and
        // validateProjectForApproval now reads them through the
        // flipped GET objectives / GET projects/:id/objective-
        // baseline-scores routes.
        await ctx.PUT('objectives/o1', {
            position: 0,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'o1-genesis',
        });
        await ctx.PUT(
            'projects/p1/objective-baseline-scores/b1',
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              member_id: 'w1',
              at: '2026-05-14T00:00:00.000000Z' },
        );
        await postProjectApproval(ctx, 'p1');
        const row = await getProjectEntity(ctx, 'p1');
        assert.equal(row.state, 'approved');
    });

test('postProjectApproval throws when not ready',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await devToken());
        // A SYNTHESIZED trio (this fixture never carried one) —
        // the state itself is irrelevant to this test.
        await putProject(ctx, 'p1', {
            ...SAMPLE_PROJECT_BODY,
            state: 'under_review',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-init',
        });
        await ctx.PUT('objectives/o1', {
            position: 0,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'o1-genesis',
        });
        await assert.rejects(
            () => postProjectApproval(ctx, 'p1'),
            /not ready|unscored/i,
        );
    });

test('postProjectArchival moves state to archived',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = createRequestContext(db, await devToken());
        await putProject(ctx, 'p1', {
            ...SAMPLE_PROJECT_BODY,
            state: 'approved',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-init',
        });
        await ctx.PUT('objectives/o1', {
            position: 0,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'o1-genesis',
        });
        await ctx.PUT(
            'projects/p1/objective-baseline-scores/b1',
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              member_id: 'w1',
              at: '2026-05-14T00:00:00.000000Z' },
        );
        await ctx.PUT(
            'projects/p1/objective-actual-scores/a1',
            { project_id: 'p1', objective_id: 'o1',
              score: 40,
              member_id: 'w1',
              at: '2026-05-15T00:00:00.000000Z' },
        );
        await postProjectArchival(ctx, 'p1');
        const row = await getProjectEntity(ctx, 'p1');
        assert.equal(row.state, 'archived');
    });
