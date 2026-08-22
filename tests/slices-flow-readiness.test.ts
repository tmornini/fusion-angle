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
import { getFlowsForCreation } from
    '../web-app/app/adapters/flow-publish.ts';

test('F2 admin sees WB Test Flow ready',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const f2 = reveal.find(
        (r) => r.section === 'F2',
    );
    assert.ok(f2);
    const organization = sliceEntityId('f2-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('f2-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const { ready, notReady } =
        await getFlowsForCreation(ctx);
    assert.equal(notReady.length, 0);
    assert.equal(ready.length, 1);
    assert.equal(ready[0]!.name, 'WB Test Flow');
    assert.equal(
        ready[0]!.id, sliceEntityId('f2-flow'),
    );
    assert.equal(f2.flowId, ready[0]!.id);
});
