import {
    GET, POST, DELETE,
} from '../../../api/api';
import type {
    Id,
    FlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    WorkOrderFlowGraph,
    GraphNode,
    GraphEdge,
    GraphField,
} from '../../../api/types';
import {
    nowUtc,
    jsonObjectField,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    parseJson,
} from './helpers';

/* ── Types ───────────────── */

export interface WorkboxItem {
    id: string;
    displayId: string;
    flowName: string;
    currentStateName: string;
    lastTransitionerName: string;
    lastTransitionedAt: string;
    isCompleted: boolean;
}

interface TransitionValues {
    [fieldId: string]: string;
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

export interface WorkboxDetail {
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
    isClaimed: boolean;
    claimedByCurrentUser: boolean;
    claimId: string;
}

/* ── Helpers ─────────────── */

function parseFlowGraph(
    raw: string,
): WorkOrderFlowGraph {
    return parseJson<WorkOrderFlowGraph>(
        raw,
        {
            flowId: '',
            name: '',
            description: '',
            lockTimeout: 28800,
            nodes: [],
            edges: [],
        },
    );
}

function parseValues(
    raw: string,
): TransitionValues {
    return parseJson<TransitionValues>(
        raw,
        {},
    );
}

function nodeName(
    nodes: GraphNode[],
    nodeId: string,
): string {
    return nodes.find(
        n => n.id === nodeId,
    )?.name ?? '';
}

function currentNodeId(
    transitions:
        WorkOrderTransitionEntity[],
): string {
    const last = transitions.at(-1);
    return last?.to_node_id ?? '';
}

function isExpiredClaim(
    claim: WorkOrderClaimEntity,
    lockTimeout: number,
): boolean {
    const elapsed =
        Date.now()
        - new Date(
            claim.claimed_at,
        ).getTime();
    const ms = lockTimeout * 1000;
    return elapsed >= ms;
}

async function generateDisplayId(
    uuid: string,
): Promise<string> {
    const data = new TextEncoder()
        .encode(uuid);
    const hash = await crypto.subtle
        .digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    let hex = '';
    const ID_LENGTH = 4;
    for (let i = 0; i < ID_LENGTH; i++) {
        hex += (bytes[i]!)
            .toString(16)
            .padStart(2, '0');
    }
    return hex;
}

/* ── Reads ───────────────── */

export async function getWorkboxItems(
): Promise<WorkboxItem[]> {
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
        buildUserMap(),
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

    const items: WorkboxItem[] = [];
    for (const wo of workOrders) {
        const fg = parseFlowGraph(
            wo.flow_graph,
        );
        const woTransitions = (
            transitionsByWo
                .get(wo.id) ?? []
        ).sort(
            (a, b) =>
                a.transitioned_at
                    .localeCompare(
                        b.transitioned_at,
                    ),
        );
        const curId =
            currentNodeId(woTransitions);
        const curNode = fg.nodes.find(
            n => n.id === curId,
        );
        const isCompleted =
            curNode?.isComplete === true;

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

        items.push({
            id: wo.id,
            displayId: wo.display_id,
            flowName: fg.name,
            currentStateName:
                curNode?.name ?? '',
            lastTransitionerName:
                userName(
                    userMap,
                    last?.user_id,
                ),
            lastTransitionedAt:
                last?.transitioned_at
                    ?? wo.created_at,
            isCompleted,
        });
    }

    return items;
}

export async function getWorkboxArchive(
): Promise<WorkboxItem[]> {
    const items = await getWorkboxItems();
    return items.filter(
        i => i.isCompleted,
    );
}

export async function getWorkboxActive(
): Promise<WorkboxItem[]> {
    const items = await getWorkboxItems();
    return items.filter(
        i => !i.isCompleted,
    );
}

export async function getWorkboxItem(
    workOrderId: string,
    currentUserId: string,
): Promise<WorkboxDetail> {
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
        buildUserMap(),
    ]);

    const fg = parseFlowGraph(
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
        currentNodeId(woTransitions);
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
        const vals = parseValues(t.values);
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
                parseValues(t.values);
            const fieldValues: HistoryFieldValue[]
                = [];
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

    return {
        id: wo.id,
        displayId: wo.display_id,
        flowName: fg.name,
        currentNode: curNode,
        outgoingEdges: outgoing,
        body,
        history,
        isClaimed: claim !== undefined,
        claimedByCurrentUser:
            claim?.user_id
                === currentUserId,
        claimId: claim?.id ?? '',
    };
}

