import {
    getWorkOrders,
    getMemberMap,
    isClaimedAndUnlapsed,
    queryWorkOrders,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';
import { type Member } from '../../shared/types.ts';
import type { Id } from '../../shared/types.ts';
import type { ActiveClaim } from
    './presenters/workbox-inbox.ts';

export interface InboxRows {
    workOrders: WorkOrder[];
    activeClaimsByWo: Map<Id, ActiveClaim>;
    memberMap: Map<string, Member>;
}

function inboxRowsOf(
    workOrders: WorkOrder[],
    memberMap: InboxRows['memberMap'],
): InboxRows {
    const activeClaimsByWo = new Map<Id, ActiveClaim>();
    for (const wo of workOrders) {
        if (isClaimedAndUnlapsed(wo.claim)) {
            activeClaimsByWo.set(wo.id, {
                memberId: wo.claim.memberId,
                at: wo.claim.at,
            });
        }
    }
    return { workOrders, activeClaimsByWo, memberMap };
}

// The inbox reads heads only (spec §4): each work order's
// node, last move, and claim ride its head, so one
// collection read serves every row.
export async function getInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    const [workOrders, memberMap] = await Promise.all([
        getWorkOrders(ctx),
        getMemberMap(ctx),
    ]);
    return inboxRowsOf(workOrders, memberMap);
}

// The heads the work-orders QUERY matches, best match
// first, each keeping the message a drag on it latches.
// The members are the last full read's: the answer
// changes which work orders show, not who the members are.
export async function queryInboxRows(
    ctx: RequestContext,
    text: string,
    memberMap: InboxRows['memberMap'],
): Promise<InboxRows> {
    return inboxRowsOf(
        await queryWorkOrders(ctx, text), memberMap,
    );
}
