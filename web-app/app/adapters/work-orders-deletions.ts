import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import { nowUtc } from '../../../api/types.ts';
import {
    notifyWorkOrderChanges,
} from './work-orders-mutations.ts';

// Releases the live claim via the named release op — the
// caller's intent is "stop the claim". The read-decide-append
// lives server-side (postWorkOrderReleaseOp), closing the
// old funnel's decide-client-side race; the `delete` prefix
// preserves caller-facing continuity (the user action is
// "release the work order").
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await ctx.POST(`work-orders/${workOrderId}/release`, {
        releaseEventId: generateCryptoSafeBase62(),
        releaseAt: nowUtc(),
    });
    notifyWorkOrderChanges();
}
