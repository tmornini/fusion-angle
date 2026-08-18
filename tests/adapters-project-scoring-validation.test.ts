import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    postProjectBaselineScoring,
    postProjectActualMeasurement,
    getBaselineScoresForProject,
} from
    '../web-app/app/adapters/project-scoring.ts';
import {
    validateBaselineScoreEntity,
    validateActualScoreEntity,
} from '../api/validators.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

const AT = '2026-05-20T00:00:00.000000Z';
const VALID: ReadonlyArray<number> = [-100, 0, 100];
const INVALID: ReadonlyArray<number> = [-101, 101, 106];
const RANGE_MSG = /expected integer in \[-100, \+100\]/;

// Phase Final Stage B: score tables retired — the store-gate
// pins re-home to the pure validators; wire + adapter pins
// stay on the pair plane.

test('baseline validator accepts valid boundary scores',
    () => {
        for (const score of VALID) {
            assert.doesNotThrow(() =>
                validateBaselineScoreEntity({
                    project_id: 'p', objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                }),
            );
        }
    });

test('baseline validator rejects out-of-range scores',
    () => {
        for (const score of INVALID) {
            assert.throws(
                () => validateBaselineScoreEntity({
                    project_id: 'p',
                    objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                }),
                RANGE_MSG,
            );
        }
    });

test('actual validator accepts valid boundary scores',
    () => {
        for (const score of VALID) {
            assert.doesNotThrow(() =>
                validateActualScoreEntity({
                    project_id: 'p', objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                }),
            );
        }
    });

test('actual validator rejects out-of-range scores',
    () => {
        for (const score of INVALID) {
            assert.throws(
                () => validateActualScoreEntity({
                    project_id: 'p',
                    objective_id: 'o',
                    score, member_id: 'w1', at: AT,
                }),
                RANGE_MSG,
            );
        }
    });

test('ctx.PUT rejects out-of-range baseline scores',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.PUT(
                    `organizations/1/projects/p/objective-baseline-scores`
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

test('ctx.PUT leaves no baseline score on a bad score',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.PUT(
                    `organizations/1/projects/p/objective-baseline-scores`
                    + `/p:o:${score}`,
                    {
                        project_id: 'p',
                        objective_id: 'o',
                        score, member_id: 'w1', at: AT,
                    },
                ),
            );
        }
        const rows = await getBaselineScoresForProject(
            ctx, 'p',
        );
        assert.equal(rows.length, 0);
    });

test('ctx.PUT rejects out-of-range actual scores',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assert.rejects(
                () => ctx.PUT(
                    `organizations/1/projects/p/objective-actual-scores`
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

test('postProjectBaselineScoring rejects bad scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => postProjectBaselineScoring(
                    ctx, 'p', [{
                        objectiveId: 'o', score,
                    }],
                ),
            );
        }
        const rows = await getBaselineScoresForProject(
            ctx, 'p',
        );
        assert.equal(rows.length, 0);
    });

test('postProjectActualMeasurement rejects bad scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        for (const score of INVALID) {
            await assert.rejects(
                () => postProjectActualMeasurement(
                    ctx, 'p', [{
                        objectiveId: 'o', score,
                    }],
                ),
            );
        }
    });

test('postProjectBaselineScoring accepts valid scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        await postProjectBaselineScoring(
            ctx, 'p', VALID.map(score => ({
                objectiveId: `o:${score}`, score,
            })),
        );
        const rows = await getBaselineScoresForProject(
            ctx, 'p',
        );
        assert.equal(rows.length, VALID.length);
    });
