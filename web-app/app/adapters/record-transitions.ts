import type {
    Id,
    RecordAttributeId,
    StateFieldValueEntity,
    WorkOrderEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    validateWorkOrderFlowGraph,
} from './work-orders-queries.ts';
import {
    getRecordForWorkOrder,
} from './flow-records.ts';
import {
    getRecordAttributesByRecord,
} from './record-attributes.ts';
import {
    getWorkOrderTransitionEvents,
} from './state-events.ts';
import {
    validateAttributeValue,
} from '../record-constraints.ts';
import type {
    ConstraintViolation,
} from '../record-constraints.ts';

export type {
    ConstraintViolation,
} from '../record-constraints.ts';

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

export async function validateRecordTransition(
    ctx: RequestContext,
    workOrderId: Id,
    targetNodeId: Id,
    pendingValues:
        ReadonlyMap<RecordAttributeId, string>,
): Promise<ConstraintViolation[]> {
    const wo = await ctx.GET<WorkOrderEntity>(
        `work-orders/${workOrderId}`,
    );
    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );
    const targetNode = fg.nodes.find(
        n => n.id === targetNodeId,
    );
    if (!targetNode) {
        throw new Error(
            'target node not found in work'
            + ' order flow graph: '
            + targetNodeId,
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

    const transitions =
        await getWorkOrderTransitionEvents(
            ctx, workOrderId,
        );
    // The field values are nested under their parent state event,
    // so fetch each transition event's values directly — no whole-
    // table scan + client-side event filter. Each read is server-
    // filtered to its event by the state_event_id FK.
    const perEvent = await Promise.all(
        transitions.map(t => ctx.GET<StateFieldValueEntity[]>(
            'states/' + t.id + '/field-values',
        )),
    );
    const storedValueByAttr = new Map<
        RecordAttributeId, string
    >();
    for (const fvs of perEvent) {
        for (const fv of fvs) {
            storedValueByAttr.set(
                fv.attribute_id, fv.value,
            );
        }
    }

    const out: ConstraintViolation[] = [];
    for (const ref of targetNode.attributes) {
        const attribute = attributeById.get(
            ref.attributeId,
        );
        if (!attribute) {
            throw new Error(
                'node ' + targetNodeId
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
