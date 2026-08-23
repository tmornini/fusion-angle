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
import { getProjectsScoreColumn } from
    '../web-app/app/adapters/project-scoring.ts';
import { deriveProjects } from
    '../api/derive-projects.ts';

async function kScoreColumn() {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const organization = sliceEntityId('k-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('k-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const [projects, column] = await Promise.all([
        deriveProjects(db, organization),
        getProjectsScoreColumn(ctx),
    ]);
    return { projects, column };
}

test('K seeds two under_review projects with baselines',
async () => {
    const { projects, column } = await kScoreColumn();
    const underReview = projects
        .filter((p) => p.state === 'under_review')
        .map((p) => p.id)
        .sort();
    assert.deepEqual(underReview, [
        sliceEntityId('k-project-under-review'),
        sliceEntityId('k-project-under-review-2'),
    ].sort());
    const rows = underReview.map((id) => {
        const row = column.find(
            (c) => c.projectId === id,
        );
        assert.ok(row, id);
        return row;
    });
    for (const row of rows) {
        assert.equal(row.baselineCount, 4);
        assert.equal(row.totalActiveObjectives, 4);
        assert.notEqual(row.baselineAvg, undefined);
    }
    assert.notEqual(
        rows[0]!.baselineAvg, rows[1]!.baselineAvg,
    );
    const submitted = column.find(
        (c) => c.projectId
            === sliceEntityId('k-project-submitted'),
    );
    assert.ok(submitted);
    assert.equal(submitted.baselineAvg, undefined);
});

test('K approved project carries four baselines',
async () => {
    const { column } = await kScoreColumn();
    const approved = column.find(
        (c) => c.projectId
            === sliceEntityId('k-project-approved'),
    );
    assert.ok(approved);
    assert.equal(approved.baselineCount, 4);
    assert.notEqual(approved.baselineAvg, undefined);
});
