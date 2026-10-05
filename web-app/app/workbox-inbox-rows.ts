import {
    getWorkOrders,
    getWorkOrderHistories,
    projectTransitions,
    activeClaimFromHistory,
    getMemberMap,
    type RequestContext,
    type WorkOrder,
    type TransitionEvent,
} from '../../client/index.ts';
import { type Member } from '../../shared/types.ts';
import type { Id } from '../../shared/types.ts';

export interface InboxRows {
    workOrders: WorkOrder[];
    transitionsByWo: Map<Id, TransitionEvent[]>;
    activeClaimsByWo: Map<
        Id, { memberId: Id; at: string }
    >;
    memberMap: Map<string, Member>;
}

export async function getInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    const [
        workOrders, memberMap,
    ] = await Promise.all([
        getWorkOrders(ctx),
        getMemberMap(ctx),
    ]);
    const histories = await getWorkOrderHistories(
        ctx, workOrders,
    );
    const lockTimeoutByWo = new Map<Id, number>(
        workOrders.map(wo => [
            wo.id,
            wo.flowGraph.lockTimeout,
        ]),
    );
    const transitionsByWo = new Map<
        Id, TransitionEvent[]
    >();
    const activeClaimsByWo = new Map<
        Id, { memberId: Id; at: string }
    >();
    for (const [woId, history] of histories) {
        const events = projectTransitions(
            woId, history,
        );
        if (events.length > 0) {
            transitionsByWo.set(woId, events);
        }
        const lockTimeout =
            lockTimeoutByWo.get(woId);
        if (lockTimeout === undefined) continue;
        const claim = activeClaimFromHistory(
            history, lockTimeout,
        );
        if (claim !== null) {
            activeClaimsByWo.set(woId, claim);
        }
    }
    return {
        workOrders,
        transitionsByWo,
        activeClaimsByWo,
        memberMap,
    };
}
