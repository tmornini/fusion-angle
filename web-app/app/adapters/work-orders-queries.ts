import { GET } from '../../../api/api.ts';
import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    WorkOrderFlowGraph,
} from '../../../api/types.ts';
import {
    msSinceUtc,
    MS_PER_SECOND,
} from '../../../api/types.ts';
import {
    validateWorkOrderFlowGraphJson,
    validateTransitionValuesJson,
} from '../../../api/validators.ts';

export type {
    WorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    WorkOrderFlowGraph,
    GraphNode,
    GraphEdge,
    GraphField,
} from '../../../api/types.ts';

/* ── Types ───────────────── */

export interface HistoryFieldValue {
    fieldName: string;
    value: string;
}

export interface HistoryEntry {
    fromNodeName: string;
    toNodeName: string;
    userName: string;
    transitionedAt: string;
    fieldValues: HistoryFieldValue[];
}

export type ClaimStatus =
    | { kind: 'unclaimed' }
    | {
        kind: 'claimed';
        claimId: string;
        byCurrentUser: boolean;
    };

/* ── Helpers ─────────────── */

export function validateWorkOrderFlowGraph(
    raw: string,
): WorkOrderFlowGraph {
    return validateWorkOrderFlowGraphJson(
        raw, 'workOrder.flowGraph',
    );
}

export function parseTransitionValues(
    raw: string,
): Record<string, string> {
    return validateTransitionValuesJson(
        raw, 'transition.values',
    );
}

export function isExpiredClaim(
    claim: WorkOrderClaimEntity,
    lockTimeout: number,
): boolean {
    const elapsed = msSinceUtc(
        claim.claimed_at,
    );
    const ms =
        lockTimeout * MS_PER_SECOND;
    return elapsed >= ms;
}

/* ── Reads ───────────────── */

export async function getWorkOrderRows(
): Promise<WorkOrderEntity[]> {
    return GET<WorkOrderEntity[]>(
        'work-orders',
    );
}

export async function getAllWorkOrderTransitionRows(
): Promise<WorkOrderTransitionEntity[]> {
    return GET<
        WorkOrderTransitionEntity[]
    >('work-order-transitions');
}

export async function getAllWorkOrderClaimRows(
): Promise<WorkOrderClaimEntity[]> {
    return GET<
        WorkOrderClaimEntity[]
    >('work-order-claims');
}

export async function getWorkOrder(
    id: string,
): Promise<WorkOrderEntity> {
    return GET<WorkOrderEntity>(
        `work-orders/${id}`,
    );
}

export async function getWorkOrderTransitionRows(
    workOrderId: string,
): Promise<WorkOrderTransitionEntity[]> {
    const all = await GET<
        WorkOrderTransitionEntity[]
    >('work-order-transitions');
    return all.filter(
        t => t.work_order_id === workOrderId,
    );
}

export async function getWorkOrderClaimRows(
    workOrderId: string,
): Promise<WorkOrderClaimEntity[]> {
    const all = await GET<
        WorkOrderClaimEntity[]
    >('work-order-claims');
    return all.filter(
        c => c.work_order_id === workOrderId,
    );
}

export async function getFlowsForCreation(
): Promise<{
    id: string;
    name: string;
}[]> {
    const flows =
        await GET<FlowEntity[]>('flows');
    return flows.map(f => ({
        id: f.id,
        name: f.name,
    }));
}
