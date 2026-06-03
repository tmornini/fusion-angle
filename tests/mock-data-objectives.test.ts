import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
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

async function projectIdsByState(
    ctx: RequestContext,
    wanted: ProjectState,
): Promise<Id[]> {
    const states = await getProjectStates(ctx);
    return [...states]
        .filter(([, state]) => state === wanted)
        .map(([id]) => id);
}

test('populateMockData seeds 4 objectives', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateMockData(db);
    const rows = await db.objectives.getAll();
    assert.equal(rows.length, 4);
    for (const r of rows) {
        const { id: _id, ...body } = r;
        validateObjectiveEntity(body);
    }
});

test('populateMockData seeds one revision per objective',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 4);
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

test('populateMockData seeds zero archived objectives',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
        const ids = await getArchivedObjectiveIds(ctx);
        assert.equal(ids.size, 0);
    });

test('approved projects have full baseline coverage',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
        const approved = await projectIdsByState(
            ctx, 'approved',
        );
        assert.ok(
            approved.length > 0,
            'seed has approved projects',
        );
        const objCount =
            (await db.objectives.getAll()).length;
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        for (const pid of approved) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === pid)
                    .map(b => b.objective_id),
            );
            assert.equal(
                pairs.size,
                objCount,
                `project ${pid} missing coverage`,
            );
        }
    });

test('completed projects have at least one actual per pair',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
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
        await db.createSchema();
        await populateMockData(db);
        const ctx = createRequestContext(db, devToken());
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
    await db.createSchema();
    await populateMockData(db);
    const ctx = createRequestContext(db, devToken());
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
