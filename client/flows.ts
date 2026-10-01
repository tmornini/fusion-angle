import type { FlowEntity } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import { organizationCollection } from './request-context.ts';

export async function getFlowEntities(
    ctx: RequestContext,
): Promise<FlowEntity[]> {
    return (await ctx.GET<FlowEntity[]>(
        organizationCollection(ctx, 'flows'),
    )).body().toValue();
}

export * from './flow-queries.ts';
export * from './flow-mutations.ts';
