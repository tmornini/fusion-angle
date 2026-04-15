import {
    GET, POST, PUT, DELETE,
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
    MS_PER_SECOND,
} from '../../../api/types';
import {
    getUserMap,
    userName,
    parseJson,
} from './helpers';

/* ── Types ───────────────── */

const FIRST_POSITION = 1;
const POSITION_STEP = 1;

export class WorkboxItem {
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

export type ClaimStatus =
    | { kind: 'unclaimed' }
    | {
        kind: 'claimed';
        claimId: string;
        byCurrentUser: boolean;
    };

export class WorkboxDetail {
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

function parseFlowGraph(
    raw: string,
): WorkOrderFlowGraph {
    return parseJson<WorkOrderFlowGraph>(
        raw,
    );
}

function parseValues(
    raw: string,
): TransitionValues {
    return parseJson<TransitionValues>(
        raw,
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

function currentNodeId(
    transitions:
        WorkOrderTransitionEntity[],
): string | undefined {
    return transitions.at(-1)
        ?.to_node_id;
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
    const ms =
        lockTimeout * MS_PER_SECOND;
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

        items.push(new WorkboxItem({
            id: wo.id,
            displayId: wo.display_id,
            flowName: fg.name,
            stateName: curNode.name,
            transitionerName:
                userName(
                    userMap,
                    last?.user_id,
                ),
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

export async function getWorkboxArchive(
): Promise<WorkboxItem[]> {
    const items = await getWorkboxItems();
    return items.filter(
        i => i.isCompleted(),
    );
}

export async function getWorkboxActive(
): Promise<WorkboxItem[]> {
    const items = await getWorkboxItems();
    return items.filter(
        i => !i.isCompleted(),
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
        getUserMap(),
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

    return new WorkboxDetail({
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

async function nextWorkOrderPosition(
): Promise<number> {
    const existing = await GET<
        WorkOrderEntity[]
    >('work-orders');
    if (existing.length === 0) {
        return FIRST_POSITION;
    }
    const maxPosition = Math.max(
        ...existing.map(w => w.position),
    );
    return maxPosition + POSITION_STEP;
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
    }>(flow.graph);

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
    const position =
        await nextWorkOrderPosition();
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
        position,
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

export interface TransitionContext {
    workOrderId: string;
    edgeId: string;
    values: Record<string, string>;
    userId: string;
    currentNodeId: string;
}

export async function postWorkOrderTransition(
    ctx: TransitionContext,
): Promise<void> {
    const {
        workOrderId, edgeId, values,
        userId, currentNodeId,
    } = ctx;
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

export async function putWorkOrder(
    id: string,
    patch: { position: number },
): Promise<void> {
    await PUT(`work-orders/${id}`, patch);
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
