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
    organizationCollection,
    organizationItem,
    type RequestContext,
} from './shared.ts';
import {
    notifyRecordChange,
} from './records.ts';
import {
    getWorkOrders,
    type WorkOrder,
} from './work-orders-queries.ts';
import { getFlowEntities } from './flows.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import { nowUtc } from '../../../api/types.ts';

export type {
    FlowRecordEntity,
    FlowRecordId,
} from '../../../api/types.ts';

// The bindings for ONE flow — the server filters the nested
// collection to the parent flow, so no client filter is needed.
async function getFlowRecordsForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<FlowRecordEntity[]> {
    return ctx.GET<FlowRecordEntity[]>(
        organizationItem(ctx, 'flows', flowId)
            + '/records/',
    );
}

// The bindings across EVERY flow the caller's org can see —
// reassembled from the nested per-flow collections, since a
// record can be bound by flows the caller never named. The
// flows list is org-scoped; each flow's records are fetched in
// parallel and concatenated.
async function getAllFlowRecordEntities(
    ctx: RequestContext,
): Promise<FlowRecordEntity[]> {
    const flows = await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        flows.map(f => getFlowRecordsForFlow(ctx, f.id)),
    );
    return perFlow.flat();
}

// The flow↔work-order joins across EVERY flow the caller's org
// can see — same per-flow reassembly as the bindings above.
async function getAllFlowWorkOrderEntities(
    ctx: RequestContext,
): Promise<FlowWorkOrderEntity[]> {
    const flows = await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        flows.map(f => ctx.GET<FlowWorkOrderEntity[]>(
            organizationItem(ctx, 'flows', f.id)
                + '/work-orders/',
        )),
    );
    return perFlow.flat();
}

export async function putFlowRecord(
    ctx: RequestContext,
    id: FlowRecordId,
    entity: Omit<FlowRecordEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(
        organizationItem(ctx, 'flows', entity.flow_id)
            + '/records/' + id, entity,
    );
    notifyRecordChange();
}

export async function deleteFlowRecord(
    ctx: RequestContext,
    flowId: Id,
    id: FlowRecordId,
): Promise<void> {
    await ctx.DELETE(
        organizationItem(ctx, 'flows', flowId)
            + '/records/' + id,
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
    const rows = await getFlowRecordsForFlow(ctx, flowId);
    const existing = rows[0];
    if (!existing) return;
    await deleteFlowRecord(ctx, flowId, existing.id);
}

export async function getRecordForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<RecordId | null> {
    const rows = await getFlowRecordsForFlow(ctx, flowId);
    const found = rows[0];
    return found ? found.record_id : null;
}

export async function getRecordForWorkOrder(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<RecordId | null> {
    const links = await getAllFlowWorkOrderEntities(ctx);
    const link = links.find(
        l => l.work_order_id === workOrderId,
    );
    if (!link) {
        return null;
    }
    const bindings = await getFlowRecordsForFlow(
        ctx, link.flow_id,
    );
    const found = bindings[0];
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
        getAllFlowRecordEntities(ctx),
        ctx.GET<FlowEntity[]>(
            organizationCollection(ctx, 'flows'),
        ),
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
            getAllFlowRecordEntities(ctx),
            getAllFlowWorkOrderEntities(ctx),
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
