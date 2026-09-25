import type { FlowEntity } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import { organizationCollection } from './request-context.ts';

export async function getFlowEntities(
    ctx: RequestContext,
): Promise<FlowEntity[]> {
    return ctx.GET<FlowEntity[]>(
        organizationCollection(ctx, 'flows'),
    );
}

export * from './flow-queries.ts';
export * from './flow-mutations.ts';
