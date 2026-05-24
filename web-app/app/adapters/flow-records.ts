import type {
    FlowRecordEntity,
    FlowRecordId,
    Id,
    RecordId,
    FlowWorkOrderEntity,
    WorkOrderEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    notifyRecordChange,
} from './records.ts';

export type {
    FlowRecordEntity,
    FlowRecordId,
} from '../../../api/types.ts';

async function getFlowRecordRows(
    ctx: RequestContext,
): Promise<FlowRecordEntity[]> {
    return ctx.GET<FlowRecordEntity[]>(
        'flow-records',
    );
}

export async function getFlowRecord(
    ctx: RequestContext,
    id: FlowRecordId,
): Promise<FlowRecordEntity> {
    return ctx.GET<FlowRecordEntity>(
        `flow-records/${id}`,
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

export async function getRecordForFlow(
    ctx: RequestContext,
    flowId: Id,
): Promise<RecordId | null> {
    const rows = await getFlowRecordRows(ctx);
    const found = rows.find(
        r => r.flow_id === flowId,
    );
    return found ? found.record_id : null;
}

export async function getFlowsForRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<Id[]> {
    const rows = await getFlowRecordRows(ctx);
    return rows
        .filter(r => r.record_id === recordId)
        .map(r => r.flow_id);
}

export async function getWorkOrdersForRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<WorkOrderEntity[]> {
    const [bindings, flowWorkOrders, workOrders]
        = await Promise.all([
            getFlowRecordRows(ctx),
            ctx.GET<FlowWorkOrderEntity[]>(
                'flow-work-orders',
            ),
            ctx.GET<WorkOrderEntity[]>(
                'work-orders',
            ),
        ]);
    const flowIds = new Set(
        bindings
            .filter(b => b.record_id === recordId)
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
