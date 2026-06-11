import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { adminContext } from './context-fixtures.ts';
import {
    putFlowRecord,
    deleteFlowRecord,
    getRecordForFlow,
    getRecordForWorkOrder,
    getFlowsForRecord,
    getWorkOrdersForRecord,
} from '../web-app/app/adapters/flow-records.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';

const AT = '2026-05-01T00:00:00.000000Z';

async function seedWorkOrder(
    db: MemoryDbAdapter,
    id: string,
    displayId: string,
    flowId: string,
    position: number,
): Promise<void> {
    const flowGraph = jsonObjectField({
        name: 'Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    });
    await db.workOrders.put(id, {
        organization_id: '1',
        display_id: displayId,
        flow_graph: flowGraph,
        position,
    });
    await db.flowWorkOrders.put(
        'fwo-' + id, {
            flow_id: flowId,
            work_order_id: id,
            at: AT,
        },
    );
}

test(
    'putFlowRecord then getRecordForFlow round-trips'
    + ' the binding',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: AT,
        });
        assert.equal(
            await getRecordForFlow(ctx, 'flow-1'),
            'rec-1',
        );
    },
);

test(
    'getRecordForFlow returns the bound'
    + ' record id, or null if unbound',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: AT,
        });
        assert.equal(
            await getRecordForFlow(ctx, 'flow-1'),
            'rec-1',
        );
        assert.equal(
            await getRecordForFlow(
                ctx, 'flow-unbound',
            ),
            null,
        );
    },
);

test(
    'getRecordForWorkOrder resolves the record'
    + ' via flow_work_orders then flow_records',
    async () => {
        const { db, ctx } = await adminContext();
        await seedWorkOrder(
            db, 'wo-1', 'A001', 'flow-1', 1,
        );
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: AT,
        });
        assert.equal(
            await getRecordForWorkOrder(
                ctx, 'wo-1',
            ),
            'rec-1',
        );
    },
);

test(
    'getRecordForWorkOrder returns null for a'
    + ' work order with no flow link',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: AT,
        });
        assert.equal(
            await getRecordForWorkOrder(
                ctx, 'wo-unlinked',
            ),
            null,
        );
    },
);

test(
    'getRecordForWorkOrder returns null when the'
    + ' linked flow has no record binding',
    async () => {
        const { db, ctx } = await adminContext();
        await seedWorkOrder(
            db, 'wo-1', 'A001', 'flow-1', 1,
        );
        assert.equal(
            await getRecordForWorkOrder(
                ctx, 'wo-1',
            ),
            null,
        );
    },
);

test(
    'getFlowsForRecord returns every flow id'
    + ' bound to a record',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-a',
            record_id: 'rec-1',
            at: AT,
        });
        await putFlowRecord(ctx, 'fr-2', {
            flow_id: 'flow-b',
            record_id: 'rec-1',
            at: AT,
        });
        await putFlowRecord(ctx, 'fr-3', {
            flow_id: 'flow-c',
            record_id: 'rec-other',
            at: AT,
        });
        const flows = await getFlowsForRecord(
            ctx, 'rec-1',
        );
        assert.deepEqual(
            flows.sort(),
            ['flow-a', 'flow-b'],
        );
    },
);

test(
    'getWorkOrdersForRecord walks'
    + ' flow_records → flow_work_orders →'
    + ' work_orders correctly for a record bound'
    + ' to multiple flows',
    async () => {
        const { db, ctx } = await adminContext();
        // Bind rec-1 to two flows.
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-a',
            record_id: 'rec-1',
            at: AT,
        });
        await putFlowRecord(ctx, 'fr-2', {
            flow_id: 'flow-b',
            record_id: 'rec-1',
            at: AT,
        });
        // One work order on each.
        await seedWorkOrder(
            db, 'wo-a', 'A001', 'flow-a', 1,
        );
        await seedWorkOrder(
            db, 'wo-b', 'B001', 'flow-b', 2,
        );
        // Plus a noise work order on an
        // unrelated flow.
        await seedWorkOrder(
            db, 'wo-other', 'X001',
            'flow-other', 3,
        );
        const workOrders =
            await getWorkOrdersForRecord(
                ctx, 'rec-1',
            );
        const ids = workOrders
            .map(w => w.id)
            .sort();
        assert.deepEqual(ids, ['wo-a', 'wo-b']);
    },
);

test(
    'getWorkOrdersForRecord returns an empty'
    + ' list for an unbound record',
    async () => {
        const { ctx } = await adminContext();
        const workOrders =
            await getWorkOrdersForRecord(
                ctx, 'rec-unknown',
            );
        assert.equal(workOrders.length, 0);
    },
);

test(
    'deleteFlowRecord removes the binding row',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'fr-1', {
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: AT,
        });
        await deleteFlowRecord(ctx, 'fr-1');
        assert.equal(
            await getRecordForFlow(ctx, 'flow-1'),
            null,
        );
    },
);
