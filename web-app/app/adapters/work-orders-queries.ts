import { GET } from '../../../api/api';
import type {
    FlowEntity,
    WorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    WorkOrderFlowGraph,
    GraphNode,
    GraphEdge,
    GraphField,
} from '../../../api/types';
import {
    msSinceUtc,
    MS_PER_SECOND,
} from '../../../api/types';
import {
    validateWorkOrderFlowGraphJson,
    validateTransitionValuesJson,
} from '../../../api/validators';
import {
    getUserMap,
    userName,
} from './shared';

/* ── Types ───────────────── */

export class WorkOrderInboxRow {
    readonly #id: string;
    readonly #displayId: string;
    readonly #flowName: string;
    readonly #lastTransitionedAt: string;
    readonly #stateName: string;
    readonly #transitionerName: string;
    readonly #completed: boolean;
    readonly #position: number;

    constructor(data: {
        id: string;
        displayId: string;
        flowName: string;
        stateName: string;
        transitionerName: string;
        lastTransitionedAt: string;
        completed: boolean;
        position: number;
    }) {
        this.#id = data.id;
        this.#displayId = data.displayId;
        this.#flowName = data.flowName;
        this.#stateName = data.stateName;
        this.#transitionerName =
            data.transitionerName;
        this.#lastTransitionedAt =
            data.lastTransitionedAt;
        this.#completed = data.completed;
        this.#position = data.position;
    }

    idForLink(): string {
        return this.#id;
    }

    displayIdText(): string {
        return this.#displayId;
    }

    flowNameText(): string {
        return this.#flowName;
    }

    lastTransitionedAtDate(): string {
        return this.#lastTransitionedAt;
    }

    isCompleted(): boolean {
        return this.#completed;
    }

    currentStateName(): string {
        return this.#stateName;
    }

    lastTransitionerName(): string {
        return this.#transitionerName;
    }

    positionSortKey(): number {
        return this.#position;
    }
}

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

export class WorkOrderDetail {
    readonly #id: string;
    readonly #displayId: string;
    readonly #flowName: string;
    readonly #outgoingEdges:
        readonly GraphEdge[];
    readonly #body: Record<
        string,
        Record<string, string>
    >;
    readonly #history:
        readonly HistoryEntry[];
    readonly #currentNode: GraphNode;
    readonly #claim: ClaimStatus;

    constructor(data: {
        id: string;
        displayId: string;
        flowName: string;
        currentNode: GraphNode;
        outgoingEdges: GraphEdge[];
        body: Record<
            string,
            Record<string, string>
        >;
        history: HistoryEntry[];
        claim: ClaimStatus;
    }) {
        this.#id = data.id;
        this.#displayId = data.displayId;
        this.#flowName = data.flowName;
        this.#currentNode =
            data.currentNode;
        this.#outgoingEdges =
            data.outgoingEdges;
        this.#body = data.body;
        this.#history = data.history;
        this.#claim = data.claim;
    }

    idValue(): string {
        return this.#id;
    }

    displayIdText(): string {
        return this.#displayId;
    }

    flowNameText(): string {
        return this.#flowName;
    }

    outgoingEdgeList():
        readonly GraphEdge[] {
        return this.#outgoingEdges;
    }

    historyEntries():
        readonly HistoryEntry[] {
        return this.#history;
    }

    hasHistory(): boolean {
        return this.#history.length > 0;
    }

    isComplete(): boolean {
        return this.#currentNode
            .isComplete;
    }

    currentNodeName(): string {
        return this.#currentNode.name;
    }

    currentNodeId(): string {
        return this.#currentNode.id;
    }

    renderableFields():
        readonly GraphField[] {
        return this.#currentNode.fields;
    }

    claimStatus(): ClaimStatus {
        return this.#claim;
    }
}

/* ── Helpers ─────────────── */

export function validateWorkOrderFlowGraph(
    raw: string,
): WorkOrderFlowGraph {
    return validateWorkOrderFlowGraphJson(
        raw, 'workOrder.flowGraph',
    );
}

function nodeName(
    nodes: GraphNode[],
    nodeId: string,
): string {
    const node = nodes.find(
        n => n.id === nodeId,
    );
    if (!node) {
        throw new Error(
            'Node not found: ' + nodeId,
        );
    }
    return node.name;
}

