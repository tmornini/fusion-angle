import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import {
    validateWorkOrderFlowGraphJson,
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
}

// Every table the referrer scan touches. The state-field-value
// leg is pair-plane derived (Phase 14 Task 6,
// deriveStateFieldValueReferrers in api/derive-state-field-
// values.ts): requests + responses feed the derive, and each
// candidate row's visibility is settled by view.states.getById
// on its parent state event — the row-plane fence db-
// organization-scoped.ts already carries, reused rather than
// rebuilt. 'states' was already required regardless — every
// EntityStore read here consults it for the soft-delete filter
// (getDeletedIdsIn). The flow-node-attribute scan reads
// flow_node_attributes + flow_nodes. An in-tx caller must
// declare the whole ring — IndexedDB throws on any store a
// transaction did not name.
export const ATTRIBUTE_RESTRICT_TABLES:
    readonly string[] = [
    'flows', 'work_orders',
    'states', 'ideas', 'projects', 'records',
    'objectives', 'invitations', 'memberships',
    'flow_node_attributes', 'flow_nodes',
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
// org-fenced transaction view. Live-flow referrers derive
// from the flow_node_attributes relation (latest action per
// flow_node_id — a 'removed' row means no current binding).
// Frozen work-order referrers still parse the
// work_orders.flow_graph blob (the frozen plane keeps its
// inlined graph). Field-value referrers are pair-plane derived
// (Phase 14 Task 6) — ONE deriveStateFieldValueReferrers pass
// ahead of the loop, keyed by attribute_id, rather than a
// per-id table read (the pair plane has no such index).
export async function collectAttributeReferrers(
    view: DbAdapter,
    attributeIds: readonly string[],
): Promise<Map<string, AttributeReferrers>> {
    const workOrders = await view.workOrders.getAll();
    const workOrderGraphs = workOrders.map(wo => ({
        id: wo.id,
        graph: validateWorkOrderFlowGraphJson(
            wo.flow_graph, 'work_orders.flow_graph',
        ),
    }));
    const fieldValuesByAttribute =
        await deriveStateFieldValueReferrers(view, attributeIds);
    const referrers = new Map<string, AttributeReferrers>();
    for (const attributeId of attributeIds) {
        const values =
            fieldValuesByAttribute.get(attributeId) ?? [];
        const attrRows =
            await view.flowNodeAttributes
                .getAllWhere('attribute_id', attributeId);
        // Latest action per flow_node_id — same tie-break
        // as currentNodeAttributes: equal-`at` 'removed'
        // outranks 'added' (fail-closed).
        const latestPerNode = latestByKey(
            attrRows,
            r => r.flow_node_id,
            relationFailClosed,
        );
        const flowIds = new Set<string>();
        for (const [flowNodeId, last] of latestPerNode) {
            if (last.action !== 'added') continue;
            try {
                const node =
                    await view.flowNodes.getById(
                        flowNodeId,
                    );
                flowIds.add(node.flow_id);
            } catch (e) {
                if (e instanceof EntityNotFoundError) {
                    continue; // deleted node — not current
                }
                throw e;
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
        });
    }
    return referrers;
}

// Delete one record attribute on an ALREADY-OPEN view,
// RESTRICT-guarded: a referenced attribute 409s (naming its
// referrers) and nothing is spliced. The standalone DELETE
// route wraps this in its own transaction; a composing POST
// calls it on the view it already holds, so the referrer
// check and the splice share that one transaction.
export async function deleteRecordAttributeSafe(
    view: DbAdapter,
    id: string,
): Promise<void> {
    const referrers =
        await collectAttributeReferrers(view, [id]);
    const refs = referrers.get(id)!;
    if (hasReferrers(refs)) {
        throw new ApiError(
            describeReferrers(id, refs),
            HTTP_CONFLICT,
        );
    }
    await view.recordAttributes.delete(id);
}

export function hasReferrers(
    refs: AttributeReferrers,
): boolean {
    return refs.valueCount > 0
        || refs.flowIds.length > 0
        || refs.workOrderIds.length > 0;
}

// The 409 body: name what stands in the way so the caller
// can dissolve the covenants first.
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
    return 'record attribute ' + attributeId
        + ' is referenced by ' + parts.join('; ');
}
