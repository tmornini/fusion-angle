import type {
    FlowWorkOrderEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    WorkOrderEventEntity,
    Id,
} from '../shared/types.ts';
import { asWorkOrderFlowGraph } from '../shared/flow-graph-body.ts';
import {
    isClaimState,
} from '../shared/work-order-claims.ts';
import type { RequestContext } from './request-context.ts';
import {
    organizationCollection,
    organizationItem,
} from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

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
    | { state: 'unclaimed' }
    | {
        state: 'claimed';
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

// Absence of a claim is named at the adapter, so no
// reader tests a field for undefined or null.
export type WorkOrderClaim =
    | { readonly state: 'unclaimed' }
    | {
        readonly state: 'claimed',
        readonly memberId: Id,
        readonly at: string,
        readonly expiresAt: string,
    };

// The parsed domain twin of WorkOrderEntity: the
// adapter is the divorce point, so above the storage
// seam the flow graph is a real WorkOrderFlowGraph,
// never the raw body value the datastore persists,
// and the fields speak camelCase. The message is the
// head it was read from, which a write from it latches.
export interface WorkOrder {
    readonly message: HttpMessage<WorkOrderEntity>;
    id: Id;
    organizationId: Id;
    displayId: string;
    flowGraph: WorkOrderFlowGraph;
    position: number;
    nodeId: Id;
    transition: { readonly memberId: Id; readonly at: string };
    claim: WorkOrderClaim;
    // Optional bind embed from GET (absent when unbound).
    instanceId?: Id;
    recordTypeId?: Id;
}

export function toWorkOrder(
    message: HttpMessage<WorkOrderEntity>,
): WorkOrder {
    const entity = message.body().toValue();
    const out: WorkOrder = {
        message,
        id: entity.id,
        organizationId: entity.organization_id,
        displayId: entity.display_id,
        flowGraph: validateWorkOrderFlowGraph(
            entity.flow_graph,
        ),
        position: entity.position,
        nodeId: entity.state,
        transition: {
            memberId: entity.transition.member_id,
            at: entity.transition.at,
        },
        claim: entity.claim === undefined
            ? { state: 'unclaimed' }
            : {
                state: 'claimed',
                memberId: entity.claim.member_id,
                at: entity.claim.at,
                expiresAt: entity.claim.expires_at,
            },
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
    history: readonly WorkOrderEventEntity[],
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

// Project non-claim events into TransitionEvents in the
// order given, which every caller passes in chain order.
// Creation is first; each later event is a step from
// the prior node.
export function projectTransitions(
    workOrderId: Id,
    events: readonly WorkOrderEventEntity[],
): TransitionEvent[] {
    // Chain order is the order (spec Decision 8): the
    // ledger's, oldest first. Two events can share an `at`,
    // so no sort on `at` or id may reorder them.
    const transitions = events
        .filter(ev => !isClaimState(ev.state));
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

/* ── Reads ───────────────── */

// GET work-orders/:id/versions/: every version the work
// order stored, oldest first, each the stored response.
export async function getWorkOrderVersions(
    ctx: RequestContext,
    id: Id,
): Promise<HttpMessage<WorkOrderEntity>[]> {
    return await ctx.GETCollection<WorkOrderEntity>(
        organizationItem(ctx, 'work-orders', id)
            + '/versions/',
    );
}

// A work order's events, in chain order: each version
// carries the events it recorded, and versions arrive
// oldest first.
export function workOrderEventsOf(
    versions: readonly HttpMessage<WorkOrderEntity>[],
): WorkOrderEventEntity[] {
    return versions.flatMap(
        (version) => version.body().toValue().events,
    );
}

export async function getWorkOrderEntities(
    ctx: RequestContext,
): Promise<HttpMessage<WorkOrderEntity>[]> {
    return await ctx.GETCollection<WorkOrderEntity>(
        organizationCollection(ctx, 'work-orders'),
    );
}

export async function getWorkOrders(
    ctx: RequestContext,
): Promise<WorkOrder[]> {
    return (await getWorkOrderEntities(ctx)).map(toWorkOrder);
}

export async function getFlowWorkOrderEntities(
    ctx: RequestContext,
    flowId: string,
): Promise<HttpMessage<FlowWorkOrderEntity>[]> {
    return await ctx.GETCollection<FlowWorkOrderEntity>(
        organizationItem(ctx, 'flows', flowId)
            + '/work-orders/',
    );
}

export async function getWorkOrder(
    ctx: RequestContext,
    id: string,
): Promise<WorkOrder> {
    return toWorkOrder(await ctx.GET<WorkOrderEntity>(
        organizationItem(ctx, 'work-orders', id),
    ));
}
