import type {
    FlowEntity,
    FlowRecordEntity,
    FlowRecordId,
    Id,
    RecordId,
    FlowWorkOrderEntity,
} from '../shared/types.ts';
import {
    filterByField,
    organizationItem,
    type RequestContext,
} from './request-context.ts';
import {
    notifyRecordChange,
} from './records.ts';
import {
    getWorkOrders,
    type WorkOrder,
} from './work-orders-queries.ts';
import { getFlowEntities } from './flows.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import { nowUtc } from '../shared/types.ts';

// The bindings for ONE flow — the server filters the nested
// collection to the parent flow, so no client filter is needed.
async function getFlowRecordsForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<FlowRecordEntity[]> {
    return (await ctx.GET<FlowRecordEntity[]>(
        organizationItem(ctx, 'flows', flowId)
            + '/records/',
    )).body().toValue();
}

// The bindings across EVERY flow the caller's org can see —
// reassembled from the nested per-flow collections, since a
// record can be bound by flows the caller never named. The
// flows list is org-scoped; each flow's records are fetched in
// parallel and concatenated.
async function getAllFlowRecordEntities(
    ctx: RequestContext,
    flows?: readonly { readonly id: Id }[],
): Promise<FlowRecordEntity[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        list.map(f => getFlowRecordsForFlow(
            ctx, f.id,
        )),
    );
    return perFlow.flat();
}

// The flow↔work-order joins across EVERY flow the caller's org
// can see — same per-flow reassembly as the bindings above.
async function getAllFlowWorkOrderEntities(
    ctx: RequestContext,
    flows?: readonly { readonly id: Id }[],
): Promise<FlowWorkOrderEntity[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        list.map(f => ctx.GET<FlowWorkOrderEntity[]>(
            organizationItem(ctx, 'flows', f.id)
                + '/work-orders/',
        ).then(read => read.body().toValue())),
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
        generateIdentifier(),
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
    flows?: readonly FlowEntity[],
    flowRecords?: readonly FlowRecordEntity[],
): Promise<BoundFlowSummary[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const rows = flowRecords
        ?? await getAllFlowRecordEntities(ctx, list);
    const wanted = new Set(
        filterByField(rows, 'record_id', recordId)
            .map(r => r.flow_id),
    );
    return list
        .filter(f => wanted.has(f.id))
        .map(f => ({ id: f.id, name: f.name }));
}

export async function getWorkOrdersForRecord(
    ctx: RequestContext,
    recordId: RecordId,
    flows?: readonly { readonly id: Id }[],
    flowRecords?:
        | readonly FlowRecordEntity[]
        | Promise<readonly FlowRecordEntity[]>,
): Promise<WorkOrder[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const [bindings, flowWorkOrders, workOrders]
        = await Promise.all([
            flowRecords ?? getAllFlowRecordEntities(
                ctx, list,
            ),
            getAllFlowWorkOrderEntities(ctx, list),
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

// Records fan-out and work-order joins keyed by one
// flows list. One records GET per flow; joins start
// without waiting for those records to resolve.
export async function loadRecordFlowJoins(
    ctx: RequestContext,
    recordId: RecordId,
    flows: readonly FlowEntity[],
): Promise<{
    readonly summaries: BoundFlowSummary[];
    readonly workOrders: WorkOrder[];
}> {
    const flowRecordsP = getAllFlowRecordEntities(
        ctx, flows,
    );
    const [flowRecords, workOrders] = await Promise.all([
        flowRecordsP,
        getWorkOrdersForRecord(
            ctx, recordId, flows, flowRecordsP,
        ),
    ]);
    return {
        summaries: await getFlowSummariesForRecord(
            ctx, recordId, flows, flowRecords,
        ),
        workOrders,
    };
}
