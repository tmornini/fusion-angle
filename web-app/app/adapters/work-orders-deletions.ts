import type { FetchContext } from './shared.ts';

export async function deleteWorkOrderClaim(
    ctx: FetchContext,
    claimId: string,
): Promise<void> {
    await ctx.DELETE(
        `work-order-claims/${claimId}`,
    );
}
