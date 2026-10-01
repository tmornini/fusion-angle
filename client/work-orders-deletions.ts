import type { WorkOrderEntity } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import { organizationItem } from './request-context.ts';
import { notifyWorkOrderChanges } from './work-orders-mutations.ts';
import {
    toWorkOrder,
    type WorkOrder,
} from './work-orders-queries.ts';

// Releases the live claim via DELETE on the claim
// document, latching the held work order's head. The
// `delete` prefix matches the verb and the user action
// ("release the work order").
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    held: WorkOrder,
): Promise<WorkOrder> {
    // The release is an operation on the work order, and
    // its route answers the work order's new head.
    const released = await ctx.DELETE<WorkOrderEntity>(
        organizationItem(ctx, 'work-orders', held.id)
            + '/claim',
        [held.message],
    );
    notifyWorkOrderChanges();
    return toWorkOrder(released);
}
