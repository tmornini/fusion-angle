import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    jsonObjectField,
} from '../../../api/types.ts';
import {
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import {
    latestClaimEvent,
    isClaimEventExpired,
} from '../../../api/work-order-claims.ts';
import {
    validateWorkOrderFlowGraph,
} from './work-orders-queries.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import type {
    RequestContext, WriteOp,
} from './shared.ts';
import { filterByField } from './shared.ts';
import {
    validateFlowForCreation,
    formatFlowProblem,
} from './flow-publish.ts';
import {
    buildStateEventOp,
} from './state-events.ts';
import {
    nextPosition,
} from '../drag-reorder-positions.ts';
import type { StateEntity } from '../../../api/types.ts';
import {
    validateRecordTransition,
    RecordTransitionViolations,
} from './record-transitions.ts';

const workOrderChanges =
    createSubscriptionChannel(
        [
            'work_orders',
            'states',
            'state_field_values',
            'flow_work_orders',
        ],
    );

export function subscribeWorkOrderChanges(
    fn: () => void,
): () => void {
    return workOrderChanges.subscribe(fn);
}

async function generateDisplayId(
    uuid: string,
): Promise<string> {
    const data = new TextEncoder()
        .encode(uuid);
    const hash = await crypto.subtle
        .digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    let hex = '';
    const ID_LENGTH = 4;
    for (let i = 0; i < ID_LENGTH; i++) {
        hex += (bytes[i]!)
            .toString(16)
            .padStart(2, '0');
    }
    return hex;
}

export interface WorkOrderCreationInput {
    workOrderId: string;
    flowLinkId: string;
    flowId: string;
}

export async function postWorkOrderCreation(
    ctx: RequestContext,
    input: WorkOrderCreationInput,
): Promise<void> {
    const flow = await ctx.GET<FlowEntity>(
        `flows/${input.flowId}`,
    );
    const readiness = validateFlowForCreation(flow);
    if (!readiness.ready) {
        throw new Error(
            'flow not ready: '
            + readiness.problems
                .map(formatFlowProblem)
                .join('; '),
        );
    }
    const graph: StoredGraph =
        validateStoredGraphJson(
            flow.graph, 'flow.graph',
        );

    const startNode = graph.nodes.find(
        n => n.isCreate,
    );
    if (!startNode) {
        throw new Error(
            'Flow has no start node',
        );
    }

    const postStartEdges = filterByField(
        graph.edges, 'fromNodeId', startNode.id,
    );
    const [postStartEdge] = postStartEdges;
    if (
        postStartEdges.length !== 1
        || !postStartEdge
    ) {
        throw new Error(
            'Start node must have'
            + ' exactly one outgoing'
            + ' edge',
        );
    }
    const postStartNodeId =
        postStartEdge.toNodeId;

    const displayId =
        await generateDisplayId(input.workOrderId);
    const existing =
        await ctx.GET<WorkOrderEntity[]>('work-orders');
    const position = nextPosition(
        existing.map(w => w.position),
    );
    const now = nowUtc();

    const flowGraph: WorkOrderFlowGraph =
        {
            name: flow.name,
            lockTimeout: flow.lock_timeout,
            nodes: graph.nodes,
            edges: graph.edges,
        };

    const flowGraphField = jsonObjectField(
        flowGraph as unknown as Record<
            string, unknown
        >,
    );
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `work-orders/`
                    + `${input.workOrderId}`,
                body: {
                    display_id: displayId,
                    flow_graph: flowGraphField,
                    position,
                },
            },
            {
                method: 'put',
                resource:
                    `flow-work-orders/`
                    + `${input.flowLinkId}`,
                body: {
                    flow_id: input.flowId,
                    work_order_id:
                        input.workOrderId,
                    at: now,
                },
            },
            await buildStateEventOp(
                ctx,
                input.workOrderId,
                startNode.id,
            ),
            await buildStateEventOp(
                ctx,
                input.workOrderId,
                postStartNodeId,
            ),
            await buildStateEventOp(
                ctx,
                input.workOrderId,
                'claimed',
            ),
        ],
    });

    workOrderChanges.notify();
}

export interface WorkOrderTransitionInput {
    workOrderId: string;
    edgeId: string;
    values: Record<string, string>;
    fieldValueIds: Record<string, string>;
}

export async function postWorkOrderTransition(
    ctx: RequestContext,
    input: WorkOrderTransitionInput,
): Promise<void> {
    const {
        workOrderId, edgeId,
        values, fieldValueIds,
    } = input;
    const wo = await ctx.GET<WorkOrderEntity>(
        `work-orders/${workOrderId}`,
    );
    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );

    const edge = fg.edges.find(
        e => e.id === edgeId,
    );
    if (!edge) {
        throw new Error(
            'Edge not found: ' + edgeId,
        );
    }

    const pendingValues = new Map(
        Object.entries(values),
    );
    const violations = await
        validateRecordTransition(
            ctx,
            workOrderId,
            edge.toNodeId,
            pendingValues,
        );
    if (violations.length > 0) {
        throw new RecordTransitionViolations(
            violations,
        );
    }

    const transitionOp = await buildStateEventOp(
        ctx, workOrderId, edge.toNodeId,
    );
    const transitionEventId =
        transitionOp.resource.split('/')[1]!;

    const fieldValueOps: WriteOp[] = [];
    for (
        const [attributeId, value]
            of Object.entries(values)
    ) {
        const id = fieldValueIds[attributeId];
        if (id === undefined) {
            throw new Error(
                'Missing fieldValueId for'
                + ' attribute ' + attributeId,
            );
        }
        fieldValueOps.push({
            method: 'put',
            resource:
                `state-field-values/${id}`,
            body: {
                state_event_id: transitionEventId,
                field_id: attributeId,
                value,
            },
        });
    }

    // If a live claim exists for the work order, the
    // transition implicitly releases it — record a
    // 'claim_released' event in the same batch.
    const states = await ctx.GET<StateEntity[]>(
        'states',
    );
    const latestClaim = latestClaimEvent(
        states, workOrderId,
    );
    const hasLiveClaim = latestClaim !== null
        && latestClaim.state === 'claimed'
        && !isClaimEventExpired(
            latestClaim, fg.lockTimeout,
        );
    const claimReleasedEvent: WriteOp[] = hasLiveClaim
        ? [
            await buildStateEventOp(
                ctx,
                workOrderId,
                'claim_released',
            ),
        ]
        : [];

    await ctx.commit({
        ops: [
            transitionOp,
            ...fieldValueOps,
            ...claimReleasedEvent,
        ],
    });

    workOrderChanges.notify();
}

export async function putWorkOrder(
    ctx: RequestContext,
    id: string,
    entity: Omit<WorkOrderEntity, 'id' | 'organization_id'>,
): Promise<void> {
    await ctx.PUT(`work-orders/${id}`, {
        ...entity,
    });
    workOrderChanges.notify();
}

// The claim decision lives server-side: POST
// work-orders/:id/claim reads the prior claim and
// appends the new claim events in ONE transaction,
// so two tabs racing the same claim cannot both
// succeed — the duplicate-claim TOCTOU is closed at
// the route, not papered over by a disabled button.
export async function postWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await ctx.POST(
        `work-orders/${workOrderId}/claim`, {},
    );
    workOrderChanges.notify();
}
