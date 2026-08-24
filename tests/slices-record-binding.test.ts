import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
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
    getRecordInstances,
    getRecordInstance,
} from
    '../web-app/app/adapters/record-instances.ts';
import { postWorkOrderTransition } from
    '../web-app/app/adapters/work-orders-mutations.ts';
import {
    getWorkOrder,
    getWorkOrderCurrentNodeId,
} from
    '../web-app/app/adapters/work-orders-queries.ts';

// A fresh seeded plane and the R admin's vessel —
// each test its own world.
async function seededRAdminContext(
): Promise<RequestContext> {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const organization = sliceEntityId('r-org');
    return createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('r-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
}

test('R garden record binds Customer Onboarding',
async () => {
    const ctx = await seededRAdminContext();
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

test('R seeds one empty Customer Profile instance',
async () => {
    const ctx = await seededRAdminContext();
    const instances = await getRecordInstances(
        ctx, sliceEntityId('r-record-customer'),
    );
    assert.equal(instances.length, 1);
    const instance = instances[0]!;
    assert.equal(
        instance.id, sliceEntityId('r-instance-1'),
    );
    assert.equal(instance.values.size, 0);
});

test('R #r1 is bound to the seeded instance',
async () => {
    const ctx = await seededRAdminContext();
    const r1 = await getWorkOrder(
        ctx, sliceEntityId('r-wo-capture'),
    );
    assert.equal(
        r1.instanceId, sliceEntityId('r-instance-1'),
    );
    assert.equal(
        r1.recordTypeId,
        sliceEntityId('r-record-customer'),
    );
});

test('R14 fill and submit advances #r1 to Review',
async () => {
    const ctx = await seededRAdminContext();
    const r1Id = sliceEntityId('r-wo-capture');
    const instance = await getRecordInstance(
        ctx,
        sliceEntityId('r-record-customer'),
        sliceEntityId('r-instance-1'),
    );
    await postWorkOrderTransition(ctx, {
        workOrderId: r1Id,
        edgeId: sliceEntityId('r-edge-submit'),
        values: {
            [sliceEntityId('r-attr-1')]: 'Acme Corp',
            [sliceEntityId('r-attr-2')]:
                'ceo@acme.example',
        },
        instanceEtag: instance.etag,
    });
    assert.equal(
        await getWorkOrderCurrentNodeId(ctx, r1Id),
        sliceEntityId('r-node-review'),
    );
});
