import type { DbAdapter } from './db.ts';
import {
    asWorkOrderFlowGraph,
} from './validators.ts';
import {
    ApiError,
    HTTP_CONFLICT,
} from './http-errors.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import {
    relationFailClosed,
} from './flow-graph-relations.ts';
import {
    deriveStateFieldValueReferrers,
} from './derive-state-field-values.ts';
import {
    flowGraphBindingsFromPairs,
} from './derive-flows.ts';
import { deriveDocumentsAt } from './derive-documents.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveInstanceCollection,
} from './derive-record-instances.ts';

// Destroying a record attribute must not orphan its
// covenants: state_field_values rows name the attribute in
// IMMUTABLE event payloads (attribute_id), and flow / work-order
// graphs bind it to nodes (NodeAttribute.attributeId).
// Cascading would rewrite history the ledger promised to
// keep — so destruction is RESTRICTED: a referenced
// attribute refuses to die (409) until its referrers are
// gone. This module counts the referrers inside the SAME
// transaction that would delete, so no writer can slip a
// new reference between the check and the splice.

export interface AttributeReferrers {
    readonly valueCount: number;
    readonly flowIds: readonly string[];
    readonly workOrderIds: readonly string[];
    // Live instance heads under the parent type whose
    // materialised values name this attribute (fourth
    // RESTRICT leg via deriveInstanceCollection).
    readonly instanceIds: readonly string[];
}

// Every table the referrer scan touches. The state-field-value
// leg is pair-plane derived (Phase 14 Task 6,
// deriveStateFieldValueReferrers in api/derive-state-field-
// values.ts): requests + responses feed the derive, and each
// candidate row's visibility is settled by
// stateEventVisibilityFor (Phase 15 Task 3) on its parent
// state event — pair-plane, not the row-plane
// rawHasRow/getById fence. The three graph legs (Phase 15
// Task 4, Author gate 5) also read the pair plane:
// work-order document heads via the organization-scoped
// work-orders collection prefix, and live node-attribute
// bindings via flowGraphBindingsFromPairs (graphDelta
// attributeEvents + nodeFlowIds). Phase Final Task 2:
// RESTRICT is pair-plane only (requests + responses via
// derive helpers). The broader table list stays for tx-list
// compatibility with residual dual-write callers until
// Stage B drops the doomed stores. An in-tx caller must
// declare the whole ring — IndexedDB throws on any store a
// transaction did not name.
export const ATTRIBUTE_RESTRICT_TABLES:
    readonly string[] = [
    'requests', 'responses',
];

interface BoundGraph {
    readonly nodes: readonly {
        readonly attributes: readonly {
            readonly attributeId: string;
        }[];
    }[];
}

function graphBindsAttribute(
    graph: BoundGraph,
    attributeId: string,
): boolean {
    return graph.nodes.some(node =>
        node.attributes.some(
            attr => attr.attributeId === attributeId,
        ),
    );
}

