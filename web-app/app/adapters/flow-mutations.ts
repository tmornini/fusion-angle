import {
    GET, PUT,
} from '../../../api/api';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    GraphField,
    StoredGraph,
    FlowFieldType,
} from '../../../api/types';
import {
    nowUtc,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../../../api/types';
import {
    validateStoredGraphJson,
} from '../../../api/validators';
import { postFlowVersion } from './flow-versions';
import {
    buildStartAndCompleteNodes,
} from './flow-defaults';
import { generateId } from './uuid';

function parseGraph(
    raw: string,
): StoredGraph {
    return validateStoredGraphJson(
        raw, 'flow.graph',
    );
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
        ...entity,
        graph: putFlowGraph(updated),
        updated_at: nowUtc(),
    });
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
        buildStartAndCompleteNodes();
    const graph: StoredGraph = {
        nodes: [start, complete],
        edges: [],
    };

    await PUT<void>('flows', {
        id: ctx.flowId,
        name: ctx.name,
        description: ctx.description,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: putFlowGraph(graph),
        created_at: now,
        updated_at: now,
    });

    await PUT<void>('project-flows', {
        id: generateId(),
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
        ctx.fieldType as FlowFieldType;
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

export interface FlowSaveShape {
    name: string;
    description: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    createdAt: string;
}

export async function putFlow(
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    const entity: Omit<FlowEntity, 'id'> = {
        name: save.name,
        description: save.description,
        is_locked: save.isLocked,
        is_auto_layout: save.isAutoLayout,
        is_auto_fit: save.isAutoFit,
        lock_timeout: save.lockTimeout,
        graph: jsonObjectField({
            nodes: save.nodes as unknown as
                Record<string, unknown>[],
            edges: save.edges as unknown as
                Record<string, unknown>[],
        }),
        created_at: save.createdAt,
        updated_at: nowUtc(),
    };
    await PUT(`flows/${id}`, entity);
}
