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
    getWorkOrderHistories,
    projectTransitions,
    type TransitionEvent,
} from './work-orders-queries.ts';
import {
    getMemberMap,
    memberName,
} from './members-union.ts';

export async function getFlowStats(
    ctx: RequestContext,
    flowId: string,
    nowMs: number,
): Promise<{
    model: FlowStatsModel;
    graph: FlowGraph;
}> {
    const [
        graph,
        histories,
        fwoRows,
        memberMap,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getWorkOrderHistories(ctx),
        getFlowWorkOrderEntities(ctx, flowId),
        getMemberMap(ctx),
    ]);

    const woIds = new Set(
        fwoRows.map(r => r.work_order_id),
    );
    // projectTransitions sorts ASC; bulk wire is DESC.
    const transitions: TransitionEvent[] = [];
    for (const [woId, history] of histories) {
        if (!woIds.has(woId)) continue;
        for (const ev of projectTransitions(
            woId, history,
        )) {
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
        nowMs,
        windowDays: 90,
        memberNameById,
    };
    return { model: buildFlowStats(input), graph };
}
