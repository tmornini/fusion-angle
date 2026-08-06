import type {
    Id,
    RecordAttributeId,
    WorkOrderEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    validateWorkOrderFlowGraph,
    getWorkOrderHistory,
    currentNodeIdFromHistory,
} from './work-orders-queries.ts';
import {
    getRecordForWorkOrder,
} from './flow-records.ts';
import {
    getRecordAttributesByRecord,
} from './record-attributes.ts';
import {
    validateAttributeValue,
} from '../../../api/record-constraints.ts';
import type {
    ConstraintViolation,
} from '../../../api/record-constraints.ts';

export type {
    ConstraintViolation,
} from '../../../api/record-constraints.ts';

export class RecordTransitionViolations
    extends Error {
    readonly violations:
        readonly ConstraintViolation[];
    constructor(
        violations: readonly ConstraintViolation[],
    ) {
        super(
            'record transition gate rejected: '
            + violations.length + ' violation(s)',
        );
        this.name = 'RecordTransitionViolations';
        this.violations = violations;
    }
}

// Gate the leave of the CURRENT node — the same node
// the workbox action screen paints. Required attrs and
// constraint checks run against that node's refs only;
// the target node's fields are collected after arrival.
// One GET work-orders/:id/history supplies current node
// and every prior field value (folded on each row).
export async function validateRecordTransition(
    ctx: RequestContext,
    workOrderId: Id,
    pendingValues:
        ReadonlyMap<RecordAttributeId, string>,
): Promise<ConstraintViolation[]> {
    const wo = await ctx.GET<WorkOrderEntity>(
        `work-orders/${workOrderId}`,
    );
    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );
    const history = await getWorkOrderHistory(
        ctx, workOrderId,
    );
    const currentNodeId =
        currentNodeIdFromHistory(history);
    if (currentNodeId === null) {
        throw new Error(
            'work order has no current node: '
            + workOrderId,
        );
    }
    const currentNode = fg.nodes.find(
        n => n.id === currentNodeId,
    );
    if (!currentNode) {
        throw new Error(
            'current node not found in work'
            + ' order flow graph: '
            + currentNodeId,
        );
    }
    const recordId = await getRecordForWorkOrder(
        ctx, workOrderId,
    );
    if (recordId === null) {
        return [];
    }
    const attributes =
        await getRecordAttributesByRecord(
            ctx, recordId,
        );
    const attributeById = new Map(
        attributes.map(a => [a.id, a]),
    );

    // History is DESC: first-wins per attribute is the
    // latest written value (same as ASC overwrite).
    const storedValueByAttr = new Map<
        RecordAttributeId, string
    >();
    for (const row of history) {
        for (const fv of row.field_values) {
            if (storedValueByAttr.has(fv.attribute_id)) {
                continue;
            }
            storedValueByAttr.set(
                fv.attribute_id, fv.value,
            );
        }
    }

    const out: ConstraintViolation[] = [];
    for (const ref of currentNode.attributes) {
        const attribute = attributeById.get(
            ref.attributeId,
        );
        if (!attribute) {
            throw new Error(
                'node ' + currentNodeId
                + ' references unknown'
                + ' attribute '
                + ref.attributeId,
            );
        }
        const pending = pendingValues.get(
            attribute.id,
        );
        const stored = storedValueByAttr.get(
            attribute.id,
        );
        const value = pending
            ?? stored ?? null;
        const isEmpty = value === null
            || value === '';
        if (ref.isRequired && isEmpty) {
            out.push({
                kind: 'required',
                attributeId: attribute.id,
                attributeName: attribute.name,
            });
            continue;
        }
        if (!isEmpty) {
            for (const v of validateAttributeValue(
                attribute, value,
            )) {
                out.push(v);
            }
        }
    }
    return out;
}
