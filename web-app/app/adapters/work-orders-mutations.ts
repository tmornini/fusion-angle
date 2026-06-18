import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    storedWorkOrderFlowGraphField,
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
    type WorkOrder,
} from './work-orders-queries.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import type {
    RequestContext,
} from './shared.ts';
import { filterByField } from './shared.ts';
import {
    validateFlowForCreation,
    formatFlowProblem,
} from './flow-publish.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import { sha256Bytes } from './digest.ts';
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

// Sibling work-order mutations outside this module ring
// the same bell their in-module siblings ring.
export function notifyWorkOrderChanges(): void {
    workOrderChanges.notify();
}

async function generateDisplayId(
    uuid: string,
): Promise<string> {
    const bytes = await sha256Bytes(uuid);
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

    const flowGraphField =
        storedWorkOrderFlowGraphField(flowGraph);
    // The work-order row, its flow-link join row, and the three
    // initial state events (start, post-start, claimed) write as
    // ONE named operation. The work-order body OMITS
    // organization_id — the org fence stamps it from the verified
    // token; the join row derives org from its flow. The three
    // event ids are minted client-side so a retry hits the same
    // rows; their authorship is stamped server-side from the
    // token, never the body.
    await ctx.POST('work-orders', {
        id: input.workOrderId,
        workOrder: {
            display_id: displayId,
            flow_graph: flowGraphField,
            position,
        },
        flowWorkOrderId: input.flowLinkId,
        flowWorkOrder: {
            flow_id: input.flowId,
            work_order_id: input.workOrderId,
            at: now,
        },
        stateEventIds: [
            generateCryptoSafeBase62(),
            generateCryptoSafeBase62(),
            generateCryptoSafeBase62(),
        ],
        // Three separate nowUtc() calls — strictly monotonic,
        // so [0] < [1] < [2] is guaranteed; latest-wins on
        // entity state is therefore deterministic.
        stateEventAts: [nowUtc(), nowUtc(), nowUtc()],
        states: [
            startNode.id,
            postStartNodeId,
            'claimed',
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

    // Mint the transition event id client-side so a retry
    // hits the same row; the field-value rows reference it.
    const transitionEventId = generateCryptoSafeBase62();

    const fieldValues = Object.entries(values).map(
        ([attributeId, value]) => {
            const id = fieldValueIds[attributeId];
            if (id === undefined) {
                throw new Error(
                    'Missing fieldValueId for'
                    + ' attribute ' + attributeId,
                );
            }
            return {
                id,
                fields: {
                    state_event_id: transitionEventId,
                    attribute_id: attributeId,
                    value,
                },
            };
        },
    );

    // If a live claim exists for the work order, the
    // transition implicitly releases it — carry a
    // 'claim_released' event the named POST writes atomically
    // alongside the transition. The release event is authored
    // server-side by the verified caller (actor), exactly as
    // the old commit batch authored it through PUT /states/:id.
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
    // Mint transitionAt first: the route emits the
    // transition event before the release event, so
    // transitionAt < release.at must hold in the
    // at-ordered ledger (latest at = current state).
    const transitionAt = nowUtc();
    const release = hasLiveClaim
        ? {
            id: generateCryptoSafeBase62(),
            state: 'claim_released',
            at: nowUtc(),
        }
        : null;

    await ctx.POST(
        `work-orders/${workOrderId}/transition`,
        {
            transitionEventId,
            targetState: edge.toNodeId,
            fieldValues,
            release,
            transitionAt,
        },
    );

    workOrderChanges.notify();
}

export async function putWorkOrder(
    ctx: RequestContext,
    id: string,
    workOrder: Omit<WorkOrder, 'id' | 'organizationId'>,
): Promise<void> {
    await ctx.PUT(`work-orders/${id}`, {
        display_id: workOrder.displayId,
        flow_graph: storedWorkOrderFlowGraphField(
            workOrder.flowGraph,
        ),
        position: workOrder.position,
    });
    workOrderChanges.notify();
}

// The claim decision lives server-side: POST
// work-orders/:id/claim reads the prior claim and
// appends the new claim events in ONE transaction,
// so two tabs racing the same claim cannot both
// succeed — the duplicate-claim TOCTOU is closed at
// the route, not papered over by a disabled button.
// The caller mints all four values: expireAt is
// minted BEFORE claimAt so it orders earlier in the
// event log (nowUtc is strictly monotonic).
export async function postWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    const expireAt = nowUtc();
    const claimAt = nowUtc();
    await ctx.POST(
        `work-orders/${workOrderId}/claim`, {
            claimEventId: generateCryptoSafeBase62(),
            claimAt,
            expireEventId: generateCryptoSafeBase62(),
            expireAt,
        },
    );
    workOrderChanges.notify();
}
