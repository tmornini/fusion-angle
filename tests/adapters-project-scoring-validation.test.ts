import { assertRejects, assertStrictEquals, assertThrows } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

const AT = '2026-05-20T00:00:00.000000Z';
const VALID: ReadonlyArray<number> = [-100, 0, 100];
const INVALID: ReadonlyArray<number> = [-101, 101, 106];
const RANGE_MSG = 'expected integer in [-100, +100]';
const PROJECT_ID = generateIdentifier();
const OBJECTIVE_ID = generateIdentifier();

// Phase Final Stage B: score tables retired — the store-gate
// pins re-home to the pure validators; wire + adapter pins
// stay on the message plane.

Deno.test('baseline validator accepts valid boundary scores',
    () => {
        for (const score of VALID) {
            validateBaselineScoreEntity({
                project_id: PROJECT_ID,
                objective_id: OBJECTIVE_ID,
                score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
            });
        }
    });

Deno.test('baseline validator rejects out-of-range scores',
    () => {
        for (const score of INVALID) {
            assertThrows(
                () => validateBaselineScoreEntity({
                    project_id: PROJECT_ID,
                    objective_id: OBJECTIVE_ID,
                    score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
                }),
                Error,
                RANGE_MSG,
            );
        }
    });

Deno.test('actual validator accepts valid boundary scores',
    () => {
        for (const score of VALID) {
            validateActualScoreEntity({
                project_id: PROJECT_ID,
                objective_id: OBJECTIVE_ID,
                score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
            });
        }
    });

Deno.test('actual validator rejects out-of-range scores',
    () => {
        for (const score of INVALID) {
            assertThrows(
                () => validateActualScoreEntity({
                    project_id: PROJECT_ID,
                    objective_id: OBJECTIVE_ID,
                    score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
                }),
                Error,
                RANGE_MSG,
            );
        }
    });

Deno.test('ctx.PUT rejects out-of-range baseline scores',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assertRejects(
                () => ctx.PUT(
                    'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                        + PROJECT_ID
                        + '/objective-baseline-scores/'
                        + generateIdentifier(),
                    {
                        project_id: PROJECT_ID,
                        objective_id: OBJECTIVE_ID,
                        score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
                    },
                ),
            );
        }
    });

Deno.test('ctx.PUT leaves no baseline score on a bad score',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assertRejects(
                () => ctx.PUT(
                    'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                        + PROJECT_ID
                        + '/objective-baseline-scores/'
                        + generateIdentifier(),
                    {
                        project_id: PROJECT_ID,
                        objective_id: OBJECTIVE_ID,
                        score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
                    },
                ),
            );
        }
        const rows = await getBaselineScoresForProject(
            ctx, PROJECT_ID,
        );
        assertStrictEquals(rows.length, 0);
    });

Deno.test('ctx.PUT rejects out-of-range actual scores',
    async () => {
        const { ctx } = await adminContext();
        for (const score of INVALID) {
            await assertRejects(
                () => ctx.PUT(
                    'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                        + PROJECT_ID
                        + '/objective-actual-scores/'
                        + generateIdentifier(),
                    {
                        project_id: PROJECT_ID,
                        objective_id: OBJECTIVE_ID,
                        score, member_id: 'xdaJyuuPyHfffCGLhqDrOQ', at: AT,
                    },
                ),
            );
        }
    });

Deno.test('postProjectBaselineScoring rejects bad scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        for (const score of INVALID) {
            await assertRejects(
                () => postProjectBaselineScoring(
                    ctx, PROJECT_ID, [{
                        objectiveId: OBJECTIVE_ID, score,
                    }],
                ),
            );
        }
        const rows = await getBaselineScoresForProject(
            ctx, PROJECT_ID,
        );
        assertStrictEquals(rows.length, 0);
    });

Deno.test('postProjectActualMeasurement rejects bad scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        for (const score of INVALID) {
            await assertRejects(
                () => postProjectActualMeasurement(
                    ctx, PROJECT_ID, [{
                        objectiveId: OBJECTIVE_ID, score,
                    }],
                ),
            );
        }
    });

Deno.test('postProjectBaselineScoring accepts valid scores',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await organizationToken());
        await postProjectBaselineScoring(
            ctx, PROJECT_ID, VALID.map(score => ({
                objectiveId: generateIdentifier(), score,
            })),
        );
        const rows = await getBaselineScoresForProject(
            ctx, PROJECT_ID,
        );
        assertStrictEquals(rows.length, VALID.length);
    });
