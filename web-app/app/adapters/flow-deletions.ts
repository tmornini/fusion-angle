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

export async function deleteNode(
    nodeId: string,
    flowId: string,
): Promise<void> {
    await postFlowVersion(flowId);
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
        graph: putFlowGraph(graph),
        updated_at: nowUtc(),
    });
}

export async function deleteEdge(
    edgeId: string,
    flowId: string,
): Promise<void> {
    await postFlowVersion(flowId);
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
        graph: putFlowGraph(graph),
        updated_at: nowUtc(),
    });
}

export async function deleteField(
    fieldId: string,
    nodeId: string,
    flowId: string,
): Promise<void> {
    await postFlowVersion(flowId);
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
        graph: putFlowGraph(graph),
        updated_at: nowUtc(),
    });
}
