import type { RequestContext } from './request-context.ts';
import {
    ifMatchField,
    organizationItem,
} from './request-context.ts';
import { notifyWorkOrderChanges } from './work-orders-mutations.ts';
import { getWorkOrderWithEtag } from './work-orders-queries.ts';

// Releases the live claim via DELETE on the claim
// document, latching the work order's head it read. The
// `delete` prefix matches the verb and the user action
// ("release the work order").
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    const { etag } = await getWorkOrderWithEtag(
        ctx, workOrderId,
    );
    await ctx.DELETEWithEtag(
        organizationItem(ctx, 'work-orders', workOrderId)
            + '/claim',
        [ifMatchField(etag)],
    );
    notifyWorkOrderChanges();
}
