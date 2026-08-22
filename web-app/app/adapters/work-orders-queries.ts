import type {
    FlowWorkOrderEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    WorkOrderHistoryEventEntity,
    Id,
} from '../../../api/types.ts';
import {
    msSinceUtc,
    MS_PER_SECOND,
} from '../../../api/types.ts';
import {
    asWorkOrderFlowGraph,
} from '../../../api/validators.ts';
import {
    isClaimState,
} from '../../../api/work-order-claims.ts';
import type { RequestContext } from './shared.ts';
import {
    organizationCollection,
    organizationItem,
} from './shared.ts';
import { compareIdentifiers } from
    '../../../shared/identifier.ts';

export type {
    WorkOrderEntity,
    WorkOrderFlowGraph,
    WorkOrderHistoryEventEntity,
    GraphNode,
    GraphEdge,
    NodeAttribute,
} from '../../../api/types.ts';

/* ── Types ───────────────── */

export interface HistoryFieldValue {
    fieldName: string;
    value: string;
}

export interface HistoryEntry {
    fromNodeName: string;
    toNodeName: string;
    memberName: string;
    transitionedAt: string;
    fieldValues: HistoryFieldValue[];
}

export type ClaimStatus =
    | { kind: 'unclaimed' }
    | {
        kind: 'claimed';
        byCurrentMember: boolean;
        at: string;
    };

// A transition event in the shape flow-stats-aggregate
// and the workbox detail presenter expect. Derived from
// work-order history: each non-claim event is a transition
// into state=toNodeId. The first event is the creation
// transition — it has no prior node, so its union member
// carries no fromNodeId; every step names the node it left.
// The id is the underlying state event's id — the foreign-
// key target for state_field_values. The adapter is the
// divorce point: the projection exits in camelCase;
// snake_case stays on the storage rows.
export interface CreationTransition {
    kind: 'creation';
    id: Id;
    workOrderId: Id;
    toNodeId: Id;
    memberId: Id;
    at: string;
}

export interface StepTransition {
    kind: 'step';
    id: Id;
    workOrderId: Id;
    fromNodeId: Id;
    toNodeId: Id;
    memberId: Id;
    at: string;
}

export type TransitionEvent =
    | CreationTransition
    | StepTransition;

/* ── Helpers ─────────────── */

export function validateWorkOrderFlowGraph(
    raw: unknown,
): WorkOrderFlowGraph {
    return asWorkOrderFlowGraph(
        raw, 'workOrder.flowGraph',
    );
}

// The parsed domain twin of WorkOrderEntity: the
// adapter is the divorce point, so above the storage
// seam the flow graph is a real WorkOrderFlowGraph,
// never the raw body value the datastore persists,
// and the fields speak camelCase.
export interface WorkOrder {
    id: Id;
    organizationId: Id;
    displayId: string;
    flowGraph: WorkOrderFlowGraph;
    position: number;
    // Optional bind embed from GET (absent when unbound).
    instanceId?: Id;
    recordTypeId?: Id;
}

function toWorkOrder(
    entity: WorkOrderEntity,
): WorkOrder {
    const out: WorkOrder = {
        id: entity.id,
        organizationId: entity.organization_id,
        displayId: entity.display_id,
        flowGraph: validateWorkOrderFlowGraph(
            entity.flow_graph,
        ),
        position: entity.position,
    };
    if (
        entity.instance_id !== undefined
        && entity.record_type_id !== undefined
    ) {
        out.instanceId = entity.instance_id;
        out.recordTypeId = entity.record_type_id;
    }
    return out;
}

/* ── Field values (from history) ─── */

// The camelCase domain shape of one field value
// written with a transition. The parent event id is
// the grouping key; attributeId references the record
// attribute that named the field.
export interface StateFieldValue {
    readonly attributeId: Id;
    readonly value: string;
}

