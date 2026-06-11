import type {
    FlowEntity,
    FlowRecordEntity,
    FlowRecordId,
    Id,
    RecordId,
    FlowWorkOrderEntity,
} from '../../../api/types.ts';
import {
    filterByField,
    type RequestContext,
} from './shared.ts';
import {
    notifyRecordChange,
} from './records.ts';
import {
    getWorkOrders,
    type WorkOrder,
} from './work-orders-queries.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import { nowUtc } from '../../../api/types.ts';

export type {
    FlowRecordEntity,
    FlowRecordId,
} from '../../../api/types.ts';

async function getFlowRecordEntities(
    ctx: RequestContext,
): Promise<FlowRecordEntity[]> {
    return ctx.GET<FlowRecordEntity[]>(
        'flow-records',
    );
}

export async function putFlowRecord(
    ctx: RequestContext,
    id: FlowRecordId,
    entity: Omit<FlowRecordEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(
        `flow-records/${id}`, entity,
    );
    notifyRecordChange();
}

export async function deleteFlowRecord(
    ctx: RequestContext,
    id: FlowRecordId,
): Promise<void> {
    await ctx.DELETE(
        `flow-records/${id}`,
    );
    notifyRecordChange();
}

// Bind a flow to a record: a fresh covenant row with
// the moment of union. POST-shaped — each call mints
// a new binding id.
export async function postFlowRecordBinding(
    ctx: RequestContext,
    flowId: Id,
    recordId: RecordId,
): Promise<void> {
    await putFlowRecord(
        ctx,
        generateCryptoSafeBase62(),
        {
            flow_id: flowId,
            record_id: recordId,
            at: nowUtc(),
        },
    );
}

// Unbind a flow from its record. No-op when the flow
// has no binding — the absence IS the unbound state.
export async function deleteFlowRecordForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<void> {
    const rows = await getFlowRecordEntities(ctx);
    const existing = rows.find(
        r => r.flow_id === flowId,
    );
    if (!existing) return;
    await deleteFlowRecord(ctx, existing.id);
}

export async function getRecordForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<RecordId | null> {
    const rows = await getFlowRecordEntities(ctx);
    const found = rows.find(
        r => r.flow_id === flowId,
    );
    return found ? found.record_id : null;
}

export async function getRecordForWorkOrder(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<RecordId | null> {
    const [links, bindings] = await Promise.all([
        ctx.GET<FlowWorkOrderEntity[]>(
            'flow-work-orders',
        ),
        getFlowRecordEntities(ctx),
    ]);
    const link = links.find(
        l => l.work_order_id === workOrderId,
    );
    if (!link) {
        return null;
    }
    const found = bindings.find(
        b => b.flow_id === link.flow_id,
    );
    return found ? found.record_id : null;
}

// The flows bound to a record, shaped for display:
// the adapter owns the flow-records join AND the flow
// name lookup, so the record-detail page never speaks
// a table name or a raw wire row.
export interface BoundFlowSummary {
    readonly id: Id;
    readonly name: string;
}

export async function getFlowSummariesForRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<BoundFlowSummary[]> {
    const [rows, flows] = await Promise.all([
        getFlowRecordEntities(ctx),
        ctx.GET<FlowEntity[]>('flows'),
    ]);
    const wanted = new Set(
        filterByField(rows, 'record_id', recordId)
            .map(r => r.flow_id),
    );
    return flows
        .filter(f => wanted.has(f.id))
        .map(f => ({ id: f.id, name: f.name }));
}

export async function getWorkOrdersForRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<WorkOrder[]> {
    const [bindings, flowWorkOrders, workOrders]
        = await Promise.all([
            getFlowRecordEntities(ctx),
            ctx.GET<FlowWorkOrderEntity[]>(
                'flow-work-orders',
            ),
            getWorkOrders(ctx),
        ]);
    const flowIds = new Set(
        filterByField(bindings, 'record_id', recordId)
            .map(b => b.flow_id),
    );
    const workOrderIds = new Set(
        flowWorkOrders
            .filter(
                fwo => flowIds.has(fwo.flow_id),
            )
            .map(fwo => fwo.work_order_id),
    );
    return workOrders.filter(
        wo => workOrderIds.has(wo.id),
    );
}
