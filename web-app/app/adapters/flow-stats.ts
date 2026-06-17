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
    getFlowWorkOrderEntities,
} from './work-orders-queries.ts';
import {
    getTransitionEventsByWorkOrder,
    type TransitionEvent,
} from './state-events.ts';
import {
    getMemberMap,
    memberName,
} from './members-union.ts';

export async function getFlowStats(
    ctx: RequestContext,
    flowId: string,
): Promise<{
    model: FlowStatsModel;
    graph: FlowGraph;
}> {
    const [
        graph,
        eventsByWo,
        fwoRows,
        memberMap,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getTransitionEventsByWorkOrder(ctx),
        getFlowWorkOrderEntities(ctx, flowId),
        getMemberMap(ctx),
    ]);

    const woIds = new Set(
        fwoRows.map(r => r.work_order_id),
    );
    const transitions: TransitionEvent[] = [];
    for (const [woId, events] of eventsByWo) {
        if (!woIds.has(woId)) continue;
        for (const ev of events) {
            transitions.push(ev);
        }
    }

    const memberNameById = new Map<Id, string>();
    for (const id of memberMap.keys()) {
        memberNameById.set(
            id, memberName(memberMap, id),
        );
    }

    const input: FlowStatsInput = {
        nodes: graph.nodes,
        edges: graph.edges,
        transitions,
        nowMs: Date.now(),
        windowDays: 90,
        memberNameById,
    };
    return { model: buildFlowStats(input), graph };
}