function lastTransitionToNodeId(
    transitions:
        WorkOrderTransitionEntity[],
): string | undefined {
    return transitions.at(-1)
        ?.to_node_id;
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

export async function getAllWorkOrders(
): Promise<WorkOrderInboxRow[]> {
    const [
        workOrders, transitions,
        claims, userMap,
    ] = await Promise.all([
        GET<WorkOrderEntity[]>(
            'work-orders',
        ),
        GET<WorkOrderTransitionEntity[]>(
            'work-order-transitions',
        ),
        GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        ),
        getUserMap(),
    ]);

    const transitionsByWo = Map.groupBy(
        transitions,
        t => t.work_order_id,
    );

    const claimByWo = new Map<
        string,
        WorkOrderClaimEntity
    >();
    for (const c of claims) {
        claimByWo.set(
            c.work_order_id, c,
        );
    }

    const items: WorkOrderInboxRow[] = [];
    for (const wo of workOrders) {
        const fg = validateWorkOrderFlowGraph(
            wo.flow_graph,
        );
        const rawTransitions =
            transitionsByWo.get(wo.id);
        if (!rawTransitions) {
            throw new Error(
                `Work order ${wo.id} has no transitions`,
            );
        }
        const woTransitions = rawTransitions.sort(
            (a, b) =>
                a.transitioned_at
                    .localeCompare(
                        b.transitioned_at,
                    ),
        );
        const curId =
            lastTransitionToNodeId(
                woTransitions,
            );
        const curNode = fg.nodes.find(
            n => n.id === curId,
        )!;
        const isCompleted =
            curNode.isComplete;

        const claim =
            claimByWo.get(wo.id);
        const isClaimed = claim
            !== undefined
            && !isExpiredClaim(
                claim,
                fg.lockTimeout,
            );

        if (isClaimed && !isCompleted)
            continue;

        const last =
            woTransitions.at(-1);

        items.push(new WorkOrderInboxRow({
            id: wo.id,
            displayId: wo.display_id,
            flowName: fg.name,
            stateName: curNode.name,
            transitionerName:
                last
                    ? userName(
                        userMap, last.user_id,
                    )
                    : '',
            lastTransitionedAt:
                last?.transitioned_at
                    ?? wo.created_at,
            completed: isCompleted,
            position: wo.position,
        }));
    }

    items.sort(
        (a, b) =>
            a.positionSortKey()
            - b.positionSortKey(),
    );

    return items;
}

export async function getArchivedWorkOrders(
): Promise<WorkOrderInboxRow[]> {
    const items = await getAllWorkOrders();
    return items.filter(
        i => i.isCompleted(),
    );
}

export async function getActiveWorkOrders(
): Promise<WorkOrderInboxRow[]> {
    const items = await getAllWorkOrders();
    return items.filter(
        i => !i.isCompleted(),
    );
}

export async function getWorkOrder(
    id: string,
): Promise<WorkOrderEntity> {
    return GET<WorkOrderEntity>(
        `work-orders/${id}`,
    );
}

export async function getWorkOrderDetail(
    workOrderId: string,
    currentUserId: string,
): Promise<WorkOrderDetail> {
    const [
        wo, transitions,
        claims, userMap,
    ] = await Promise.all([
        GET<WorkOrderEntity>(
            `work-orders/${workOrderId}`,
        ),
        GET<WorkOrderTransitionEntity[]>(
            'work-order-transitions',
        ),
        GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        ),
        getUserMap(),
    ]);

    const fg = validateWorkOrderFlowGraph(
        wo.flow_graph,
    );

    const woTransitions = transitions
        .filter(
            t => t.work_order_id
                === workOrderId,
        )
        .sort(
            (a, b) =>
                a.transitioned_at
                    .localeCompare(
                        b.transitioned_at,
                    ),
        );

    const curId =
        lastTransitionToNodeId(
            woTransitions,
        );
    const curNode = fg.nodes.find(
        n => n.id === curId,
    );
    if (!curNode) {
        throw new Error(
            'Current node not found'
            + ` in flow graph: ${curId}`,
        );
    }

    const outgoing = fg.edges.filter(
        e => e.fromNodeId === curId,
    );

    const body: Record<
        string,
        Record<string, string>
    > = {};
    for (const t of woTransitions) {
        if (t.from_node_id === '') continue;
        const vals =
            validateTransitionValuesJson(
                t.values,
                'transition.values',
            );
        if (
            Object.keys(vals).length > 0
        ) {
            body[t.from_node_id] = vals;
        }
    }

    const fieldNameMap = new Map<
        string, string
    >();
    for (const node of fg.nodes) {
        for (const f of node.fields) {
            fieldNameMap.set(
                f.id, f.name,
            );
        }
    }

    const history: HistoryEntry[] =
        woTransitions.map(t => {
            const vals =
                validateTransitionValuesJson(
                    t.values,
                    'transition.values',
                );
            const fieldValues:
                HistoryFieldValue[] = [];
            for (
                const [fId, val]
                of Object.entries(vals)
            ) {
                fieldValues.push({
                    fieldName:
                        fieldNameMap
                            .get(fId)
                            ?? fId,
                    value: val,
                });
            }
            return {
                fromNodeName:
                    t.from_node_id === ''
                        ? 'Created'
                        : nodeName(
                            fg.nodes,
                            t.from_node_id,
                        ),
                toNodeName: nodeName(
                    fg.nodes,
                    t.to_node_id,
                ),
                userName: userName(
                    userMap, t.user_id,
                ),
                transitionedAt:
                    t.transitioned_at,
                fieldValues,
            };
        });

    const claim = claims.find(
        c => c.work_order_id
            === workOrderId
            && !isExpiredClaim(
                c, fg.lockTimeout,
            ),
    );

    const claimData: ClaimStatus =
        claim !== undefined
            ? {
                kind: 'claimed',
                claimId: claim.id,
                byCurrentUser:
                    claim.user_id
                        === currentUserId,
            }
            : { kind: 'unclaimed' };

    return new WorkOrderDetail({
        id: wo.id,
        displayId: wo.display_id,
        flowName: fg.name,
        currentNode: curNode,
        outgoingEdges: outgoing,
        body,
        history,
        claim: claimData,
    });
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
