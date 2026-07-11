import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getBaselineScoresForProject,
    getActualScoresForProject,
    getProjectScoring,
    getPortfolioImpactSummary,
    getObjectiveScoringInputs,
    buildObjectiveAggregates,
    buildObjectiveTrendlines,
    getProjectsScoreColumn,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
} from '../web-app/app/adapters/project-scoring.ts';
import { putProject } from '../web-app/app/adapters/projects.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

test('getBaselineScoresForProject returns project rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await ctx.PUT(
            'projects/p1/objective-baseline-scores/p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'projects/p2/objective-baseline-scores/p2:o1:t1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: -20,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
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
        const ctx = createRequestContext(db, await devToken());
        await ctx.PUT(
            'projects/p1/objective-actual-scores/p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
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
        const ctx = createRequestContext(db, await devToken());
        await ctx.PUT(
            'projects/p1/objective-baseline-scores/p1:o1:t1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 50,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'projects/p1/objective-actual-scores/p1:o1:t2',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 33,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const r = await getProjectScoring(ctx, 'p1');
        assert.equal(r.baseline.length, 1);
        assert.equal(r.actual.length, 1);
        assert.equal(r.baseline[0]!.score, 50);
        assert.equal(r.actual[0]!.score, 33);
    });

// Seeds both projects through the SAME document PUT the live
// route uses (putProject), so a message pair exists at each
// project's address — required for the flipped GET projects
// route (Phase 3 Task 6), which getPortfolioImpactSummary /
// getObjectiveScoringInputs / getProjectsScoreColumn read, to
// derive them. The objective, its revision, and both baseline
// scores are seeded the SAME wire-reachable way (Phase 7
// Task 7) — a raw db.objectives.put/db.projectObjective
// BaselineScores.put leaves no pair at these addresses, and the
// flipped GET objectives / GET projects/:id/objective-baseline-
// scores routes now derive from the ledger, not the old tables.
async function seedTwoApprovedProjects(
    db: MemoryDbAdapter,
    ctx: RequestContext,
): Promise<void> {
    const projectBody = {
        description: 'd', progress: 0,
        start_date: '2026-05-14',
        target_end_date: '2026-05-14',
        estimated_cost: 0, actual_cost: 0,
    };
    await putProject(ctx, 'p1', {
        ...projectBody,
        title: 't1', position: 0,
        state: 'approved',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'st-p1',
    });
    await putProject(ctx, 'p2', {
        ...projectBody,
        title: 't2', position: 1,
        state: 'approved',
        stateAt: '2026-01-01T00:00:01.000000Z',
        stateEventId: 'st-p2',
    });
    await ctx.PUT('objectives/o1', {
        position: 0,
        state: 'active',
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'o1-genesis',
    });
    await ctx.PUT('objectives/o1/revisions/o1:t0', {
        objective_id: 'o1', name: 'O', description: 'd',
        member_id: 'w1',
        at: '2026-05-14T00:00:00.000000Z',
    });
    await ctx.PUT(
        'projects/p1/objective-baseline-scores/p1:o1:t1',
        {
            project_id: 'p1', objective_id: 'o1',
            score: 60,
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        },
    );
    await ctx.PUT(
        'projects/p2/objective-baseline-scores/p2:o1:t1',
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
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        const r = await getPortfolioImpactSummary(ctx);
        assert.equal(r.projectCount, 2);
        assert.equal(r.baselineMean, 20); // (60 + -20) / 2
    });

test('buildObjectiveAggregates returns per-objective rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        const rows = buildObjectiveAggregates(
            await getObjectiveScoringInputs(ctx),
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.objectiveId, 'o1');
        assert.equal(rows[0]!.baselineMean, 20);
        assert.equal(rows[0]!.projectsBaselineScored, 2);
    });

test('getProjectsScoreColumn returns per-project rollup',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        const rows = await getProjectsScoreColumn(ctx);
        const byId = new Map(
            rows.map(r => [r.projectId, r]),
        );
        assert.equal(byId.get('p1')!.baselineAvg, 60);
        assert.equal(byId.get('p2')!.baselineAvg, -20);
    });

test(
    'buildObjectiveTrendlines: baseline + two actuals',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'projects/p1/objective-actual-scores/p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'projects/p2/objective-actual-scores/p2:o1:a1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: 10,
                member_id: 'w1',
                at: '2026-05-16T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
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
    'buildObjectiveTrendlines: baseline + one actual',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'projects/p1/objective-actual-scores/p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
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
    'buildObjectiveTrendlines: same-at batch is one point',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'projects/p1/objective-actual-scores/p1:o1:a1',
            {
                project_id: 'p1', objective_id: 'o1',
                score: 40,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'projects/p2/objective-actual-scores/p2:o1:a1',
            {
                project_id: 'p2', objective_id: 'o1',
                score: 10,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
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
    'buildObjectiveTrendlines: no baseline returns empty',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        await ctx.PUT('objectives/o1', {
            position: 0,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'o1-genesis',
        });
        await ctx.PUT('objectives/o1/revisions/o1:t0', {
            objective_id: 'o1',
            name: 'O', description: 'd',
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        });
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
        );
        assert.deepEqual(trendlines.get('o1'), []);
    },
);

test('postProjectBaselineScoring appends via GET scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        await postProjectBaselineScoring(ctx, 'p1', [
            { objectiveId: 'o1', score: 50 },
            { objectiveId: 'o2', score: -30 },
        ]);
        // Phase Final Task 2: score row half stripped —
        // adapter read derives from the pair plane.
        const rows = await getBaselineScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 2);
        for (const r of rows) {
            assert.equal(r.memberId, 'current');
        }
    });

test('postProjectActualMeasurement appends via GET scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        await postProjectActualMeasurement(ctx, 'p1', [
            { objectiveId: 'o1', score: 33 },
        ]);
        const rows = await getActualScoresForProject(
            ctx, 'p1',
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.score, 33);
        assert.equal(rows[0]!.memberId, 'current');
    });