// Group non-empty field_values from history rows by
// parent event id. An event that wrote no values has
// no map entry (Map.get returns undefined — the call
// site treats that as "no field values").
export function fieldValuesByEventFromHistory(
    history: readonly WorkOrderHistoryEventEntity[],
): Map<Id, StateFieldValue[]> {
    const byEvent = new Map<Id, StateFieldValue[]>();
    for (const row of history) {
        if (row.field_values.length === 0) continue;
        byEvent.set(
            row.id,
            row.field_values.map(fv => ({
                attributeId: fv.attribute_id,
                value: fv.value,
            })),
        );
    }
    return byEvent;
}

/* ── Per-item history fan-in ────────── */

// Parallel GET work-orders/:id/history for each live
// work-order. Same Map shape as the retired bulk door.
export async function getWorkOrderHistories(
    ctx: RequestContext,
): Promise<Map<Id, WorkOrderHistoryEventEntity[]>> {
    const orders = await ctx.GET<{ id: Id }[]>(
        organizationCollection(ctx, 'work-orders'),
    );
    const pairs = await Promise.all(
        orders.map(async (row) => {
            const history = await ctx.GET<
                WorkOrderHistoryEventEntity[]
            >(
                organizationItem(ctx, 'work-orders', row.id)
                    + '/history',
            );
            return [row.id, history] as const;
        }),
    );
    return new Map(pairs);
}

// Active claims: fan-in per-item history, then per-WO
// activeClaimFromHistory against that order's lockTimeout
// (passed in — timeout lives in the frozen flow_graph the
// caller already parses). Orders without a timeout entry
// are skipped (outside the work-order set).
export async function getActiveClaimsByWorkOrder(
    ctx: RequestContext,
    lockTimeoutByWorkOrder: ReadonlyMap<Id, number>,
): Promise<Map<Id, { memberId: Id; at: string }>> {
    const histories = await getWorkOrderHistories(ctx);
    const out = new Map<
        Id, { memberId: Id; at: string }
    >();
    for (const [entityId, history] of histories) {
        const lockTimeout =
            lockTimeoutByWorkOrder.get(entityId);
        if (lockTimeout === undefined) continue;
        const claim = activeClaimFromHistory(
            history, lockTimeout,
        );
        if (claim !== null) {
            out.set(entityId, claim);
        }
    }
    return out;
}

// Project non-claim history rows into TransitionEvent
// ASC order for presenters and the transition gate.
// Creation is first; each later event is a step from
// the prior node. Consumers that need DESC (or the
// raw wire) should read getWorkOrderHistory directly.
export function projectTransitions(
    workOrderId: Id,
    events: readonly WorkOrderHistoryEventEntity[],
): TransitionEvent[] {
    // ASC by the wire's (at, id) total order — not at alone.
    // History is DESC; a stable sort on at would reverse
    // equal-timestamp ties (same second, later id first).
    const transitions = events
        .filter(ev => !isClaimState(ev.state))
        .toSorted((a, b) => {
            const byAt = a.at.localeCompare(b.at);
            if (byAt !== 0) return byAt;
            return compareIdentifiers(a.id, b.id);
        });
    const out: TransitionEvent[] = [];
    let prior: Id | null = null;
    for (const ev of transitions) {
        const base = {
            id: ev.id,
            workOrderId,
            toNodeId: ev.state,
            memberId: ev.member_id,
            at: ev.at,
        };
        out.push(prior === null
            ? { kind: 'creation', ...base }
            : {
                kind: 'step',
                fromNodeId: prior,
                ...base,
            });
        prior = ev.state;
    }
    return out;
}

// Transitions for flow-stats and the workbox inbox:
// fan-in per-item history, then per-entity projection.
// Groups with only claim events produce no map entry
// (empty transition list is not useful to callers).
export async function getTransitionEventsByWorkOrder(
    ctx: RequestContext,
): Promise<Map<Id, TransitionEvent[]>> {
    const histories = await getWorkOrderHistories(ctx);
    const out = new Map<Id, TransitionEvent[]>();
    for (const [entityId, history] of histories) {
        const events = projectTransitions(
            entityId, history,
        );
        if (events.length === 0) continue;
        out.set(entityId, events);
    }
    return out;
}

