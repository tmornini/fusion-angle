import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

Deno.test('getBaselineScoresForProject returns project rows',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 50,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'prBESZPjJDiuXCeZLmbiVw/objective-baseline-scores/'
                + generateIdentifier(),
            {
                project_id: 'prBESZPjJDiuXCeZLmbiVw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: -20,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        const rows = await getBaselineScoresForProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.score, 50);
    });

Deno.test('getActualScoresForProject returns project rows',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 33,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        const rows = await getActualScoresForProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.score, 33);
    });

Deno.test('getProjectScoring returns both lists',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 50,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 33,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const r = await getProjectScoring(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(r.baseline.length, 1);
        assertStrictEquals(r.actual.length, 1);
        assertStrictEquals(r.baseline[0]!.score, 50);
        assertStrictEquals(r.actual[0]!.score, 33);
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
// flipped GET objectives / GET
// organizations/:id/projects/:id/objective-baseline-
// scores routes now derive from the ledger, not the old tables.
async function seedTwoApprovedProjects(
    _db: MemoryDbAdapter,
    ctx: RequestContext,
): Promise<void> {
    const projectBody = {
        description: 'd', progress: 0,
        start_date: '2026-05-14',
        target_end_date: '2026-05-14',
        estimated_cost: 0, actual_cost: 0,
    };
    await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
        ...projectBody,
        title: 't1', position: 0,
        state: 'approved',
    });
    await putProject(ctx, 'prBESZPjJDiuXCeZLmbiVw', {
        ...projectBody,
        title: 't2', position: 1,
        state: 'approved',
    });
    await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
        + 'ohqxgUBEaFQwYbXsonRPmg', {
        position: 0,
        state: 'active',
    });
    await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
        + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
        + generateIdentifier(), {
        objective_id: 'ohqxgUBEaFQwYbXsonRPmg', name: 'O', description: 'd',
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'projects/pnXmXrxOWayANgDLdCjuBw/'
            + 'objective-baseline-scores/'
            + generateIdentifier(),
        {
            project_id: 'pnXmXrxOWayANgDLdCjuBw'
                , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
            score: 60,
            member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-05-14T00:00:00.000000Z',
        },
    );
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'projects/prBESZPjJDiuXCeZLmbiVw/'
            + 'objective-baseline-scores/'
            + generateIdentifier(),
        {
            project_id: 'prBESZPjJDiuXCeZLmbiVw'
                , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
            score: -20,
            member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-05-14T00:00:00.000000Z',
        },
    );
}

Deno.test('getPortfolioImpactSummary averages project averages',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        const r = await getPortfolioImpactSummary(ctx);
        assertStrictEquals(r.projectCount, 2);
        assertStrictEquals(r.baselineMean, 20); // (60 + -20) / 2
    });

Deno.test('buildObjectiveAggregates returns per-objective rows',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        const rows = buildObjectiveAggregates(
            await getObjectiveScoringInputs(ctx),
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.objectiveId, 'ohqxgUBEaFQwYbXsonRPmg');
        assertStrictEquals(rows[0]!.baselineMean, 20);
        assertStrictEquals(rows[0]!.projectsBaselineScored, 2);
    });

Deno.test('getProjectsScoreColumn returns per-project rollup',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        const rows = await getProjectsScoreColumn(ctx);
        const byId = new Map(
            rows.map(r => [r.projectId, r]),
        );
        assertStrictEquals(
            byId.get('pnXmXrxOWayANgDLdCjuBw')!.baselineAvg, 60,
        );
        assertStrictEquals(
            byId.get('prBESZPjJDiuXCeZLmbiVw')!.baselineAvg, -20,
        );
    });

