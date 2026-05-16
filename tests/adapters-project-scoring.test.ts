import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getBaselineScoresForProject,
    getActualScoresForProject,
    getProjectScoring,
    getPortfolioImpactSummary,
    getObjectiveAggregates,
    getProjectsScoreColumn,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
} from '../web-app/app/adapters/project-scoring.ts';

test('getBaselineScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.projectObjectiveBaselineScores.put(
            'p2:o1:t1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: -20,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const rows = await getBaselineScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 50);
    });

test('getActualScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveActualScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const rows = await getActualScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
    });

test('getProjectScoring returns both lists',
    async () => {
        const db = new MemoryDbAdapter();
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                scored_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.projectObjectiveActualScores.put(
            'p1:o1:t2',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                scored_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = createRequestContext(db);
        const r = await getProjectScoring(ctx, 'p1');
        assert.equal(r.baseline.length, 1);
        assert.equal(r.actual.length, 1);
        assert.equal(r.baseline[0]!.score, 50);
        assert.equal(r.actual[0]!.score, 33);
    });

async function seedTwoApprovedProjects(
    db: MemoryDbAdapter,
): Promise<void> {
    const projectBody = {
        description: 'd', progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date: '2026-05-14T00:00:00.000Z',
        estimated_duration: 0, actual_duration: 0,
        estimated_cost: 0, actual_cost: 0,
        business_context: '{}',
        timeline_label: 'q1',
    };
    await db.projects.put('p1', {
        ...projectBody,
        title: 't1', position: 0,
    });
    await db.states.record(
        'st-p1', 'p1', 'approved', 'system',
    );
    await db.projects.put('p2', {
        ...projectBody,
        title: 't2', position: 1,
    });
    await db.states.record(
        'st-p2', 'p2', 'approved', 'system',
    );
    await db.objectives.put('o1', { position: 0 });
    await db.objectiveRevisions.put('o1:t0', {
        objective_id: 'o1', name: 'O', description: 'd',
        revised_at: '2026-05-14T00:00:00.000Z',
    });
    await db.projectObjectiveBaselineScores.put(
        'p1:o1:t1',
        {
            project_id: 'p1', objective_id: 'o1',
            score: 60,
            scored_at: '2026-05-14T00:00:00.000Z',
        },
    );
    await db.projectObjectiveBaselineScores.put(
        'p2:o1:t1',
        {
            project_id: 'p2', objective_id: 'o1',
            score: -20,
            scored_at: '2026-05-14T00:00:00.000Z',
        },
    );
}

test('getPortfolioImpactSummary averages project averages',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const r = await getPortfolioImpactSummary(ctx);
        assert.equal(r.projectCount, 2);
        assert.equal(r.baselineMean, 20); // (60 + -20) / 2
    });

test('getObjectiveAggregates returns per-objective rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const rows = await getObjectiveAggregates(ctx);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.objectiveId, 'o1');
        assert.equal(rows[0]!.baselineMean, 20);
        assert.equal(rows[0]!.projectsBaselineScored, 2);
    });

test('getProjectsScoreColumn returns per-project rollup',
    async () => {
        const db = new MemoryDbAdapter();
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db);
        const rows = await getProjectsScoreColumn(ctx);
        const byId = new Map(
            rows.map(r => [r.projectId, r]),
        );
        assert.equal(byId.get('p1')!.baselineAvg, 60);
        assert.equal(byId.get('p2')!.baselineAvg, -20);
    });

test('postProjectBaselineScoring appends event rows',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await postProjectBaselineScoring(ctx, 'p1', [
            { objectiveId: 'o1', score: 50 },
            { objectiveId: 'o2', score: -30 },
        ]);
        const rows =
            await db.projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 2);
    });

test('postProjectActualMeasurement appends actual rows',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await postProjectActualMeasurement(ctx, 'p1', [
            { objectiveId: 'o1', score: 33 },
        ]);
        const rows =
            await db.projectObjectiveActualScores.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
    });
