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
    getFlowSummariesForRecord,
    getWorkOrdersForRecord,
    getRecordForFlow,
} from '../web-app/app/adapters/flow-records.ts';
import { getRecordAttributesByRecord } from
    '../web-app/app/adapters/record-attributes.ts';
import {
    getWorkOrder,
    getWorkOrderCurrentNodeId,
} from
    '../web-app/app/adapters/work-orders-queries.ts';

test('R garden record binds Customer Onboarding',
async () => {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const organization = sliceEntityId('r-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('r-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const recordId = sliceEntityId(
        'r-record-customer',
    );
    const summaries =
        await getFlowSummariesForRecord(
            ctx, recordId,
        );
    assert.deepEqual(
        summaries.map((s) => s.name),
        ['Customer Onboarding'],
    );
    const workOrders =
        await getWorkOrdersForRecord(
            ctx, recordId,
        );
    assert.deepEqual(
        workOrders.map((w) => w.id).sort(),
        [
            sliceEntityId('r-wo-capture'),
            sliceEntityId('r-wo-review'),
            sliceEntityId('r-wo-archive'),
        ].sort(),
    );
    const bound = await getRecordForFlow(
        ctx, sliceEntityId('r-flow'),
    );
    assert.equal(bound, recordId);
    const r1Id = sliceEntityId('r-wo-capture');
    const r1 = await getWorkOrder(ctx, r1Id);
    assert.equal(r1.displayId, 'r1');
    const currentNodeId =
        await getWorkOrderCurrentNodeId(
            ctx, r1Id,
        );
    assert.ok(currentNodeId);
    const currentNode = r1.flowGraph.nodes.find(
        (n) => n.id === currentNodeId,
    );
    assert.ok(currentNode);
    const attributes =
        await getRecordAttributesByRecord(
            ctx, bound,
        );
    const byId = new Map(
        attributes.map((a) => [a.id, a]),
    );
    assert.ok(currentNode.attributes.length > 0);
    for (const ref of currentNode.attributes) {
        assert.ok(byId.has(ref.attributeId));
    }
});
