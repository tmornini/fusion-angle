import type { RequestContext } from './shared.ts';
import { organizationItem } from './shared.ts';
import {
    notifyWorkOrderChanges,
} from './work-orders-mutations.ts';

// Releases the live claim via DELETE on the claim
// document. DELETE head = unclaimed. The `delete`
// prefix matches the verb and the user action
// ("release the work order").
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await ctx.DELETE(
        organizationItem(ctx, 'work-orders', workOrderId)
            + '/claim',
    );
    notifyWorkOrderChanges();
}
