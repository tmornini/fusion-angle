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
import type { FetchContext } from './shared.ts';

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
    ctx: FetchContext,
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
    ctx: FetchContext,
    input: WorkOrderCreationInput,
): Promise<void> {
    const user = await ctx.getCurrentUser();
    const flow = await ctx.GET<FlowEntity>(
        `flows/${input.flowId}`,
    );
    const graph: StoredGraph =
        validateStoredGraphJson(
            flow.graph, 'flow.graph',
        );

    const startNode = graph.nodes.find(
        n => n.isStart,
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

    await ctx.PUT<void>('work-orders', {
        id: input.workOrderId,
        display_id: displayId,
        flow_graph: jsonObjectField(
            flowGraph as unknown as Record<
                string, unknown
            >,
        ),
        position,
        created_at: now,
    });

    await ctx.PUT<void>(
        'flow-work-orders',
        {
            id: input.flowLinkId,
            flow_id: input.flowId,
            work_order_id: input.workOrderId,
            created_at: now,
        },
    );

    await ctx.PUT<void>(
        'work-order-transitions',
        {
            id: input.initTransitionId,
            work_order_id: input.workOrderId,
            from_node_id: '',
            to_node_id: startNode.id,
            user_id: user.id,
            transitioned_at: now,
        },
    );

    await ctx.PUT<void>(
        'work-order-transitions',
        {
            id: input.postStartTransitionId,
            work_order_id: input.workOrderId,
            from_node_id: startNode.id,
            to_node_id: postStartNodeId,
            user_id: user.id,
            transitioned_at: now,
        },
    );

    await ctx.PUT<void>(
        'work-order-claims',
        {
            id: input.claimId,
            work_order_id: input.workOrderId,
            user_id: user.id,
            claimed_at: now,
        },
    );

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
    ctx: FetchContext,
    input: WorkOrderTransitionInput,
): Promise<void> {
    const {
        transitionId, workOrderId, edgeId,
        values, fieldValueIds,
        currentNodeId,
    } = input;
    const user = await ctx.getCurrentUser();
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

    await ctx.PUT<void>(
        'work-order-transitions',
        {
            id: transitionId,
            work_order_id: workOrderId,
            from_node_id: currentNodeId,
            to_node_id: edge.toNodeId,
            user_id: user.id,
            transitioned_at: now,
        },
    );

    // Each field/value pair becomes its own row
    // in the transition_field_values table — Codd
    // 1NF, replacing the former JSON blob. IDs
    // are caller-supplied for retry safety.
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
        await ctx.PUT<void>(
            'transition-field-values',
            {
                id,
                transition_id: transitionId,
                field_id: fieldId,
                value,
            },
        );
    }

    const claims =
        await ctx.GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        );
    const claim = claims.find(
        c => c.work_order_id
            === workOrderId,
    );
    if (claim) {
        await ctx.DELETE(
            `work-order-claims/${claim.id}`,
        );
    }

    workOrderChanges.notify();
}

export async function putWorkOrder(
    ctx: FetchContext,
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
    ctx: FetchContext,
    claimId: string,
    workOrderId: string,
): Promise<void> {
    const user = await ctx.getCurrentUser();
    const now = nowUtc();

    await ctx.PUT<void>(
        'work-order-claims',
        {
            id: claimId,
            work_order_id: workOrderId,
            user_id: user.id,
            claimed_at: now,
        },
    );

    workOrderChanges.notify();
}
