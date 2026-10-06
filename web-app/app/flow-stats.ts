import type { Id } from '../../shared/types.ts';
import type { FlowGraph } from '../../client/flow-queries.ts';
import type { RequestContext } from '../../client/request-context.ts';
import {
    buildFlowStats,
    type FlowStatsInput,
    type FlowStatsModel,
} from './flow-stats-aggregate.ts';
import { getRenderableFlowGraph } from './flow-graph-layout.ts';
import {
    getFlowWorkOrderEntities,
    getWorkOrderVersions,
    projectTransitions,
    type TransitionEvent,
    workOrderEventsOf,
} from '../../client/work-orders-queries.ts';
import {
    getMemberMap,
    memberName,
} from '../../client/members-union.ts';

export async function getFlowStats(
    ctx: RequestContext,
    flowId: string,
    nowMs: number,
): Promise<{
    model: FlowStatsModel;
    graph: FlowGraph;
}> {
    // Every read settles before this call does: a rejection
    // must not leave its siblings running past the caller.
    const [
        graphRead,
        fwoRead,
        memberRead,
    ] = await Promise.allSettled([
        getRenderableFlowGraph(ctx, flowId),
        getFlowWorkOrderEntities(ctx, flowId),
        getMemberMap(ctx),
    ]);
    if (graphRead.status === 'rejected') {
        throw graphRead.reason;
    }
    if (fwoRead.status === 'rejected') {
        throw fwoRead.reason;
    }
    if (memberRead.status === 'rejected') {
        throw memberRead.reason;
    }
    const graph = graphRead.value;
    const fwoRows = fwoRead.value;
    const memberMap = memberRead.value;
    // One versions read per joined work order (spec §4);
    // every read settles before this call does.
    const ids = [...new Set(
        fwoRows.map(r => r.body().toValue().work_order_id),
    )];
    const reads = await Promise.allSettled(
        ids.map((id) => getWorkOrderVersions(ctx, id)),
    );
    const transitions: TransitionEvent[] = [];
    for (const [index, read] of reads.entries()) {
        if (read.status === 'rejected') {
            throw read.reason;
        }
        transitions.push(...projectTransitions(
            ids[index]!, workOrderEventsOf(read.value),
        ));
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