/* ── Operations ──────────── */

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

export async function postWorkOrderCreation(
    flowId: string,
    userId: string,
): Promise<string> {
    const flow = await GET<FlowEntity>(
        `flows/${flowId}`,
    );
    const graph = parseJson<{
        nodes: GraphNode[];
        edges: GraphEdge[];
    }>(
        flow.graph,
        { nodes: [], edges: [] },
    );

    const startNode = graph.nodes.find(
        n => n.isStart,
    );
    if (!startNode) {
        throw new Error(
            'Flow has no start node',
        );
    }

    const postStartEdges =
        graph.edges.filter(
            e => e.fromNodeId
                === startNode.id,
        );
    if (postStartEdges.length !== 1) {
        throw new Error(
            'Start node must have'
            + ' exactly one outgoing'
            + ' edge',
        );
    }
    const postStartNodeId =
        postStartEdges[0]!.toNodeId;

    const woId = crypto.randomUUID();
    const displayId =
        await generateDisplayId(woId);
    const now = nowUtc();

    const flowGraph: WorkOrderFlowGraph =
        {
            flowId: flow.id,
            name: flow.name,
            description: flow.description,
            lockTimeout: flow.lock_timeout,
            nodes: graph.nodes,
            edges: graph.edges,
        };

    await POST<void>('work-orders', {
        id: woId,
        display_id: displayId,
        flow_graph: jsonObjectField(
            flowGraph as unknown as Record<
                string, unknown
            >,
        ),
        created_at: now,
    });

    await POST<void>(
        'flow-work-orders',
        {
            id: crypto.randomUUID(),
            flow_id: flowId,
            work_order_id: woId,
            created_at: now,
        },
    );

    const emptyValues = jsonObjectField(
        {} as Record<string, unknown>,
    );

    await POST<void>(
        'work-order-transitions',
        {
            id: crypto.randomUUID(),
            work_order_id: woId,
            from_node_id: '',
            to_node_id: startNode.id,
            user_id: userId,
            values: emptyValues,
            transitioned_at: now,
        },
    );

    await POST<void>(
        'work-order-transitions',
        {
            id: crypto.randomUUID(),
            work_order_id: woId,
            from_node_id: startNode.id,
            to_node_id: postStartNodeId,
            user_id: userId,
            values: emptyValues,
            transitioned_at: now,
        },
    );

    await POST<void>(
        'work-order-claims',
        {
            id: crypto.randomUUID(),
            work_order_id: woId,
            user_id: userId,
            claimed_at: now,
        },
    );

    return woId;
}

export async function postWorkOrderTransition(
    workOrderId: string,
    edgeId: string,
    values: Record<string, string>,
    userId: string,
    currentNodeId: string,
): Promise<void> {
    const wo = await GET<WorkOrderEntity>(
        `work-orders/${workOrderId}`,
    );
    const fg = parseFlowGraph(
        wo.flow_graph,
    );

    const edge = fg.edges.find(
        e => e.id === edgeId,
    );
    if (!edge) {
        throw new Error(
            'Edge not found: ' + edgeId,
        );
    }

    const now = nowUtc();

    await POST<void>(
        'work-order-transitions',
        {
            id: crypto.randomUUID(),
            work_order_id: workOrderId,
            from_node_id: currentNodeId,
            to_node_id: edge.toNodeId,
            user_id: userId,
            values: jsonObjectField(
                values as Record<
                    string, unknown
                >,
            ),
            transitioned_at: now,
        },
    );

    const claims =
        await GET<WorkOrderClaimEntity[]>(
            'work-order-claims',
        );
    const claim = claims.find(
        c => c.work_order_id
            === workOrderId,
    );
    if (claim) {
        await DELETE(
            `work-order-claims/${claim.id}`,
        );
    }
}

export async function postWorkOrderClaim(
    workOrderId: string,
    userId: string,
): Promise<string> {
    const now = nowUtc();
    const claimId = crypto.randomUUID();

    await POST<void>(
        'work-order-claims',
        {
            id: claimId,
            work_order_id: workOrderId,
            user_id: userId,
            claimed_at: now,
        },
    );

    return claimId;
}

export async function deleteWorkOrderClaim(
    claimId: string,
): Promise<void> {
    await DELETE(
        `work-order-claims/${claimId}`,
    );
}