Deno.test(
    'buildObjectiveTrendlines: baseline + two actuals',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 40,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'prBESZPjJDiuXCeZLmbiVw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'prBESZPjJDiuXCeZLmbiVw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 10,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-16T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
        );
        const points = trendlines.get('ohqxgUBEaFQwYbXsonRPmg');
        assert(points, 'ohqxgUBEaFQwYbXsonRPmg trendline must exist');
        assertEquals(
            points.map(p => p.value), [20, 40, 25],
        );
        assertStrictEquals(
            points[0]?.at, '2026-05-14T00:00:00.000000Z',
        );
        assertStrictEquals(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
        assertStrictEquals(
            points[2]?.at, '2026-05-16T00:00:00.000000Z',
        );
        // baselineMean = (60 + -20) / 2 = 20
        // after t1 (pnXmXrxOWayANgDLdCjuBw=40 only):        40
        // after t2 (pnXmXrxOWayANgDLdCjuBw=40, prBESZPjJDiuXCeZLmbiVw=10):
        // (40 + 10) / 2 = 25
    },
);

Deno.test(
    'buildObjectiveTrendlines: baseline + one actual',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 40,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
        );
        const points = trendlines.get('ohqxgUBEaFQwYbXsonRPmg');
        assert(points, 'ohqxgUBEaFQwYbXsonRPmg trendline must exist');
        assertEquals(
            points.map(p => p.value), [20, 40],
        );
        assertStrictEquals(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
    },
);

Deno.test(
    'buildObjectiveTrendlines: same-at batch is one point',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await seedTwoApprovedProjects(db, ctx);
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 40,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'prBESZPjJDiuXCeZLmbiVw/objective-actual-scores/'
                + generateIdentifier(),
            {
                project_id: 'prBESZPjJDiuXCeZLmbiVw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 10,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
        );
        const points = trendlines.get('ohqxgUBEaFQwYbXsonRPmg');
        assert(points, 'ohqxgUBEaFQwYbXsonRPmg trendline must exist');
        assertEquals(
            points.map(p => p.value), [20, 25],
        );
        assertStrictEquals(
            points[1]?.at, '2026-05-15T00:00:00.000000Z',
        );
    },
);

Deno.test(
    'buildObjectiveTrendlines: no baseline returns empty',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await organizationToken());
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', {
            position: 0,
            state: 'active',
        });
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
        + generateIdentifier(), {
            objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
            name: 'O', description: 'd',
            member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-05-14T00:00:00.000000Z',
        });
        const trendlines = buildObjectiveTrendlines(
            await getObjectiveScoringInputs(ctx),
        );
        assertEquals(trendlines.get('ohqxgUBEaFQwYbXsonRPmg'), []);
    },
);

Deno.test('postProjectBaselineScoring appends via GET scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        await postProjectBaselineScoring(ctx, 'pnXmXrxOWayANgDLdCjuBw', [
            { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 50 },
            { objectiveId: generateIdentifier(), score: -30 },
        ]);
        // Phase Final Task 2: score row half stripped —
        // adapter read derives from the message plane.
        const rows = await getBaselineScoresForProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 2);
        for (const r of rows) {
            assertStrictEquals(r.memberId, 'XXZruirZyAOoRpNxaDnpSA');
        }
    });

// Multi-score concurrent PUT: three rows land with
// distinct ids and one shared `at` (minted once before
// the fan-out).
Deno.test(
    'postProjectBaselineScoring lands 3 rows with'
    + ' distinct ids and one shared at',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        await postProjectBaselineScoring(ctx, 'pnXmXrxOWayANgDLdCjuBw', [
            { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 10 },
            { objectiveId: generateIdentifier(), score: 20 },
            { objectiveId: generateIdentifier(), score: 30 },
        ]);
        const rows = await getBaselineScoresForProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 3);
        const ids = new Set(rows.map(r => r.id));
        assertStrictEquals(ids.size, 3);
        const ats = new Set(rows.map(r => r.at));
        assertStrictEquals(ats.size, 1);
    },
);

Deno.test('postProjectActualMeasurement appends via GET scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        await postProjectActualMeasurement(ctx, 'pnXmXrxOWayANgDLdCjuBw', [
            { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg', score: 33 },
        ]);
        const rows = await getActualScoresForProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.score, 33);
        assertStrictEquals(rows[0]!.memberId, 'XXZruirZyAOoRpNxaDnpSA');
    });
