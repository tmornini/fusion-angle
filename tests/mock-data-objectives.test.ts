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
import {
    getArchivedObjectiveIds,
} from '../web-app/app/adapters/objectives.ts';

test('populateMockData seeds 4 objectives', async () => {
    const db = new MemoryDbAdapter();
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
        await populateMockData(db);
        const ctx = createRequestContext(db);
        const ids = await getArchivedObjectiveIds(ctx);
        assert.equal(ids.size, 0);
    });

test('approved projects have full baseline coverage',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const projects = await db.projects.getAll();
        const approved = projects.filter(
            p => p.status === 'approved',
        );
        const objCount =
            (await db.objectives.getAll()).length;
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        for (const p of approved) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === p.id)
                    .map(b => b.objective_id),
            );
            assert.equal(
                pairs.size,
                objCount,
                `project ${p.id} missing coverage`,
            );
        }
    });

test('completed projects have at least one actual per pair',
    async () => {
        const db = new MemoryDbAdapter();
        await populateMockData(db);
        const projects = await db.projects.getAll();
        const completed = projects.filter(
            p => p.status === 'completed',
        );
        const allBaselines = await
            db.projectObjectiveBaselineScores.getAll();
        const allActuals = await
            db.projectObjectiveActualScores.getAll();
        for (const p of completed) {
            const pairs = new Set(
                allBaselines
                    .filter(b => b.project_id === p.id)
                    .map(b => b.objective_id),
            );
            const actualPairs = new Set(
                allActuals
                    .filter(a => a.project_id === p.id)
                    .map(a => a.objective_id),
            );
            for (const pair of pairs) {
                assert.ok(
                    actualPairs.has(pair),
                    `project ${p.id} missing `
                        + `actual for ${pair}`,
                );
            }
        }
    });

test('submitted projects have zero scores', async () => {
    const db = new MemoryDbAdapter();
    await populateMockData(db);
    const projects = await db.projects.getAll();
    const submitted = projects.filter(
        p => p.status === 'submitted',
    );
    const allBaselines = await
        db.projectObjectiveBaselineScores.getAll();
    for (const p of submitted) {
        const baselines = allBaselines.filter(
            b => b.project_id === p.id,
        );
        assert.equal(baselines.length, 0);
    }
});
