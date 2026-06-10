import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getBaselineScoresForProject,
    getActualScoresForProject,
    getProjectScoring,
    getPortfolioImpactSummary,
    getObjectiveAggregates,
    getObjectiveTrendlines,
    getProjectsScoreColumn,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
} from '../web-app/app/adapters/project-scoring.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

test('getBaselineScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await db.projectObjectiveBaselineScores.put(
            'p2:o1:t1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: -20,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        const rows = await getBaselineScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 50);
    });

test('getActualScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.projectObjectiveActualScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        const rows = await getActualScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
    });

test('getProjectScoring returns both lists',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await db.projectObjectiveActualScores.put(
            'p1:o1:t2',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
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
        organization_id: '1',
        description: 'd', progress: 0,
        start_date: '2026-05-14',
        target_end_date: '2026-05-14',
        estimated_cost: 0, actual_cost: 0,
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
    await db.objectives.put('o1', {
        organization_id: '1',
        position: 0,
    });
    await db.objectiveRevisions.put('o1:t0', {
        objective_id: 'o1', name: 'O', description: 'd',
        member_id: 'w1',
        at: '2026-05-14T00:00:00.000000Z',
    });
    await db.projectObjectiveBaselineScores.put(
        'p1:o1:t1',
        {
            project_id: 'p1', objective_id: 'o1',
            score: 60,
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        },
    );
    await db.projectObjectiveBaselineScores.put(
        'p2:o1:t1',
        {
            project_id: 'p2', objective_id: 'o1',
            score: -20,
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        },
    );
}

test('getPortfolioImpactSummary averages project averages',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db, await devToken());
        const r = await getPortfolioImpactSummary(ctx);
        assert.equal(r.projectCount, 2);
        assert.equal(r.baselineMean, 20); // (60 + -20) / 2
    });

test('getObjectiveAggregates returns per-objective rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db, await devToken());
        const rows = await getObjectiveAggregates(ctx);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.objectiveId, 'o1');
        assert.equal(rows[0]!.baselineMean, 20);
        assert.equal(rows[0]!.projectsBaselineScored, 2);
    });

test('getProjectsScoreColumn returns per-project rollup',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        const ctx = createRequestContext(db, await devToken());
        const rows = await getProjectsScoreColumn(ctx);
        const byId = new Map(
            rows.map(r => [r.projectId, r]),
        );
        assert.equal(byId.get('p1')!.baselineAvg, 60);
        assert.equal(byId.get('p2')!.baselineAvg, -20);
    });

test(
    'getObjectiveTrendlines: baseline + two actuals',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        await db.projectObjectiveActualScores.put(
            'p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await db.projectObjectiveActualScores.put(
            'p2:o1:a1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: 10,
                member_id: 'w1',
                at: '2026-05-16T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        const trendlines = await getObjectiveTrendlines(
            ctx,
        );
        const points = trendlines.get('o1');
        assert.ok(points, 'o1 trendline must exist');
        assert.deepEqual(
            points.map(p => p.value), [20, 40, 25],
        );
        assert.equal(
            points[0]?.at, '2026-05-14T00:00:00.000000Z',
        );
        assert.equal(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
        assert.equal(
            points[2]?.at, '2026-05-16T00:00:00.000000Z',
        );
        // baselineMean = (60 + -20) / 2 = 20
        // after t1 (p1=40 only):        40
        // after t2 (p1=40, p2=10):      (40 + 10) / 2 = 25
    },
);

test(
    'getObjectiveTrendlines: baseline + one actual',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        await db.projectObjectiveActualScores.put(
            'p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        const trendlines = await getObjectiveTrendlines(
            ctx,
        );
        const points = trendlines.get('o1');
        assert.ok(points, 'o1 trendline must exist');
        assert.deepEqual(
            points.map(p => p.value), [20, 40],
        );
        assert.equal(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
    },
);

test(
    'getObjectiveTrendlines: same-at batch is one point',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedTwoApprovedProjects(db);
        await db.projectObjectiveActualScores.put(
            'p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await db.projectObjectiveActualScores.put(
            'p2:o1:a1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: 10,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const ctx = createRequestContext(db, await devToken());
        const trendlines = await getObjectiveTrendlines(
            ctx,
        );
        const points = trendlines.get('o1');
        assert.ok(points, 'o1 trendline must exist');
        assert.deepEqual(
            points.map(p => p.value), [20, 25],
        );
        assert.equal(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
    },
);

test(
    'getObjectiveTrendlines: no baseline returns empty',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectives.put('o1', {
            organization_id: '1',
            position: 0,
        });
        await db.objectiveRevisions.put('o1:t0', {
            objective_id: 'o1',
            name: 'O', description: 'd',
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        });
        const ctx = createRequestContext(db, await devToken());
        const trendlines = await getObjectiveTrendlines(
            ctx,
        );
        assert.deepEqual(trendlines.get('o1'), []);
    },
);

test('postProjectBaselineScoring appends event rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        await postProjectBaselineScoring(ctx, 'p1', [
            { objectiveId: 'o1', score: 50 },
            { objectiveId: 'o2', score: -30 },
        ]);
        const rows =
            await db.projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 2);
        for (const r of rows) {
            assert.equal(r.member_id, 'current');
        }
    });

test('postProjectActualMeasurement appends actual rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        await postProjectActualMeasurement(ctx, 'p1', [
            { objectiveId: 'o1', score: 33 },
        ]);
        const rows =
            await db.projectObjectiveActualScores.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
        assert.equal(rows[0]!.member_id, 'current');
    });
