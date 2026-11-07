import {
    getWorkOrders,
    isClaimedAndUnlapsed,
    queryWorkOrders,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';
import type { Id } from '../../shared/types.ts';
import type { ActiveClaim } from
    './presenters/workbox-inbox.ts';

export interface InboxRows {
    workOrders: WorkOrder[];
    activeClaimsByWo: Map<Id, ActiveClaim>;
}

function inboxRowsOf(
    workOrders: WorkOrder[],
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
    return { workOrders, activeClaimsByWo };
}

// The inbox reads heads only (spec §4): each work order's
// node, last move, and claim ride its head, so one
// collection read serves every row.
export async function getInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    return inboxRowsOf(await getWorkOrders(ctx));
}

// The heads the work-orders QUERY matches, best match
// first, each keeping the message a drag on it latches.
export async function queryInboxRows(
    ctx: RequestContext,
    text: string,
): Promise<InboxRows> {
    return inboxRowsOf(await queryWorkOrders(ctx, text));
}
