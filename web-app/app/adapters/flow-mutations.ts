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
    mutate: (g: StoredGraph) => void,
): Promise<void> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const graph = parseGraph(
        entity.graph,
    );
    mutate(graph);
    await PUT(`flows/${flowId}`, {
        graph: putFlowGraph(graph),
        updated_at: nowUtc(),
    });
}

const DEFAULT_START_NAME = 'New';
const DEFAULT_COMPLETE_NAME = 'Complete';
const DEFAULT_START_X = -300;
const DEFAULT_START_Y = 0;
const DEFAULT_COMPLETE_X = 300;
const DEFAULT_COMPLETE_Y = 200;

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
    const startNode: GraphNode = {
        id: crypto.randomUUID(),
        name: DEFAULT_START_NAME,
        description: '',
        positionX: DEFAULT_START_X,
        positionY: DEFAULT_START_Y,
        isStart: true,
        isComplete: false,
        fields: [],
    };
    const completeNode: GraphNode = {
        id: crypto.randomUUID(),
        name: DEFAULT_COMPLETE_NAME,
        description: '',
        positionX: DEFAULT_COMPLETE_X,
        positionY: DEFAULT_COMPLETE_Y,
        isStart: false,
        isComplete: true,
        fields: [],
    };
    const graph: StoredGraph = {
        nodes: [startNode, completeNode],
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
        g => { g.nodes.push(node); },
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
        g => { g.edges.push(edge); },
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
        g => {
            const node = g.nodes.find(
                n => n.id === ctx.nodeId,
            );
            if (node) node.fields.push(field);
        },
    );
}

export async function putFlow(
    id: string,
    fields: {
        name?: string;
        description?: string;
    },
): Promise<void> {
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

export async function putGraph(
    flowId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await PUT(`flows/${flowId}`, {
        graph: putFlowGraph({ nodes, edges }),
        updated_at: nowUtc(),
    });
}

export async function putNode(
    flowId: string,
    nodeId: string,
    fields: {
        name?: string;
        description?: string;
        positionX?: number;
        positionY?: number;
    },
): Promise<void> {
    await putGraphMutation(
        flowId,
        g => {
            const node = g.nodes.find(
                n => n.id === nodeId,
            );
            if (!node) return;
            if (fields.name !== undefined)
                node.name = fields.name;
            if (
                fields.description
                    !== undefined
            )
                node.description =
                    fields.description;
            if (
                fields.positionX
                    !== undefined
            )
                node.positionX =
                    fields.positionX;
            if (
                fields.positionY
                    !== undefined
            )
                node.positionY =
                    fields.positionY;
        },
    );
}

export async function putWfEdge(
    flowId: string,
    edgeId: string,
    fields: {
        name?: string;
        description?: string;
    },
): Promise<void> {
    await putGraphMutation(
        flowId,
        g => {
            const edge = g.edges.find(
                e => e.id === edgeId,
            );
            if (!edge) return;
            if (fields.name !== undefined)
                edge.name = fields.name;
            if (
                fields.description
                    !== undefined
            )
                edge.description =
                    fields.description;
        },
    );
}

export async function putField(
    flowId: string,
    nodeId: string,
    fieldId: string,
    fields: {
        name?: string;
        fieldType?: string;
        sortOrder?: number;
        isRequired?: boolean;
        options?: string[];
    },
): Promise<void> {
    await putGraphMutation(
        flowId,
        g => {
            const node = g.nodes.find(
                n => n.id === nodeId,
            );
            if (!node) return;
            const field = node.fields.find(
                f => f.id === fieldId,
            );
            if (!field) return;
            if (fields.name !== undefined)
                field.name = fields.name;
            if (
                fields.fieldType
                    !== undefined
            ) {
                const ft =
                    fields.fieldType as
                        WfFieldType;
                field.fieldType = ft;
            }
            if (
                fields.sortOrder
                    !== undefined
            )
                field.sortOrder =
                    fields.sortOrder;
            if (
                fields.isRequired
                    !== undefined
            )
                field.isRequired =
                    fields.isRequired;
            if (
                fields.options !== undefined
            )
                field.options = fields.options;
        },
    );
}
