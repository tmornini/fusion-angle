import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { adminContext } from './context-fixtures.ts';
import { createRequestContext } from
'../web-app/app/adapters/shared.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
    const ctx = createRequestContext(db, await organizationToken());
    await postFlowCreation(ctx, {
        flowId: id,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
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
    const ctx = createRequestContext(db, await organizationToken());
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
    // organizations/:id/flows/:id/work-orders through the flipped GET too —
    // same
    // reason, different address.
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/work-orders/' + generateIdentifier(),
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
        await putFlowRecord(ctx, 'dCnpryxCNwuTnCrBBDIMOw', {
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        assert.equal(
            await getRecordForFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw'),
            'rbfHGatkwQzGZJVXKJEeyw',
        );
    },
);

test(
    'getRecordForFlow returns the bound'
    + ' record id, or null if unbound',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'dCnpryxCNwuTnCrBBDIMOw', {
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        assert.equal(
            await getRecordForFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw'),
            'rbfHGatkwQzGZJVXKJEeyw',
        );
        assert.equal(
            await getRecordForFlow(
                ctx, generateIdentifier(),
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
        const workOrderId = generateIdentifier();
        await seedWorkOrder(
            db, workOrderId, 'A001', 'aEsGMmBEFaVdWihhHXwCbw', 1,
        );
        await putFlowRecord(ctx, 'dCnpryxCNwuTnCrBBDIMOw', {
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        assert.equal(
            await getRecordForWorkOrder(
                ctx, workOrderId,
            ),
            'rbfHGatkwQzGZJVXKJEeyw',
        );
    },
);

test(
    'getRecordForWorkOrder returns null for a'
    + ' work order with no flow link',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'dCnpryxCNwuTnCrBBDIMOw', {
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        assert.equal(
            await getRecordForWorkOrder(
                ctx, generateIdentifier(),
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
        const workOrderId = generateIdentifier();
        await seedWorkOrder(
            db, workOrderId, 'A001', 'aEsGMmBEFaVdWihhHXwCbw', 1,
        );
        assert.equal(
            await getRecordForWorkOrder(
                ctx, workOrderId,
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
        const flowA = generateIdentifier();
        const flowB = generateIdentifier();
        const flowC = generateIdentifier();
        await seedFlow(db, flowA, 'Alpha');
        await seedFlow(db, flowB, 'Beta');
        await seedFlow(db, flowC, 'Gamma');
        await putFlowRecord(ctx, generateIdentifier(), {
            flow_id: flowA,
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        await putFlowRecord(ctx, generateIdentifier(), {
            flow_id: flowB,
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        await putFlowRecord(ctx, generateIdentifier(), {
            flow_id: flowC,
            record_id: generateIdentifier(),
            at: AT,
        });
        const flows =
            await getFlowSummariesForRecord(
                ctx, 'rbfHGatkwQzGZJVXKJEeyw',
            );
        assert.deepEqual(
            flows.toSorted(
                (a, b) =>
                    a.id.localeCompare(b.id),
            ),
            [
                { id: flowA, name: 'Alpha' },
                { id: flowB, name: 'Beta' },
            ].toSorted(
                (a, b) =>
                    a.id.localeCompare(b.id),
            ),
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
        // Bind rbfHGatkwQzGZJVXKJEeyw to two flows.
        const flowA = generateIdentifier();
        const flowB = generateIdentifier();
        const woA = generateIdentifier();
        const woB = generateIdentifier();
        await putFlowRecord(ctx, generateIdentifier(), {
            flow_id: flowA,
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        await putFlowRecord(ctx, generateIdentifier(), {
            flow_id: flowB,
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        // One work order on each.
        await seedWorkOrder(
            db, woA, 'A001', flowA, 1,
        );
        await seedWorkOrder(
            db, woB, 'B001', flowB, 2,
        );
        // Plus a noise work order on an
        // unrelated flow.
        await seedWorkOrder(
            db, generateIdentifier(), 'X001',
            generateIdentifier(), 3,
        );
        const workOrders =
            await getWorkOrdersForRecord(
                ctx, 'rbfHGatkwQzGZJVXKJEeyw',
            );
        const ids = workOrders
            .map(w => w.id)
            .sort();
        assert.deepEqual(ids, [woA, woB].sort());
    },
);

test(
    'getWorkOrdersForRecord returns an empty'
    + ' list for an unbound record',
    async () => {
        const { ctx } = await adminContext();
        const workOrders =
            await getWorkOrdersForRecord(
                ctx, generateIdentifier(),
            );
        assert.equal(workOrders.length, 0);
    },
);

test(
    'deleteFlowRecord removes the binding row',
    async () => {
        const { ctx } = await adminContext();
        await putFlowRecord(ctx, 'dCnpryxCNwuTnCrBBDIMOw', {
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: AT,
        });
        await deleteFlowRecord(ctx, 'aEsGMmBEFaVdWihhHXwCbw'
            , 'dCnpryxCNwuTnCrBBDIMOw');
        assert.equal(
            await getRecordForFlow(ctx, 'aEsGMmBEFaVdWihhHXwCbw'),
            null,
        );
    },
);