// Referrers for each of `attributeIds`. `view` is the
// organization-fenced transaction view; `boundOrganization`
// is the verified token claim that fence was bound to (the
// pair-plane visibility probe and the organization-scoped
// pair prefixes need it explicitly). `recordTypeId` is the
// parent type id (nested path) or the flat body's
// `record_id` — scopes the fourth-leg instance scan.
// Live-flow referrers REPLAY the flow document pair
// history's graphDelta attributeEvents with the same
// latestByKey/fail-closed reduction the row plane used
// (flowGraphBindingsFromPairs — Phase 15 Task 1);
// node→flow naming rides nodeFlowIds from the same binding
// result, NEVER client-authored flow document graph
// snapshots. Frozen work-order referrers walk WO document
// heads from the organization-scoped collection prefix
// (deriveDocumentsAt — NEVER whole-plane getAll of
// requests/responses). Field-value referrers are pair-plane
// derived (Phase 14 Task 6) — ONE
// deriveStateFieldValueReferrers pass ahead of the loop,
// keyed by attribute_id.
export async function collectAttributeReferrers(
    view: DbAdapter,
    boundOrganization: string,
    attributeIds: readonly string[],
    recordTypeId: string,
): Promise<Map<string, AttributeReferrers>> {
    // Organization-scoped WO document heads — the pair-plane
    // successor of view.workOrders.getAll() for the frozen
    // graph walk. Prefix-indexed, never whole-plane.
    const workOrdersPrefix = canonicalUriPrefix(
        boundOrganization, '/work-orders/',
    );
    const [woRequests, woResponses] = await Promise.all([
        view.requests.getAllWhere(
            'uri_prefix', workOrdersPrefix,
        ),
        view.responses.getAllWhere(
            'uri_prefix', workOrdersPrefix,
        ),
    ]);
    const woHeads = deriveDocumentsAt(
        woRequests, woResponses, workOrdersPrefix,
    );
    const workOrderGraphs = [...woHeads.entries()].map(
        ([id, doc]) => ({
            id,
            graph: asWorkOrderFlowGraph(
                doc.body['flow_graph'],
                'work_orders.flow_graph',
            ),
        }),
    );
    // ONE org-wide graphDelta replay serves every attribute
    // id the caller's loop asks about (no per-id pair scan).
    const bindings = await flowGraphBindingsFromPairs(
        view, boundOrganization,
    );
    const fieldValuesByAttribute =
        await deriveStateFieldValueReferrers(
            view, boundOrganization, attributeIds,
        );
    // Fourth leg: live instance heads under the parent type
    // whose head values name the attribute (derive module
    // owns prefix + revisionValuesOf — one voice).
    const instanceHeads = await deriveInstanceCollection(
        view, boundOrganization, recordTypeId,
    );
    const referrers = new Map<string, AttributeReferrers>();
    for (const attributeId of attributeIds) {
        const values =
            fieldValuesByAttribute.get(attributeId) ?? [];
        // Latest action per flow_node_id among events for THIS
        // attribute — same tie-break as currentNodeAttributes:
        // equal-`at` 'removed' outranks 'added' (fail-closed).
        const attrRows = bindings.attributeEvents.filter(
            (r) => r.attribute_id === attributeId,
        );
        const latestPerNode = latestByKey(
            attrRows,
            (r) => r.flow_node_id,
            relationFailClosed,
        );
        const flowIds = new Set<string>();
        for (const [flowNodeId, last] of latestPerNode) {
            if (last.action !== 'added') continue;
            const flowId =
                bindings.nodeFlowIds.get(flowNodeId);
            if (flowId === undefined) continue;
            flowIds.add(flowId);
        }
        const instanceIds: string[] = [];
        for (const head of instanceHeads) {
            if (head.values.some(
                (v) => v.attribute_id === attributeId,
            )) {
                instanceIds.push(head.id);
            }
        }
        referrers.set(attributeId, {
            valueCount: values.length,
            flowIds: [...flowIds],
            workOrderIds: workOrderGraphs
                .filter(wo => graphBindsAttribute(
                    wo.graph, attributeId,
                ))
                .map(wo => wo.id),
            instanceIds,
        });
    }
    return referrers;
}

// RESTRICT-guard one record attribute on an ALREADY-OPEN
// view: a referenced attribute 409s (naming its referrers)
// and nothing is written. Phase Final Task 2: the
// record_attributes ROW splice is stripped — DELETE is a
// pair-plane tombstone only (the route appends the pair
// after this check). The standalone DELETE route wraps this
// in its own transaction; a composing POST runs the same
// RESTRICT scan on the view it already holds.
// `boundOrganization` is the verified token claim (or the
// pair-plane organization resolve on the DELETE route).
// `recordTypeId` scopes the fourth-leg instance scan.
export async function deleteRecordAttributeSafe(
    view: DbAdapter,
    boundOrganization: string,
    id: string,
    recordTypeId: string,
): Promise<void> {
    const referrers = await collectAttributeReferrers(
        view, boundOrganization, [id], recordTypeId,
    );
    const refs = referrers.get(id)!;
    if (hasReferrers(refs)) {
        throw new ApiError(
            describeReferrers(id, refs),
            HTTP_CONFLICT,
        );
    }
}

export function hasReferrers(
    refs: AttributeReferrers,
): boolean {
    return refs.valueCount > 0
        || refs.flowIds.length > 0
        || refs.workOrderIds.length > 0
        || refs.instanceIds.length > 0;
}

// The 409 body: name what stands in the way so the caller
// can dissolve the covenants first. Order: values; flows;
// work orders; instance(s).
export function describeReferrers(
    attributeId: string,
    refs: AttributeReferrers,
): string {
    const parts: string[] = [];
    if (refs.valueCount > 0) {
        parts.push(
            refs.valueCount + ' state field value(s)',
        );
    }
    if (refs.flowIds.length > 0) {
        parts.push('flow(s) ' + refs.flowIds.join(', '));
    }
    if (refs.workOrderIds.length > 0) {
        parts.push(
            'work order(s) '
            + refs.workOrderIds.join(', '),
        );
    }
    if (refs.instanceIds.length > 0) {
        parts.push(
            'instance(s) '
            + refs.instanceIds.join(', '),
        );
    }
    return 'record attribute ' + attributeId
        + ' is referenced by ' + parts.join('; ');
}
