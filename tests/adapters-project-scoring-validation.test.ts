import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postProjectBaselineScoring,
    postProjectActualMeasurement,
} from
    '../web-app/app/adapters/project-scoring.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const AT = '2026-05-20T00:00:00.000000Z';
const VALID: ReadonlyArray<number> = [-100, 0, 100];
const INVALID: ReadonlyArray<number> = [-101, 101, 106];
const RANGE_MSG = /expected integer in \[-100, \+100\]/;

test('baseline store.put accepts valid boundary scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        for (const score of VALID) {
            await db.projectObjectiveBaselineScores.put(
                `p:o:${score}`,
                {
                    project_id: 'p', objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                },
            );
        }
        const rows = await db
            .projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, VALID.length);
    });

test('baseline store.put rejects out-of-range scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        for (const score of INVALID) {
            await assert.rejects(
                () => db.projectObjectiveBaselineScores
                    .put(
                        `p:o:${score}`,
                        {
                            project_id: 'p',
                            objective_id: 'o',
                            score, member_id: 'w1', at: AT,
                        },
                    ),
                RANGE_MSG,
            );
        }
        const rows = await db
            .projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 0);
    });

test('actual store.put accepts valid boundary scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        for (const score of VALID) {
            await db.projectObjectiveActualScores.put(
                `p:o:${score}`,
                {
                    project_id: 'p', objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                },
            );
        }
        const rows = await db
            .projectObjectiveActualScores.getAll();
        assert.equal(rows.length, VALID.length);
    });

test('actual store.put rejects out-of-range scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        for (const score of INVALID) {
            await assert.rejects(
                () => db.projectObjectiveActualScores
                    .put(
                        `p:o:${score}`,
                        {
                            project_id: 'p',
                            objective_id: 'o',
                            score, member_id: 'w1', at: AT,
                        },
                    ),
                RANGE_MSG,
            );
        }
    });

test('ctx.PUT rejects out-of-range baseline scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.PUT(
                    `project-objective-baseline-scores`
                    + `/p:o:${score}`,
                    {
                        project_id: 'p',
                        objective_id: 'o',
                        score, member_id: 'w1', at: AT,
                    },
                ),
            );
        }
    });

test('ctx.commit rejects out-of-range baseline scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.commit({
                    ops: [{
                        method: 'put',
                        resource:
                            'project-objective-baseline'
                            + '-scores/'
                            + `p:o:${score}`,
                        body: {
                            project_id: 'p',
                            objective_id: 'o',
                            score, member_id: 'w1', at: AT,
                        },
                    }],
                }),
            );
        }
        const rows = await db
            .projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 0);
    });

test('ctx.commit rejects out-of-range actual scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.commit({
                    ops: [{
                        method: 'put',
                        resource:
                            'project-objective-actual'
                            + '-scores/'
                            + `p:o:${score}`,
                        body: {
                            project_id: 'p',
                            objective_id: 'o',
                            score, member_id: 'w1', at: AT,
                        },
                    }],
                }),
            );
        }
    });

test('postProjectBaselineScoring rejects bad scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => postProjectBaselineScoring(
                    ctx, 'p', [{
                        objectiveId: 'o', score,
                    }],
                ),
            );
        }
        const rows = await db
            .projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, 0);
    });

test('postProjectActualMeasurement rejects bad scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => postProjectActualMeasurement(
                    ctx, 'p', [{
                        objectiveId: 'o', score,
                    }],
                ),
            );
        }
        const rows = await db
            .projectObjectiveActualScores.getAll();
        assert.equal(rows.length, 0);
    });

test('postProjectBaselineScoring accepts valid scores',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        await postProjectBaselineScoring(
            ctx, 'p', VALID.map(score => ({
                objectiveId: `o:${score}`, score,
            })),
        );
        const rows = await db
            .projectObjectiveBaselineScores.getAll();
        assert.equal(rows.length, VALID.length);
    });
