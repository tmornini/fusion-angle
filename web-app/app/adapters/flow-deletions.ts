import { GET, PUT } from '../../../api/api';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
} from '../../../api/types';
import {
    nowUtc,
    jsonObjectField,
} from '../../../api/types';
import { parseJson } from './helpers';
import type { UndoStep } from '../flow-undo';

interface StoredGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function parseGraph(
    raw: string,
): StoredGraph {
    return parseJson<StoredGraph>(
        raw,
        { nodes: [], edges: [] },
    );
}

function saveGraph(
    graph: StoredGraph,
): string {
    return jsonObjectField(
        graph as unknown as Record<
            string, unknown
        >,
    );
}

function graphPutStep(
    flowId: string,
    graph: StoredGraph,
): UndoStep {
    return {
        op: 'put',
        resource: `flows/${flowId}`,
        body: {
            graph: saveGraph(graph),
            updated_at: nowUtc(),
        },
    };
}

export async function deleteNode(
    nodeId: string,
    flowId: string,
): Promise<void> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const graph = parseGraph(
        entity.graph,
    );
    graph.edges = graph.edges.filter(
        e =>
            e.fromNodeId !== nodeId
            && e.toNodeId !== nodeId,
    );
    graph.nodes = graph.nodes.filter(
        n => n.id !== nodeId,
    );
    await PUT(`flows/${flowId}`, {
        graph: saveGraph(graph),
        updated_at: nowUtc(),
    });
}

export async function deleteEdge(
    edgeId: string,
    flowId: string,
): Promise<void> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const graph = parseGraph(
        entity.graph,
    );
    graph.edges = graph.edges.filter(
        e => e.id !== edgeId,
    );
    await PUT(`flows/${flowId}`, {
        graph: saveGraph(graph),
        updated_at: nowUtc(),
    });
}

export async function deleteField(
    fieldId: string,
    nodeId: string,
    flowId: string,
): Promise<void> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const graph = parseGraph(
        entity.graph,
    );
    const node = graph.nodes.find(
        n => n.id === nodeId,
    );
    if (node) {
        node.fields = node.fields.filter(
            f => f.id !== fieldId,
        );
    }
    await PUT(`flows/${flowId}`, {
        graph: saveGraph(graph),
        updated_at: nowUtc(),
    });
}

export interface NodeDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
    removedEdgeIds: string[];
}

export async function deleteNodeCapture(
    nodeId: string,
    flowId: string,
): Promise<NodeDeletionCapture> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const before = parseGraph(
        entity.graph,
    );

    const removedEdgeIds = before.edges
        .filter(
            e =>
                e.fromNodeId === nodeId
                || e.toNodeId === nodeId,
        )
        .map(e => e.id);

    const after: StoredGraph = {
        nodes: before.nodes.filter(
            n => n.id !== nodeId,
        ),
        edges: before.edges.filter(
            e =>
                e.fromNodeId !== nodeId
                && e.toNodeId !== nodeId,
        ),
    };

    const restoreSteps: UndoStep[] = [
        graphPutStep(flowId, before),
    ];
    const deleteSteps: UndoStep[] = [
        graphPutStep(flowId, after),
    ];

    await PUT(`flows/${flowId}`, {
        graph: saveGraph(after),
        updated_at: nowUtc(),
    });

    return {
        restoreSteps,
        deleteSteps,
        removedEdgeIds,
    };
}

export interface EdgeDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
}

export async function deleteEdgeCapture(
    edgeId: string,
    flowId: string,
): Promise<EdgeDeletionCapture> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const before = parseGraph(
        entity.graph,
    );
    const after: StoredGraph = {
        nodes: before.nodes,
        edges: before.edges.filter(
            e => e.id !== edgeId,
        ),
    };

    await PUT(`flows/${flowId}`, {
        graph: saveGraph(after),
        updated_at: nowUtc(),
    });

    return {
        restoreSteps: [
            graphPutStep(flowId, before),
        ],
        deleteSteps: [
            graphPutStep(flowId, after),
        ],
    };
}

export interface FieldDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
}

export async function deleteFieldCapture(
    fieldId: string,
    nodeId: string,
    flowId: string,
): Promise<FieldDeletionCapture> {
    const entity =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const before = parseGraph(
        entity.graph,
    );
    const after: StoredGraph = {
        nodes: before.nodes.map(n => {
            if (n.id !== nodeId) return n;
            return {
                ...n,
                fields: n.fields.filter(
                    f => f.id !== fieldId,
                ),
            };
        }),
        edges: before.edges,
    };

    await PUT(`flows/${flowId}`, {
        graph: saveGraph(after),
        updated_at: nowUtc(),
    });

    return {
        restoreSteps: [
            graphPutStep(flowId, before),
        ],
        deleteSteps: [
            graphPutStep(flowId, after),
        ],
    };
}
