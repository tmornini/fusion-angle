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
import { getFlowStats } from
    '../web-app/app/adapters/flow-stats.ts';

test('FS stats show Capture hotter than Review',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const fs = reveal.find(
        (r) => r.section === 'FS',
    );
    assert.ok(fs);
    const organization = sliceEntityId('fs-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('fs-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const { model } = await getFlowStats(
        ctx, sliceEntityId('fs-flow'), Date.now(),
    );
    const capture = model.nodes.find(
        (n) => n.displayName === 'Data Capture',
    );
    const review = model.nodes.find(
        (n) => n.displayName === 'Review',
    );
    assert.ok(capture);
    assert.ok(review);
    assert.ok(capture.heatT > 0);
    assert.ok(review.heatT > 0);
    assert.ok(capture.heatT > review.heatT);
    assert.ok(model.pathEntries.length >= 2);
    const pathOne = model.pathEntries[0];
    assert.ok(pathOne);
    assert.equal(pathOne.kind, 'path');
    const path = pathOne.kind === 'path'
        ? pathOne.path
        : undefined;
    assert.ok(path);
    const create = model.nodes.find(
        (n) => n.isCreate,
    );
    assert.ok(create);
    assert.equal(path.nodeIds[0], create.id);
    assert.ok(path.edgeIds.length >= 3);
    assert.ok(
        model.incompleteWorkOrderCount >= 1,
    );
});
