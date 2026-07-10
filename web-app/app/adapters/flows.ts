import type { FlowEntity } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

export async function getFlowEntities(
    ctx: RequestContext,
): Promise<FlowEntity[]> {
    return ctx.GET<FlowEntity[]>('flows');
}

export * from './flow-queries.ts';
export * from './flow-mutations.ts';
export * from './flow-export.ts';
