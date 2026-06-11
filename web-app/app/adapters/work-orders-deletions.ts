import type { RequestContext } from './shared.ts';
import {
    buildStateEventOp,
} from './state-events.ts';
import {
    notifyWorkOrderChanges,
} from './work-orders-mutations.ts';

// Records a 'claim_released' state event — the
// caller's intent is "stop the claim". The
// operation appends a single event to the log;
// the `delete` prefix preserves caller-facing
// continuity (the user action is "release the
// work order"), but semantically this is an
// append in the append-only state log.
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx,
                workOrderId,
                'claim_released',
            ),
        ],
    });
    notifyWorkOrderChanges();
}
