import type {
    FlowWithGraph,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    StoredGraph,
} from '../shared/types.ts';
import {
    nowUtc,
    storedWorkOrderFlowGraph,
} from '../shared/types.ts';
import { asStoredGraph } from '../shared/flow-graph-body.ts';
import {
    addUtcSeconds,
    isExpiresAtPassed,
} from '../shared/work-order-claims.ts';
import {
    validateWorkOrderFlowGraph,
    getWorkOrderHistory,
    getWorkOrderWithEtag,
    type WorkOrder,
} from './work-orders-queries.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import type {
    RequestContext,
} from './request-context.ts';
import {
    filterByField,
    organizationCollection,
    organizationItem,
} from './request-context.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import { sha256Bytes } from '../shared/digest.ts';
import {
    recordTransitionViolationsFrom,
    RecordTransitionViolations,
} from './record-transitions.ts';
import {
    getRecordInstance,
} from './record-instances.ts';
import {
    getRecordAttributesByRecord,
} from './record-attributes.ts';
import {
    getRecordForWorkOrder,
} from './flow-records.ts';

const workOrderChanges =
    createSubscriptionChannel();

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

// An operation on a work order latches the head it read.
// A GET that carried no tag leaves nothing to latch.
export function workOrderIfMatch(
    etag: string | undefined,
): readonly [string, string] {
    if (etag === undefined) {
        throw new Error('the work order GET carried no ETag');
    }
    return ['If-Match', '"' + etag + '"'];
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

// A creation the app has judged ready, at the position it
// chose: the flow as read is frozen into the work order.
export interface WorkOrderCreation
    extends WorkOrderCreationInput {
    readonly flow: FlowWithGraph;
    readonly position: number;
}

export async function postWorkOrderCreation(
    ctx: RequestContext,
    creation: WorkOrderCreation,
): Promise<void> {
    const displayId = await generateDisplayId(
        creation.workOrderId,
    );
    const graph: StoredGraph =
        asStoredGraph(
            creation.flow.graph, 'flow.graph',
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

    const now = nowUtc();

    const flowGraph: WorkOrderFlowGraph =
        {
            name: creation.flow.name,
            lockTimeout: creation.flow.lock_timeout,
            nodes: graph.nodes,
            edges: graph.edges,
        };

    const flowGraphField =
        storedWorkOrderFlowGraph(flowGraph);
    // The work-order row, its flow-link join row, and the three
    // initial state events (start, post-start, claimed) write as
    // ONE named operation. The work-order body OMITS
    // organization_id — the org fence stamps it from the verified
    // token; the join row derives org from its flow. The three
    // event ids are minted client-side so a retry hits the same
    // rows; their authorship is stamped server-side from the
    // token, never the body.
    await ctx.POST(
        organizationCollection(ctx, 'work-orders'),
        {
        id: creation.workOrderId,
        workOrder: {
            display_id: displayId,
            flow_graph: flowGraphField,
            position: creation.position,
        },
        flowWorkOrderId: creation.flowLinkId,
        flowWorkOrder: {
            flow_id: creation.flowId,
            work_order_id: creation.workOrderId,
            at: now,
        },
        stateEventIds: [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
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
    // Snapshot etag of the instance the operator
    // is looking at. Value-bearing If-Match uses
    // this, never a submit-time GET, so a
    // concurrent PATCH 412s (WB19a / WB19b).
    instanceEtag?: string;
}

// Diff form pending vs instance head into set/clear.
// Unchanged values are OMITTED — sending them trips
// all-or-nothing ACL on readonly-role attributes.
// Blank pending where head is set → clear.
function instanceDelta(
    pending: Record<string, string>,
    head: ReadonlyMap<string, string>,
): {
    set: { attribute_id: string; value: string }[];
    clear: string[];
} {
    const set: {
        attribute_id: string;
        value: string;
    }[] = [];
    const clear: string[] = [];
    for (const [attrId, value] of
        Object.entries(pending)
    ) {
        const stored = head.get(attrId);
        if (value === '') {
            if (
                stored !== undefined
                && stored !== ''
            ) {
                clear.push(attrId);
            }
            continue;
        }
        if (value !== stored) {
            set.push({
                attribute_id: attrId,
                value,
            });
        }
    }
    return { set, clear };
}

export async function postWorkOrderTransition(
    ctx: RequestContext,
    input: WorkOrderTransitionInput,
): Promise<void> {
    const {
        workOrderId, edgeId, values, instanceEtag,
    } = input;
    // Wave 1: wo with its tag + history + record binding
    // (all keyed by workOrderId).
    const [read, history, recordId] =
        await Promise.all([
            ctx.GETWithEtag<WorkOrderEntity>(
                organizationItem(
                    ctx, 'work-orders', workOrderId,
                ),
            ),
            getWorkOrderHistory(ctx, workOrderId),
            getRecordForWorkOrder(ctx, workOrderId),
        ]);
    const wo = read.body;
    const workOrderTag = workOrderIfMatch(read.etag);
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

    // Bound embed → one instance GET for head + etag.
    // Unbound → null storedValues (A3 gate mirror).
    const boundInstanceId = wo.instance_id;
    const boundRecordTypeId = wo.record_type_id;
    const needsInstance =
        boundInstanceId !== undefined
        && boundRecordTypeId !== undefined;
    // Wave 2: instance head (if bound) ∥ attributes
    // (if a record is bound to the flow).
    const [instance, attributes] =
        await Promise.all([
            needsInstance
                ? getRecordInstance(
                    ctx,
                    boundRecordTypeId!,
                    boundInstanceId!,
                )
                : Promise.resolve(null),
            recordId === null
                ? Promise.resolve([])
                : getRecordAttributesByRecord(
                    ctx, recordId,
                ),
        ]);
    const storedValues = instance === null
        ? null
        : instance.values;
    const etag = instanceEtag
        ?? (instance === null
            ? undefined
            : instance.etag);

    const pendingValues = new Map(
        Object.entries(values),
    );
    // Current-node gate: form fields + requiredness
    // match the node the operator is leaving.
    const violations =
        recordTransitionViolationsFrom(
            workOrderId,
            fg,
            history,
            attributes,
            pendingValues,
            storedValues,
        );
    if (violations.length > 0) {
        throw new RecordTransitionViolations(
            violations,
        );
    }

    const { set, clear } = storedValues === null
        ? { set: [], clear: [] as string[] }
        : instanceDelta(values, storedValues);
    const valueBearing =
        set.length + clear.length > 0;

    // Mint the transition event id client-side so a
    // retry hits the same row under message_hash.
    const transitionEventId =
        generateIdentifier();

    // If the caller holds the work order's live claim, the
    // transition implicitly releases it — carry a
    // 'claim_released' event the named POST writes
    // atomically alongside the transition. The release
    // event is authored server-side by the verified
    // caller (actor).
    const claim = wo.claim;
    const hasLiveClaim = claim !== undefined
        && !isExpiresAtPassed(claim.expires_at)
        && claim.member_id === ctx.identity.id;
    // Mint transitionAt first: the route emits the
    // transition event before the release event, so
    // transitionAt < release.at must hold in the
    // at-ordered ledger (latest at = current state).
    // Both mints stay await-free before POST.
    const transitionAt = nowUtc();
    const release = hasLiveClaim
        ? {
            id: generateIdentifier(),
            state: 'claim_released',
            at: nowUtc(),
        }
        : null;

    const body: Record<string, unknown> = {
        transitionEventId,
        targetState: edge.toNodeId,
        release,
        transitionAt,
    };

    if (valueBearing) {
        if (
            boundInstanceId === undefined
            || boundRecordTypeId === undefined
            || etag === undefined
        ) {
            throw new Error(
                'value-bearing transition requires'
                + ' a bound instance head',
            );
        }
        body['instance_id'] = boundInstanceId;
        body['record_type_id'] = boundRecordTypeId;
        body['set'] = set;
        body['clear'] = clear;
        // NO auto-retry on 412 — the page owns recovery.
        // The work order's tag, then the instance's.
        await ctx.POSTWithHeaders(
            organizationItem(
                ctx, 'work-orders', workOrderId,
            ) + '/transition',
            body,
            [[
                'If-Match',
                workOrderTag[1] + ', "' + etag + '"',
            ]],
        );
    } else {
        // Pure move: no delta; the work order's tag alone.
        await ctx.POSTWithHeaders(
            organizationItem(
                ctx, 'work-orders', workOrderId,
            ) + '/transition',
            body,
            [workOrderTag],
        );
    }

    workOrderChanges.notify();
}

// Bind a work order to one org-owned instance of one
// record type, latching the head it read; a rebind is
// refused. Notify on success.
export async function putWorkOrderBinding(
    ctx: RequestContext,
    workOrderId: string,
    instanceId: string,
    recordTypeId: string,
): Promise<void> {
    const { etag } = await getWorkOrderWithEtag(
        ctx, workOrderId,
    );
    await ctx.PUT(
        organizationItem(
            ctx, 'work-orders', workOrderId,
        ) + '/binding',
        {
            instance_id: instanceId,
            record_type_id: recordTypeId,
        },
        [workOrderIfMatch(etag)],
    );
    workOrderChanges.notify();
}

// The fields replace the head's; its state, claim, and
// binding carry over. The PUT names the head it read.
export async function putWorkOrder(
    ctx: RequestContext,
    id: string,
    workOrder: Omit<WorkOrder, 'id' | 'organizationId'>,
): Promise<void> {
    const { etag } = await getWorkOrderWithEtag(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'work-orders', id),
        {
            display_id: workOrder.displayId,
            flow_graph: storedWorkOrderFlowGraph(
                workOrder.flowGraph,
            ),
            position: workOrder.position,
        },
        [workOrderIfMatch(etag)],
    );
    workOrderChanges.notify();
}

// The claim decision lives server-side: PUT
// work-orders/:id/claim latches the head this call read,
// so two tabs racing the same claim cannot both succeed —
// the later one's tag is stale — and the duplicate-claim
// TOCTOU is closed at the statement, not papered over by
// a disabled button. The caller mints event ids plus
// expires_at (the stored fact). expireAt is minted BEFORE
// claimAt so it orders earlier in the event log (nowUtc
// is strictly monotonic).
export async function putWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    const { workOrder, etag } = await getWorkOrderWithEtag(
        ctx, workOrderId,
    );
    const expireAt = nowUtc();
    const claimAt = nowUtc();
    const expiresAt = addUtcSeconds(
        claimAt, workOrder.flowGraph.lockTimeout,
    );
    await ctx.PUT(
        organizationItem(
            ctx, 'work-orders', workOrderId,
        ) + '/claim', {
            claimEventId: generateIdentifier(),
            claimAt,
            expireEventId: generateIdentifier(),
            expireAt,
            expires_at: expiresAt,
        },
        [workOrderIfMatch(etag)],
    );
    workOrderChanges.notify();
}
