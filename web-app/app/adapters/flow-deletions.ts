import { GET, PUT } from '../../../api/api.ts';
import type {
    FlowEntity,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    jsonObjectField,
} from '../../../api/types.ts';
import {
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import { postFlowVersion } from './flow-versions.ts';

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