/* ── Per-id history ──────── */

// GET work-orders/:id/history — lifecycle events with
// field_values folded inline, (at, id) DESC (index 0
// is current). Source of truth for every single-WO
// lifecycle read below.
export async function getWorkOrderHistory(
    ctx: RequestContext,
    id: Id,
): Promise<WorkOrderHistoryEventEntity[]> {
    return ctx.GET<WorkOrderHistoryEventEntity[]>(
        organizationItem(ctx, 'work-orders', id)
            + '/history',
    );
}

// History is DESC: the first non-claim event is the
// current node. Null when no transitions exist.
export function currentNodeIdFromHistory(
    history: readonly WorkOrderHistoryEventEntity[],
): Id | null {
    const latest = history.find(
        ev => !isClaimState(ev.state),
    );
    return latest === undefined ? null : latest.state;
}

export async function getWorkOrderCurrentNodeId(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<Id | null> {
    const history = await getWorkOrderHistory(
        ctx, workOrderId,
    );
    return currentNodeIdFromHistory(history);
}

// History is DESC: the first claim-vocabulary event is
// the latest claim state. A 'claimed' event older than
// lockTimeout is implicitly expired.
export function activeClaimFromHistory(
    history: readonly WorkOrderHistoryEventEntity[],
    lockTimeout: number,
): { memberId: Id; at: string } | null {
    const latest = history.find(
        ev => isClaimState(ev.state),
    );
    if (
        latest === undefined
        || latest.state !== 'claimed'
    ) {
        return null;
    }
    if (
        msSinceUtc(latest.at)
        >= lockTimeout * MS_PER_SECOND
    ) {
        return null;
    }
    return {
        memberId: latest.member_id,
        at: latest.at,
    };
}

export async function getWorkOrderActiveClaim(
    ctx: RequestContext,
    workOrderId: Id,
    lockTimeout: number,
): Promise<{ memberId: Id; at: string } | null> {
    const history = await getWorkOrderHistory(
        ctx, workOrderId,
    );
    return activeClaimFromHistory(
        history, lockTimeout,
    );
}

export function transitionEventsFromHistory(
    workOrderId: Id,
    history: readonly WorkOrderHistoryEventEntity[],
): TransitionEvent[] {
    return projectTransitions(workOrderId, history);
}

export async function getWorkOrderTransitionEvents(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<TransitionEvent[]> {
    const history = await getWorkOrderHistory(
        ctx, workOrderId,
    );
    return transitionEventsFromHistory(
        workOrderId, history,
    );
}

/* ── Reads ───────────────── */

async function getWorkOrderEntities(
    ctx: RequestContext,
): Promise<WorkOrderEntity[]> {
    return ctx.GET<WorkOrderEntity[]>(
        organizationCollection(ctx, 'work-orders'),
    );
}

export async function getWorkOrders(
    ctx: RequestContext,
): Promise<WorkOrder[]> {
    const rows = await getWorkOrderEntities(ctx);
    return rows.map(toWorkOrder);
}

export async function getFlowWorkOrderEntities(
    ctx: RequestContext,
    flowId: string,
): Promise<FlowWorkOrderEntity[]> {
    return ctx.GET<
        FlowWorkOrderEntity[]
    >(
        organizationItem(ctx, 'flows', flowId)
            + '/work-orders/',
    );
}

export async function getWorkOrder(
    ctx: RequestContext,
    id: string,
): Promise<WorkOrder> {
    const row = await ctx.GET<WorkOrderEntity>(
        organizationItem(ctx, 'work-orders', id),
    );
    return toWorkOrder(row);
}
