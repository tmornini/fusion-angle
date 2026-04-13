import {
    GET, POST, PUT,
} from '../../../api/api';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    GraphField,
    WfFieldType,
} from '../../../api/types';
import {
    nowUtc,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../../../api/types';
import { parseJson } from './helpers';
import { postFlowVersion } from './flow-versions';

interface StoredGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function parseGraph(
    raw: string,
): StoredGraph {
    return parseJson<StoredGraph>(raw);
}

function putFlowGraph(
    graph: StoredGraph,
): string {
    return jsonObjectField(
        graph as unknown as Record<
            string, unknown
        >,
    );
}

async function putGraphMutation(
    flowId: string,
    transform: (
        g: StoredGraph,
    ) => StoredGraph,
): Promise<void> {
    await postFlowVersion(flowId);
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const graph = parseGraph(
        entity.graph,
    );
    const updated = transform(graph);
    await PUT(`flows/${flowId}`, {
        graph: putFlowGraph(updated),
        updated_at: nowUtc(),
    });
}

const DEFAULT_START_NAME = 'New';
const DEFAULT_COMPLETE_NAME = 'Complete';
const DEFAULT_START_X = -300;
const DEFAULT_START_Y = 0;
const DEFAULT_COMPLETE_X = 300;
const DEFAULT_COMPLETE_Y = 200;

export function buildDefaultStartEnd(): {
    start: GraphNode;
    complete: GraphNode;
} {
    return {
        start: {
            id: crypto.randomUUID(),
            name: DEFAULT_START_NAME,
            description: '',
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isStart: true,
            isComplete: false,
            fields: [],
        },
        complete: {
            id: crypto.randomUUID(),
            name: DEFAULT_COMPLETE_NAME,
            description: '',
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isStart: false,
            isComplete: true,
            fields: [],
        },
    };
}

export interface FlowCreationContext {
    flowId: string;
    projectId: string;
    name: string;
    description: string;
}

export interface NodeAdditionContext {
    nodeId: string;
    flowId: string;
    name: string;
    positionX: number;
    positionY: number;
}

export interface EdgeConnectionContext {
    edgeId: string;
    flowId: string;
    name: string;
    fromNodeId: string;
    toNodeId: string;
}

export interface FieldAdditionContext {
    fieldId: string;
    flowId: string;
    nodeId: string;
    name: string;
    fieldType: string;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

export async function postFlowCreation(
    ctx: FlowCreationContext,
): Promise<void> {
    const now = nowUtc();
    const { start, complete } =
        buildDefaultStartEnd();
    const graph: StoredGraph = {
        nodes: [start, complete],
        edges: [],
    };

    await POST<void>('flows', {
        id: ctx.flowId,
        name: ctx.name,
        description: ctx.description,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: putFlowGraph(graph),
        created_at: now,
        updated_at: now,
    });

    await POST<void>('project-flows', {
        id: crypto.randomUUID(),
        project_id: ctx.projectId,
        flow_id: ctx.flowId,
        created_at: now,
    });
}

export async function postNodeAddition(
    ctx: NodeAdditionContext,
): Promise<void> {
    const node: GraphNode = {
        id: ctx.nodeId,
        name: ctx.name,
        description: '',
        positionX: ctx.positionX,
        positionY: ctx.positionY,
        isStart: false,
        isComplete: false,
        fields: [],
    };
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            nodes: [...g.nodes, node],
        }),
    );
}

export async function postEdgeConnection(
    ctx: EdgeConnectionContext,
): Promise<void> {
    const edge: GraphEdge = {
        id: ctx.edgeId,
        name: ctx.name,
        description: '',
        fromNodeId: ctx.fromNodeId,
        toNodeId: ctx.toNodeId,
    };
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            edges: [...g.edges, edge],
        }),
    );
}

export async function postFieldAddition(
    ctx: FieldAdditionContext,
): Promise<void> {
    const ft =
        ctx.fieldType as WfFieldType;
    const field: GraphField = {
        id: ctx.fieldId,
        name: ctx.name,
        fieldType: ft,
        sortOrder: ctx.sortOrder,
        isRequired: ctx.isRequired,
        options: ctx.options,
    };
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            nodes: g.nodes.map(
                n => n.id === ctx.nodeId
                    ? {
                        ...n,
                        fields: [
                            ...n.fields,
                            field,
                        ],
                    }
                    : n,
            ),
        }),
    );
}

export async function putFlow(
    id: string,
    fields: {
        name?: string;
        description?: string;
    },
): Promise<void> {
    await postFlowVersion(id);
    await PUT(`flows/${id}`, {
        ...fields,
        updated_at: nowUtc(),
    });
}

export async function putFlowLocked(
    id: string,
    isLocked: boolean,
): Promise<void> {
    await PUT(`flows/${id}`, {
        is_locked: isLocked,
        updated_at: nowUtc(),
    });
}

export interface GraphUpdateContext {
    flowId: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export async function putGraph(
    ctx: GraphUpdateContext,
): Promise<void> {
    await postFlowVersion(ctx.flowId);
    await putGraphSilent(ctx);
}

// No capture: internal migration, not user edit.
export async function putGraphSilent(
    ctx: GraphUpdateContext,
): Promise<void> {
    await PUT(`flows/${ctx.flowId}`, {
        graph: putFlowGraph({
            nodes: ctx.nodes,
            edges: ctx.edges,
        }),
        updated_at: nowUtc(),
    });
}

export interface NodeUpdateContext {
    flowId: string;
    nodeId: string;
    fields: {
        name?: string;
        description?: string;
        positionX?: number;
        positionY?: number;
    };
}

export async function putNode(
    ctx: NodeUpdateContext,
): Promise<void> {
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            nodes: g.nodes.map(
                n => n.id === ctx.nodeId
                    ? {
                        ...n,
                        ...ctx.fields,
                    }
                    : n,
            ),
        }),
    );
}

export interface EdgeUpdateContext {
    flowId: string;
    edgeId: string;
    fields: {
        name?: string;
        description?: string;
    };
}

export async function putWfEdge(
    ctx: EdgeUpdateContext,
): Promise<void> {
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            edges: g.edges.map(
                e => e.id === ctx.edgeId
                    ? {
                        ...e,
                        ...ctx.fields,
                    }
                    : e,
            ),
        }),
    );
}

function applyFieldUpdate(
    f: GraphField,
    fields: {
        name?: string;
        fieldType?: string;
        sortOrder?: number;
        isRequired?: boolean;
        options?: string[];
    },
): GraphField {
    const ft = fields.fieldType
        ? (fields.fieldType as WfFieldType)
        : f.fieldType;
    return {
        ...f,
        ...fields,
        fieldType: ft,
    };
}

export interface FieldUpdateContext {
    flowId: string;
    nodeId: string;
    fieldId: string;
    fields: {
        name?: string;
        fieldType?: string;
        sortOrder?: number;
        isRequired?: boolean;
        options?: string[];
    };
}

export async function putField(
    ctx: FieldUpdateContext,
): Promise<void> {
    await putGraphMutation(
        ctx.flowId,
        g => ({
            ...g,
            nodes: g.nodes.map(
                n => n.id === ctx.nodeId
                    ? {
                        ...n,
                        fields: n.fields.map(
                            f => f.id
                                === ctx.fieldId
                                ? applyFieldUpdate(
                                    f,
                                    ctx.fields,
                                )
                                : f,
                        ),
                    }
                    : n,
            ),
        }),
    );
}
