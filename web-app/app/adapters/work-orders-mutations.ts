import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    jsonObjectField,
    msSinceUtc,
    MS_PER_SECOND,
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
    getCurrentHumanMember,
} from './members.ts';
import {
    validateFlowForCreation,
    formatFlowProblem,
} from './flow-publish.ts';
import {
    buildStateEventOp,
} from './state-events.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
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
            'work-orders',
            'states',
            'state-field-values',
            'flow-work-orders',
        ],
    );

export function subscribeWorkOrderChanges(
    fn: () => void,
): () => void {
    return workOrderChanges.subscribe(fn);
}

const CLAIM_STATES: ReadonlySet<string> = new Set([
    'claimed',
    'claim_released',
    'claim_expired',
]);

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

// Locate the latest claim-vocabulary event for one
// work order from a snapshot of the global states
// log. Returns null if none. Used by
// postWorkOrderClaim to decide whether a prior
// 'claimed' event has aged past the flow's lock
// timeout — if so, the new claim records
// 'claim_expired' for the prior claimant alongside
// its own 'claimed' event.
function latestClaimEvent(
    states: readonly StateEntity[],
    workOrderId: string,
): StateEntity | null {
    let latest: StateEntity | null = null;
    for (const ev of states) {
        if (ev.entity_id !== workOrderId) continue;
        if (!CLAIM_STATES.has(ev.state)) continue;
        if (latest === null || ev.at >= latest.at) {
            latest = ev;
        }
    }
    return latest;
}

function isClaimEventExpired(
    claim: StateEntity,
    lockTimeoutSeconds: number,
): boolean {
    return msSinceUtc(claim.at)
        >= lockTimeoutSeconds * MS_PER_SECOND;
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
    const existing =
        await ctx.GET<WorkOrderEntity[]>('work-orders');
    const position = nextPosition(
        existing.map(w => w.position),
    );
    const now = nowUtc();

    const flowGraph: WorkOrderFlowGraph =
        {
            flowId: flow.id,
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
    entity: Omit<WorkOrderEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`work-orders/${id}`, entity);
    workOrderChanges.notify();
}

// Two tabs can both observe no live claim, both
// write a 'claimed' event, both succeed —
// duplicate claims for one work order. localStorage
// has no compare-and-swap, so any
// read-check-write inside this function would
// still have a TOCTOU window. Structural fix lives
// in the Postgres migration: UNIQUE partial index
// on the live-claim view. Until then, the UI
// disables the claim button while a request is
// pending.
export async function postWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    // Notice any prior 'claimed' event that has
    // already aged past the flow's lockTimeout — the
    // new claim is superseding it. The
    // 'claim_expired' event names the previous
    // claimant (Codd: the event records who held
    // the claim that aged out), and lands in the
    // same atomic batch as the new claim's
    // 'claimed' event.
    const wo = await ctx.GET<WorkOrderEntity>(
        `work-orders/${workOrderId}`,
    );
    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );
    const states = await ctx.GET<StateEntity[]>(
        'states',
    );
    const priorClaim = latestClaimEvent(
        states, workOrderId,
    );
    const isPriorExpired =
        priorClaim !== null
        && priorClaim.state === 'claimed'
        && isClaimEventExpired(
            priorClaim, fg.lockTimeout,
        );
    const expiredOps: WriteOp[] = isPriorExpired
        ? [{
            method: 'put',
            resource:
                `states/`
                + `${generateCryptoSafeBase62()}`,
            body: {
                entity_id: workOrderId,
                state: 'claim_expired',
                member_id: priorClaim!.member_id,
                at: nowUtc(),
            },
        }]
        : [];

    await ctx.commit({
        ops: [
            ...expiredOps,
            await buildStateEventOp(
                ctx,
                workOrderId,
                'claimed',
            ),
        ],
    });

    workOrderChanges.notify();
}
