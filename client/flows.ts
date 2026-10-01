import type { FlowEntity } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import { organizationCollection } from './request-context.ts';

export async function getFlowEntities(
    ctx: RequestContext,
): Promise<FlowEntity[]> {
    return (await ctx.GETCollection<FlowEntity>(
        organizationCollection(ctx, 'flows'),
    )).map((m) => m.body().toValue());
}

export * from './flow-queries.ts';
export * from './flow-mutations.ts';
