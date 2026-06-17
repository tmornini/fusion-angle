import type { DbAdapter } from './db.ts';
import {
    validateStoredGraphJson,
    validateWorkOrderFlowGraphJson,
} from './validators.ts';
import {
    ApiError,
    HTTP_CONFLICT,
} from './http-errors.ts';

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

// Every table the referrer scan touches. The fenced
// state_field_values read resolves each MATCHED row's owning
// org through its parent state event and the org-owned probe
// ring, so an in-tx caller must declare the whole ring —
// IndexedDB throws on any store a transaction did not name.
export const ATTRIBUTE_RESTRICT_TABLES:
    readonly string[] = [
    'state_field_values', 'flows', 'work_orders',
    'states', 'ideas', 'projects', 'records',
    'objectives', 'invitations', 'memberships',
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

// Referrers for each of `attributeIds`, reading the flow and
// work-order graphs ONCE for the whole batch. `view` is the
// org-fenced transaction view: graphs come from the caller's
// org slice; the field-value count fences per matched row.
export async function collectAttributeReferrers(
    view: DbAdapter,
    attributeIds: readonly string[],
): Promise<Map<string, AttributeReferrers>> {
    const flows = await view.flows.getAll();
    const flowGraphs = flows.map(flow => ({
        id: flow.id,
        graph: validateStoredGraphJson(
            flow.graph, 'flows.graph',
        ),
    }));
    const workOrders = await view.workOrders.getAll();
    const workOrderGraphs = workOrders.map(wo => ({
        id: wo.id,
        graph: validateWorkOrderFlowGraphJson(
            wo.flow_graph, 'work_orders.flow_graph',
        ),
    }));
    const referrers = new Map<string, AttributeReferrers>();
    for (const attributeId of attributeIds) {
        const values = await view.stateFieldValues
            .getAllWhere('attribute_id', attributeId);
        referrers.set(attributeId, {
            valueCount: values.length,
            flowIds: flowGraphs
                .filter(f => graphBindsAttribute(
                    f.graph, attributeId,
                ))
                .map(f => f.id),
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
