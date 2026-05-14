import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderClaimEntity,
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
    validateWorkOrderFlowGraph,
} from './work-orders-queries.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import type {
    RequestContext, WriteOp,
} from './shared.ts';
import {
    getCurrentHumanWorker,
} from './workers.ts';
import {
    validateFlowForCreation,
    formatFlowProblem,
} from './flow-publish.ts';

const workOrderChanges =
    createSubscriptionChannel(
        [
            'work-orders',
            'work-order-transitions',
            'work-order-claims',
            'flow-work-orders',
        ],
    );

export function subscribeWorkOrderChanges(
    fn: () => void,
): () => void {
    return workOrderChanges.subscribe(fn);
}

const FIRST_POSITION = 1;
const POSITION_STEP = 1;

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

async function nextWorkOrderPosition(
    ctx: RequestContext,
): Promise<number> {
    const existing = await ctx.GET<
        WorkOrderEntity[]
    >('work-orders');
    if (existing.length === 0) {
        return FIRST_POSITION;
    }
    const maxPosition = Math.max(
        ...existing.map(w => w.position),
    );
    return maxPosition + POSITION_STEP;
}

export interface WorkOrderCreationInput {
    workOrderId: string;
    flowLinkId: string;
    initTransitionId: string;
    postStartTransitionId: string;
    claimId: string;
    flowId: string;
}

export async function postWorkOrderCreation(
    ctx: RequestContext,
    input: WorkOrderCreationInput,
): Promise<void> {
    const worker = await getCurrentHumanWorker(ctx);
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

    const postStartEdges =
        graph.edges.filter(
            e => e.fromNodeId
                === startNode.id,
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
    const position =
        await nextWorkOrderPosition(ctx);
    const now = nowUtc();

    const flowGraph: WorkOrderFlowGraph =
        {
            flowId: flow.id,
            name: flow.name,
            description: flow.description,
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
                    created_at: now,
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
                    created_at: now,
                },
            },
            {
                method: 'put',
                resource:
                    `work-order-transitions/`
                    + `${input.initTransitionId}`,
                body: {
                    work_order_id:
                        input.workOrderId,
                    from_node_id: '',
                    to_node_id: startNode.id,
                    person_id: worker.id,
                    transitioned_at: now,
                },
            },
            {
                method: 'put',
                resource:
                    `work-order-transitions/`
                    + `${
                        input.postStartTransitionId
                    }`,
                body: {
                    work_order_id:
                        input.workOrderId,
                    from_node_id: startNode.id,
                    to_node_id: postStartNodeId,
                    person_id: worker.id,
                    transitioned_at: now,
                },
            },
            {
                method: 'put',
                resource:
                    `work-order-claims/`
                    + `${input.claimId}`,
                body: {
                    work_order_id:
                        input.workOrderId,
                    person_id: worker.id,
                    claimed_at: now,
                },
            },
        ],
    });

    workOrderChanges.notify();
}

export interface WorkOrderTransitionInput {
    transitionId: string;
    workOrderId: string;
    edgeId: string;
    values: Record<string, string>;
    fieldValueIds: Record<string, string>;
    currentNodeId: string;
}

export async function postWorkOrderTransition(
    ctx: RequestContext,
    input: WorkOrderTransitionInput,
): Promise<void> {
    const {
        transitionId, workOrderId, edgeId,
        values, fieldValueIds,
        currentNodeId,
    } = input;
    const worker = await getCurrentHumanWorker(ctx);
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

    const now = nowUtc();

    // Each field/value pair becomes its own row
    // in the transition_field_values table — Codd
    // 1NF, replacing the former JSON blob. IDs
    // are caller-supplied for retry safety.
    const fieldValueOps: WriteOp[] = [];
    for (
        const [fieldId, value]
            of Object.entries(values)
    ) {
        const id = fieldValueIds[fieldId];
        if (id === undefined) {
            throw new Error(
                'Missing fieldValueId for'
                + ' field ' + fieldId,
            );
        }
        fieldValueOps.push({
            method: 'put',
            resource:
                `transition-field-values/${id}`,
            body: {
                transition_id: transitionId,
                field_id: fieldId,
                value,
            },
        });
    }

    const claims =
        await ctx.GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        );
    const claim = claims.find(
        c => c.work_order_id
            === workOrderId,
    );
    const claimDelete: WriteOp[] = claim
        ? [{
            method: 'delete',
            resource:
                `work-order-claims/${claim.id}`,
        }]
        : [];

    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `work-order-transitions/`
                    + `${transitionId}`,
                body: {
                    work_order_id: workOrderId,
                    from_node_id: currentNodeId,
                    to_node_id: edge.toNodeId,
                    person_id: worker.id,
                    transitioned_at: now,
                },
            },
            ...fieldValueOps,
            ...claimDelete,
        ],
    });

    workOrderChanges.notify();
}

export async function putWorkOrder(
    ctx: RequestContext,
    id: string,
    entity: Omit<WorkOrderEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`work-orders/${id}`, entity);
    workOrderChanges.notify();
}

// Two tabs can both read an empty
// claims table, both write a claim,
// both succeed — duplicate claim rows
// for one work order. localStorage has
// no compare-and-swap, so any
// read-check-write inside this function
// would still have a TOCTOU window.
// Structural fix lives in the Postgres
// migration: UNIQUE (work_order_id)
// WHERE active. Until then, the UI
// disables the claim button while a
// request is pending.
export async function postWorkOrderClaim(
    ctx: RequestContext,
    claimId: string,
    workOrderId: string,
): Promise<void> {
    const worker = await getCurrentHumanWorker(ctx);
    const now = nowUtc();

    await ctx.PUT<void>(
        `work-order-claims/${claimId}`,
        {
            work_order_id: workOrderId,
            person_id: worker.id,
            claimed_at: now,
        },
    );

    workOrderChanges.notify();
}
