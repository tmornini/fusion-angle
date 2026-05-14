import type { Id } from '../../../api/types.ts';
import type { FlowGraph } from './flow-queries.ts';
import type {
    RequestContext,
} from './shared.ts';
import {
    buildFlowStats,
    type FlowStatsInput,
    type FlowStatsModel,
} from '../flow-stats-aggregate.ts';
import { getFlowGraph } from './flow-queries.ts';
import {
    getWorkOrderRows,
    getWorkOrderTransitionRows,
    getFlowWorkOrderRows,
} from './work-orders-queries.ts';
import { getWorkerMap } from './workers-union.ts';

export async function getFlowStats(
    ctx: RequestContext,
    flowId: string,
): Promise<{
    model: FlowStatsModel;
    graph: FlowGraph;
}> {
    const [
        graph,
        allWorkOrders,
        allTransitions,
        fwoRows,
        workerMap,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getWorkOrderRows(ctx),
        getWorkOrderTransitionRows(ctx),
        getFlowWorkOrderRows(ctx),
        getWorkerMap(ctx),
    ]);

    const woIds = new Set(
        fwoRows
            .filter(r => r.flow_id === flowId)
            .map(r => r.work_order_id),
    );
    const workOrders =
        allWorkOrders.filter(w => woIds.has(w.id));
    const transitions =
        allTransitions.filter(
            t => woIds.has(t.work_order_id),
        );

    const workerNameById = new Map<Id, string>();
    for (const [id, w] of workerMap) {
        workerNameById.set(
            id,
            w.kind === 'human'
                ? w.fullName()
                : w.nameText(),
        );
    }

    const input: FlowStatsInput = {
        nodes: graph.nodes,
        edges: graph.edges,
        workOrders,
        transitions,
        nowMs: Date.now(),
        windowDays: 90,
        workerNameById,
    };
    return { model: buildFlowStats(input), graph };
}
