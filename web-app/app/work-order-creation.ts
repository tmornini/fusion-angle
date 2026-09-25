import type { RequestContext } from '../../client/shared.ts';
import { getFlowWithGraph } from
    '../../client/flow-queries.ts';
import { getWorkOrderEntities } from
    '../../client/work-orders-queries.ts';
import {
    postWorkOrderCreation,
    type WorkOrderCreationInput,
} from '../../client/work-orders-mutations.ts';
import {
    formatFlowProblem,
    validateFlowForCreation,
} from './flow-publish.ts';
import { nextPosition } from './drag-reorder-positions.ts';

// A work order starts from a flow the app judges ready, at
// the end of the list: read both, judge, place, then post.
export async function createWorkOrderFromFlow(
    ctx: RequestContext,
    input: WorkOrderCreationInput,
): Promise<void> {
    const [flow, existing] = await Promise.all([
        getFlowWithGraph(ctx, input.flowId),
        getWorkOrderEntities(ctx),
    ]);
    const readiness = validateFlowForCreation(flow);
    if (!readiness.ready) {
        throw new Error(
            'flow not ready: '
            + readiness.problems
                .map(formatFlowProblem)
                .join('; '),
        );
    }
    await postWorkOrderCreation(ctx, {
        ...input,
        flow,
        position: nextPosition(
            existing.map((w) => w.position),
        ),
    });
}
