import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    validateProjectForApproval,
    validateProjectForCompletion,
    postProjectApproval,
    postProjectCompletion,
} from '../web-app/app/adapters/project-publish.ts';
import {
    getProjectState,
} from '../web-app/app/adapters/state-events.ts';

async function seedCurrentWorker(
    db: MemoryDbAdapter,
): Promise<void> {
    await db.workers.put('current', {
        first_name: 'Demo',
        last_name: 'User',
        email: 'demo@example.com',
        phone: '',
        title: 'Admin',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        bio: '',
        department: 'Product',
    });
}

const SAMPLE_PROJECT_BODY = {
    title: 't',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_cost: 0, actual_cost: 0,
    position: 0,
};

const SAMPLE_PROJECT = {
    id: 'p1', ...SAMPLE_PROJECT_BODY,
};

test('validator: not ready when objectives unscored',
    () => {
        const r = validateProjectForApproval(
            SAMPLE_PROJECT,
            [{ id: 'o1', position: 0 },
             { id: 'o2', position: 1 }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(r.problems.length, 2);
    });

test('validator: ready when all scored', () => {
    const r = validateProjectForApproval(
        SAMPLE_PROJECT,
        [{ id: 'o1', position: 0 }],
        [{ id: 'b1', project_id: 'p1',
           objective_id: 'o1', score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
    );
    assert.equal(r.ready, true);
    assert.equal(r.problems.length, 0);
});

test('completion validator: not ready when actuals missing',
    () => {
        const r = validateProjectForCompletion(
            SAMPLE_PROJECT,
            [{ id: 'b1', project_id: 'p1',
               objective_id: 'o1', score: 50,
               at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        assert.equal(r.ready, false);
        assert.equal(
            r.problems[0]!.kind, 'actual_unscored',
        );
    });

test('postProjectApproval moves state to approved',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        await db.projects.put('p1', SAMPLE_PROJECT_BODY);
        await db.states.record(
            'st-init', 'p1', 'under-review', 'current',
        );
        await db.objectives.put('o1', { position: 0 });
        await db.projectObjectiveBaselineScores.put(
            'b1',
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              at: '2026-05-14T00:00:00.000Z' },
        );
        const ctx = createRequestContext(db);
        await postProjectApproval(ctx, 'p1');
        const s = await getProjectState(ctx, 'p1');
        assert.equal(s, 'approved');
    });

test('postProjectApproval throws when not ready',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        await db.projects.put('p1', SAMPLE_PROJECT_BODY);
        await db.objectives.put('o1', { position: 0 });
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => postProjectApproval(ctx, 'p1'),
            /not ready|unscored/i,
        );
    });

test('postProjectCompletion moves state to completed',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        await db.projects.put('p1', SAMPLE_PROJECT_BODY);
        await db.states.record(
            'st-init', 'p1', 'approved', 'current',
        );
        await db.objectives.put('o1', { position: 0 });
        await db.projectObjectiveBaselineScores.put(
            'b1',
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              at: '2026-05-14T00:00:00.000Z' },
        );
        await db.projectObjectiveActualScores.put(
            'a1',
            { project_id: 'p1', objective_id: 'o1',
              score: 40,
              at: '2026-05-15T00:00:00.000Z' },
        );
        const ctx = createRequestContext(db);
        await postProjectCompletion(ctx, 'p1');
        const s = await getProjectState(ctx, 'p1');
        assert.equal(s, 'completed');
    });
