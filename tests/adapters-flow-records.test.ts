import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { adminContext } from './context-fixtures.ts';
import { createRequestContext } from
'../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    putFlowRecord,
    deleteFlowRecord,
    getRecordForFlow,
    getRecordForWorkOrder,
    getFlowSummariesForRecord,
    getWorkOrdersForRecord,
} from '../web-app/app/adapters/flow-records.ts';
import {
    postFlowCreation,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    putWorkOrder,
} from '../web-app/app/adapters/work-orders-mutations.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    type WorkOrderFlowGraph,
} from '../api/types.ts';

const AT = '2026-05-01T00:00:00.000000Z';

// Seeds a flow through the SAME gate-driven create the live
// route uses (postFlowCreation), so a message pair exists at
// this flow's address — required for the flipped GET flows
// route (Phase 4 Task 8), which getFlowSummariesForRecord /
// getWorkOrdersForRecord read (via getFlowEntities), to derive
// it. The default start/complete graph postFlowCreation seeds
// is irrelevant here — every caller in this file reads only
// the flow's id/name.
async function seedFlow(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    const ctx = createRequestContext(db, await devToken());
    await postFlowCreation(ctx, {
        flowId: id,
        linkId: id + '-link',
        projectId: 'p-' + id,
        name,
    });
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    id: string,
    displayId: string,
    flowId: string,
    position: number,
): Promise<void> {
    // The flow↔work-order join now nests under its parent flow,
    // so the parent flow must exist to be enumerated.
    await seedFlow(db, flowId, flowId);
    const ctx = createRequestContext(db, await devToken());
    const flowGraph: WorkOrderFlowGraph = {
        name: 'Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
    // NAMED re-pin (Task 7): getWorkOrdersForRecord reads the
    // work-orders collection through the flipped GET (this
    // commit) — a raw db.workOrders.put leaves no message pair
    // at this address, so the entity must land through the
    // SAME wire-reachable PUT the live route serves.
    await putWorkOrder(ctx, id, {
        displayId,
        flowGraph,
        position,
    });
    // NAMED re-pin (Task 7): getAllFlowWorkOrderEntities reads
    // flows/:id/work-orders through the flipped GET too — same
    // reason, different address.
    await ctx.PUT(
        'flows/' + flowId + '/work-orders/fwo-' + id,
        {
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
    'getFlowSummariesForRecord returns id and'
    + ' name for every flow bound to a record',
    async () => {
        const { db, ctx } = await adminContext();
        await seedFlow(db, 'flow-a', 'Alpha');
        await seedFlow(db, 'flow-b', 'Beta');
        await seedFlow(db, 'flow-c', 'Gamma');
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
        const flows =
            await getFlowSummariesForRecord(
                ctx, 'rec-1',
            );
        assert.deepEqual(
            flows.toSorted(
                (a, b) =>
                    a.id.localeCompare(b.id),
            ),
            [
                { id: 'flow-a', name: 'Alpha' },
                { id: 'flow-b', name: 'Beta' },
            ],
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
        await deleteFlowRecord(ctx, 'flow-1', 'fr-1');
        assert.equal(
            await getRecordForFlow(ctx, 'flow-1'),
            null,
        );
    },
);
