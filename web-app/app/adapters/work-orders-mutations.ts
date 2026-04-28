import {
    GET, PUT, DELETE,
} from '../../../api/api.ts';
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
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

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
): Promise<number> {
    const existing = await GET<
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

export async function postWorkOrderCreation(
    flowId: string,
    userId: string,
): Promise<string> {
    const flow = await GET<FlowEntity>(
        `flows/${flowId}`,
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

    const woId = generateCryptoSafeBase62();
    const displayId =
        await generateDisplayId(woId);
    const position =
        await nextWorkOrderPosition();
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

    await PUT<void>('work-orders', {
        id: woId,
        display_id: displayId,
        flow_graph: jsonObjectField(
            flowGraph as unknown as Record<
                string, unknown
            >,
        ),
        position,
        created_at: now,
    });

    await PUT<void>(
        'flow-work-orders',
        {
            id: generateCryptoSafeBase62(),
            flow_id: flowId,
            work_order_id: woId,
            created_at: now,
        },
    );

    const emptyValues = jsonObjectField(
        {} as Record<string, unknown>,
    );

    await PUT<void>(
        'work-order-transitions',
        {
            id: generateCryptoSafeBase62(),
            work_order_id: woId,
            from_node_id: '',
            to_node_id: startNode.id,
            user_id: userId,
            values: emptyValues,
            transitioned_at: now,
        },
    );

    await PUT<void>(
        'work-order-transitions',
        {
            id: generateCryptoSafeBase62(),
            work_order_id: woId,
            from_node_id: startNode.id,
            to_node_id: postStartNodeId,
            user_id: userId,
            values: emptyValues,
            transitioned_at: now,
        },
    );

    await PUT<void>(
        'work-order-claims',
        {
            id: generateCryptoSafeBase62(),
            work_order_id: woId,
            user_id: userId,
            claimed_at: now,
        },
    );

    return woId;
}

export interface TransitionContext {
    workOrderId: string;
    edgeId: string;
    values: Record<string, string>;
    userId: string;
    currentNodeId: string;
}

export async function postWorkOrderTransition(
    ctx: TransitionContext,
): Promise<void> {
    const {
        workOrderId, edgeId, values,
        userId, currentNodeId,
    } = ctx;
    const wo = await GET<WorkOrderEntity>(
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

    await PUT<void>(
        'work-order-transitions',
        {
            id: generateCryptoSafeBase62(),
            work_order_id: workOrderId,
            from_node_id: currentNodeId,
            to_node_id: edge.toNodeId,
            user_id: userId,
            values: jsonObjectField(
                values as Record<
                    string, unknown
                >,
            ),
            transitioned_at: now,
        },
    );

    const claims =
        await GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        );
    const claim = claims.find(
        c => c.work_order_id
            === workOrderId,
    );
    if (claim) {
        await DELETE(
            `work-order-claims/${claim.id}`,
        );
    }
}

export async function putWorkOrder(
    id: string,
    entity: Omit<WorkOrderEntity, 'id'>,
): Promise<void> {
    await PUT(`work-orders/${id}`, entity);
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
    workOrderId: string,
    userId: string,
): Promise<string> {
    const now = nowUtc();
    const claimId = generateCryptoSafeBase62();

    await PUT<void>(
        'work-order-claims',
        {
            id: claimId,
            work_order_id: workOrderId,
            user_id: userId,
            claimed_at: now,
        },
    );

    return claimId;
}
