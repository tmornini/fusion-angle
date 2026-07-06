import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    postMockDataLoad,
    OBJECTIVE_SEEDS,
} from '../api/mock-data.ts';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from '../api/validators.ts';
import { createRequestContext }
    from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getArchivedObjectiveIds,
} from '../web-app/app/adapters/objectives.ts';
import { getProjectStates } from
    '../web-app/app/adapters/state-events.ts';
import type { Id, ProjectState } from
    '../api/types.ts';
import type { RequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function projectIdsByState(
    ctx: RequestContext,
    wanted: ProjectState,
): Promise<Id[]> {
    const states = await getProjectStates(ctx);
    return [...states]
        .filter(([, state]) => state === wanted)
        .map(([id]) => id);
}

test('seeds every objective seed plus the org-2 objective',
async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await postMockDataLoad(db);
    const rows = await db.objectives.getAll();
    assert.equal(rows.length, OBJECTIVE_SEEDS.length + 1);
    for (const r of rows) {
        const { id: _id, ...body } = r;
        validateObjectiveEntity(body);
    }
});

test('postMockDataLoad seeds one revision per objective',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await postMockDataLoad(db);
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, OBJECTIVE_SEEDS.length + 1);
        for (const r of revs) {
            const { id: _id, ...body } = r;
            validateObjectiveRevisionEntity(body);
        }
        const objs = await db.objectives.getAll();
        const objIds = new Set(objs.map(o => o.id));
        const revObjIds = new Set(
            revs.map(r => r.objective_id),
        );
        assert.deepEqual(revObjIds, objIds);
    });

test('postMockDataLoad seeds zero archived objectives',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await postMockDataLoad(db);
        const ctx = createRequestContext(db, await devToken());
        const ids = await getArchivedObjectiveIds(ctx);
        assert.equal(ids.size, 0);
    });

test('approved projects have full baseline coverage',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await postMockDataLoad(db);
        const ctx = createRequestContext(db, await devToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert.ok(
            approved.length > 0,
            'seed has approved projects',
        );
        // Coverage is per-org since SP-6: an approved project
        // is scored against the objectives in ITS org, not the
        // global set.
        const objectives = await db.objectives.getAll();
        const organizationByProject = new Map(
            (await db.projects.getAll())
                .map(p => [p.id, p.organization_id]));
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        for (const pid of approved) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === pid)
                    .map(b => b.objective_id),
            );
            const organizationObjCount = objectives.filter(
                o => o.organization_id
                    === organizationByProject.get(pid)).length;
            assert.equal(
                pairs.size,
                organizationObjCount,
                `project ${pid} missing coverage`,
            );
        }
    });

test('completed projects have at least one actual per pair',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await postMockDataLoad(db);
        const ctx = createRequestContext(db, await devToken());
        const completed = await projectIdsByState(
            ctx, 'archived',
        );
        assert.ok(
            completed.length > 0,
            'seed has archived projects',
        );
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        const allActuals = await
            db.projectObjectiveActualScores.getAll();
        for (const pid of completed) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === pid)
                    .map(b => b.objective_id),
            );
            const actualPairs = new Set(
                allActuals
                    .filter(a => a.project_id === pid)
                    .map(a => a.objective_id),
            );
            for (const pair of pairs) {
                assert.ok(
                    actualPairs.has(pair),
                    `project ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('approved projects have an actual for every pair',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await postMockDataLoad(db);
        const ctx = createRequestContext(db, await devToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert.ok(
            approved.length > 0,
            'seed has approved projects',
        );
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        const allActuals = await
            db.projectObjectiveActualScores.getAll();
        for (const pid of approved) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === pid)
                    .map(b => b.objective_id),
            );
            const actualPairs = new Set(
                allActuals
                    .filter(a => a.project_id === pid)
                    .map(a => a.objective_id),
            );
            for (const pair of pairs) {
                assert.ok(
                    actualPairs.has(pair),
                    `approved ${pid} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('submitted projects have zero scores', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await postMockDataLoad(db);
    const ctx = createRequestContext(db, await devToken());
    const submitted = await projectIdsByState(
        ctx, 'submitted',
    );
    assert.ok(
        submitted.length > 0,
        'seed has submitted projects',
    );
    const allBaselines = await
        db.projectObjectiveBaselineScores.getAll();
    for (const pid of submitted) {
        const baselines = allBaselines.filter(
            b => b.project_id === pid,
        );
        assert.equal(baselines.length, 0);
    }
});

// Phase 7 Task 5's STANDING content pins: the id-only fingerprint
// (tests/mock-data-fingerprint.test.ts) hashes row ids ONLY —
// member_id never enters it — so a regression in the author pick
// (buildSeedScoreRows's pickHumanMember over a pre-tx pool,
// replacing the old in-tx memberFor DB-read) would pass every
// existing check yet silently hand out the WRONG author. Both
// literals below were read from the PRE-hoist seed (memberFor's
// own picks, recorded before api/mock-data/scores.ts existed) —
// the k-suffix divergence guard: omitting the actual's `:${k}`
// per-index suffix reproduces only 24 of 92 actual authors
// correctly, invisibly to every other test in this suite.
test('a seeded baseline score\'s author matches the pinned'
+ ' pre-hoist pick', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await postMockDataLoad(db);
    const baselines = await
        db.projectObjectiveBaselineScores.getAll();
    const row = baselines.find(
        b => b.project_id === 'u6YkHhlGc91oDMkr3x0isa'
            && b.objective_id === 'JkW7aEqFdX3nOiPtVhMrCy',
    );
    assert.ok(row, 'no baseline row for the pinned pair');
    assert.equal(row!.member_id, 'current');
});

test('a seeded actual-score triple\'s per-index authors match'
+ ' the pinned pre-hoist picks', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await postMockDataLoad(db);
    const actuals = await
        db.projectObjectiveActualScores.getAll();
    const rows = actuals
        .filter(
            a => a.project_id === 'jRE2Tj32NHsFGZIeEADp0p'
                && a.objective_id === 'RgT2mNvKpQ8xLsYwBzHcUe',
        )
        .sort((a, b) => a.at.localeCompare(b.at));
    assert.equal(rows.length, 3);
    // Sorted by `at` ascending resolves the per-actual index
    // k = 0, 1, 2 (buildSeedScoreRows mints each k's scoredAt
    // strictly increasing within a (project, objective) pair).
    assert.deepEqual(
        rows.map(r => r.member_id),
        [
            '53J8h9dr76XFqCjYcNVwIR',
            'WxQn4LVWb76YkmqK5B0EPp',
            'Trf1Up2jMsPhEnjbW4Ji1n',
        ],
    );
});
