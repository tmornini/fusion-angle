import type {
    Id,
    RecordAttributeId,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    WorkOrderHistoryEventEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import { organizationItem } from './shared.ts';
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
    type RecordAttribute,
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

// Pure gate over already-fetched rows. Error bytes and
// violation list match the former inlined body byte-for-
// byte (pinned by adapters-record-transitions tests).
// Gate the leave of the CURRENT node — the same node
// the workbox action screen paints. Required attrs and
// constraint checks run against that node's refs only;
// the target node's fields are collected after arrival.
// storedValues is the bound instance head (null when
// unbound — A3 mirror: every required ref reports).
// Constraints run on pending values only; requiredness
// overlays pending on stored (or reports when unbound).
export function recordTransitionViolationsFrom(
    workOrderId: Id,
    flowGraph: WorkOrderFlowGraph,
    history: readonly WorkOrderHistoryEventEntity[],
    attributes: readonly RecordAttribute[],
    pendingValues:
        ReadonlyMap<RecordAttributeId, string>,
    storedValues:
        ReadonlyMap<RecordAttributeId, string> | null,
): ConstraintViolation[] {
    const currentNodeId =
        currentNodeIdFromHistory(history);
    if (currentNodeId === null) {
        throw new Error(
            'work order has no current node: '
            + workOrderId,
        );
    }
    const currentNode = flowGraph.nodes.find(
        n => n.id === currentNodeId,
    );
    if (!currentNode) {
        throw new Error(
            'current node not found in work'
            + ' order flow graph: '
            + currentNodeId,
        );
    }
    const attributeById = new Map(
        attributes.map(a => [a.id, a]),
    );

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
        const stored = storedValues === null
            ? undefined
            : storedValues.get(attribute.id);
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
        // Constraints on pending only — stored head
        // is already validated at the instance write.
        if (
            pending !== undefined
            && pending !== ''
        ) {
            for (const v of validateAttributeValue(
                attribute, pending,
            )) {
                out.push(v);
            }
        }
    }
    return out;
}

export async function validateRecordTransition(
    ctx: RequestContext,
    workOrderId: Id,
    pendingValues:
        ReadonlyMap<RecordAttributeId, string>,
    storedValues:
        ReadonlyMap<RecordAttributeId, string> | null,
): Promise<ConstraintViolation[]> {
    // Wave 1: all keyed by workOrderId.
    const [wo, history, recordId] =
        await Promise.all([
            ctx.GET<WorkOrderEntity>(
                organizationItem(
                    ctx, 'work-orders', workOrderId,
                ),
            ),
            getWorkOrderHistory(ctx, workOrderId),
            getRecordForWorkOrder(ctx, workOrderId),
        ]);
    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );
    // Wave 2: attributes only when a record is bound.
    const attributes = recordId === null
        ? []
        : await getRecordAttributesByRecord(
            ctx, recordId,
        );
    return recordTransitionViolationsFrom(
        workOrderId, fg, history, attributes,
        pendingValues, storedValues,
    );
}
