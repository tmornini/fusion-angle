import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from
    './token-fixtures.ts';
import {
    getPortfolioImpactSummary,
    getObjectiveScoringInputs,
    buildObjectiveAggregates,
} from
    '../web-app/app/adapters/project-scoring.ts';

test('C approved projects score every objective',
async () => {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const organization = sliceEntityId('c-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('c-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const summary =
        await getPortfolioImpactSummary(ctx);
    assert.notEqual(
        summary.baselineMean, undefined,
    );
    const rows = buildObjectiveAggregates(
        await getObjectiveScoringInputs(ctx),
    );
    for (const row of rows) {
        assert.equal(
            row.projectsBaselineScored, 2,
        );
    }
});
