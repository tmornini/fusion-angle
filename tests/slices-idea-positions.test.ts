import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { deriveIdeas } from
    '../api/derive-ideas.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from
    './token-fixtures.ts';
import { getIdeas } from
    '../web-app/app/adapters/ideas.ts';

test('garden ideas have distinct positions',
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
    const listed = await getIdeas(ctx);
    assert.equal(listed.length, 4);
    const ideas = await deriveIdeas(
        db, organization,
    );
    assert.equal(ideas.length, 4);
    const positions = ideas.map(
        (idea) => idea.position,
    );
    assert.equal(
        new Set(positions).size, 4,
    );
});
