import type { RequestContext } from './shared.ts';

export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    claimId: string,
): Promise<void> {
    await ctx.DELETE(
        `work-order-claims/${claimId}`,
    );
}
