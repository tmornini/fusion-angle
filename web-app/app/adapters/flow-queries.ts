import { GET } from '../../../api/api';
import type {
    FlowEntity,
    WfNodeEntity,
    WfEdgeEntity,
    WfFieldEntity,
    ProjectEntity,
    ProjectFlowEntity,
    WfFlowNodeEntity,
    WfNodeEdgeEntity,
    WfNodeFieldEntity,
} from '../../../api/types';
import { toBool } from '../../../api/types';
import { parseJson } from './helpers';

export interface FlowListItem {
    id: string;
    name: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
}

export interface FlowSummary {
    id: string;
    name: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
    projectName: string | null;
}

export interface GraphField {
    id: string;
    name: string;
    fieldType: string;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

export interface GraphNode {
    id: string;
    name: string;
    description: string;
    positionX: number;
    positionY: number;
    isStart: boolean;
    isComplete: boolean;
    fields: GraphField[];
}

export interface GraphEdge {
    id: string;
    name: string;
    description: string;
    fromNodeId: string;
    toNodeId: string;
}

export interface FlowGraph {
    id: string;
    name: string;
    description: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export async function getFlows(
): Promise<FlowSummary[]> {
    const [
        flows, projectFlows,
        projects, flowNodes,
        nodeEdges,
    ] = await Promise.all([
        GET<FlowEntity[]>(
            'flows',
        ),
        GET<ProjectFlowEntity[]>(
            'project-flows',
        ),
        GET<ProjectEntity[]>('projects'),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
    ]);

    const projectMap = new Map(
        projects.map(p => [p.id, p.title]),
    );

    const projectByFlow = new Map<
        string, string | null
    >();
    for (const pw of projectFlows) {
        projectByFlow.set(
            pw.flow_id,
            projectMap.get(
                pw.project_id,
            ) ?? null,
        );
    }

    const nodeIdsByFlow = new Map<
        string, Set<string>
    >();
    for (const wf of flows) {
        nodeIdsByFlow.set(
            wf.id, new Set(),
        );
    }
    for (const wn of flowNodes) {
        nodeIdsByFlow
            .get(wn.flow_id)
            ?.add(wn.node_id);
    }

    const edgeCountByFlow = new Map<
        string, number
    >();
    for (const wf of flows) {
        const nodeIds =
            nodeIdsByFlow.get(wf.id)!;
        let count = 0;
        for (const ne of nodeEdges) {
            if (
                nodeIds.has(
                    ne.from_node_id,
                )
                || nodeIds.has(
                    ne.to_node_id,
                )
            ) {
                count++;
            }
        }
        edgeCountByFlow.set(
            wf.id, count,
        );
    }

    return flows.map(wf => ({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        projectName:
            projectByFlow.get(wf.id)
                ?? null,
        nodeCount:
            nodeIdsByFlow
                .get(wf.id)!.size,
        edgeCount:
            edgeCountByFlow
                .get(wf.id)!,
    }));
}

export async function getFlowsByProject(
    projectId: string,
): Promise<FlowListItem[]> {
    const [
        projectFlows, flows,
        flowNodes, nodeEdges,
    ] = await Promise.all([
        GET<ProjectFlowEntity[]>(
            'project-flows',
        ),
        GET<FlowEntity[]>(
            'flows',
        ),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
    ]);

    const flowIds = new Set(
        projectFlows
            .filter(
                pw =>
                    pw.project_id
                        === projectId,
            )
            .map(pw => pw.flow_id),
    );

    const flowMap = new Map(
        flows.map(w => [w.id, w]),
    );

    const nodeIdsByFlow = new Map<
        string, Set<string>
    >();
    for (const wfId of flowIds) {
        nodeIdsByFlow.set(
            wfId, new Set(),
        );
    }
    for (const wn of flowNodes) {
        nodeIdsByFlow
            .get(wn.flow_id)
            ?.add(wn.node_id);
    }

    const edgeCountByFlow = new Map<
        string, number
    >();
    for (const wfId of flowIds) {
        const nodeIds =
            nodeIdsByFlow.get(wfId)!;
        let count = 0;
        for (const ne of nodeEdges) {
            if (
                nodeIds.has(
                    ne.from_node_id,
                )
                || nodeIds.has(
                    ne.to_node_id,
                )
            ) {
                count++;
            }
        }
        edgeCountByFlow.set(
            wfId, count,
        );
    }

    const result: FlowListItem[] = [];
    for (const wfId of flowIds) {
        const wf = flowMap.get(wfId);
        if (!wf) continue;
        result.push({
            id: wf.id,
            name: wf.name,
            description: wf.description,
            nodeCount:
                nodeIdsByFlow
                    .get(wfId)!.size,
            edgeCount:
                edgeCountByFlow
                    .get(wfId)!,
        });
    }
    return result;
}

export async function getFlowGraph(
    flowId: string,
): Promise<FlowGraph> {
    const flow =
        await GET<FlowEntity>(
            `flows/${flowId}`,
        );

    const [
        allFlowNodes, allNodeEdges,
        allNodes, allEdges,
        allFields, allNodeFields,
    ] = await Promise.all([
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
        GET<WfNodeEntity[]>('wf-nodes'),
        GET<WfEdgeEntity[]>('wf-edges'),
        GET<WfFieldEntity[]>('wf-fields'),
        GET<WfNodeFieldEntity[]>(
            'wf-node-fields',
        ),
    ]);

    const nodeIds = new Set(
        allFlowNodes
            .filter(
                wn =>
                    wn.flow_id
                        === flowId,
            )
            .map(wn => wn.node_id),
    );

    const nodeMap = new Map(
        allNodes.map(n => [n.id, n]),
    );
    const edgeMap = new Map(
        allEdges.map(e => [e.id, e]),
    );
    const fieldMap = new Map(
        allFields.map(f => [f.id, f]),
    );

    const fieldsByNodeId = new Map<
        string, GraphField[]
    >();
    for (const nodeId of nodeIds) {
        fieldsByNodeId.set(nodeId, []);
    }
    for (const nf of allNodeFields) {
        if (!nodeIds.has(nf.node_id))
            continue;
        const field =
            fieldMap.get(nf.field_id);
        if (!field) continue;
        fieldsByNodeId.get(nf.node_id)!
            .push({
                id: field.id,
                name: field.name,
                fieldType: field.field_type,
                sortOrder: field.sort_order,
                isRequired:
                    toBool(field.is_required),
                options: parseJson<string[]>(
                    field.options, [],
                ),
            });
    }

    const nodes: GraphNode[] = [];
    for (const nodeId of nodeIds) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        const fields =
            fieldsByNodeId.get(nodeId)!;
        fields.sort(
            (a, b) =>
                a.sortOrder - b.sortOrder,
        );
        nodes.push({
            id: node.id,
            name: node.name,
            description: node.description,
            positionX: node.position_x,
            positionY: node.position_y,
            isStart:
                toBool(node.is_start),
            isComplete:
                toBool(node.is_complete),
            fields,
        });
    }

    const edges: GraphEdge[] = [];
    for (const ne of allNodeEdges) {
        if (
            !nodeIds.has(ne.from_node_id)
            && !nodeIds.has(ne.to_node_id)
        ) continue;
        const edge =
            edgeMap.get(ne.wf_edge_id);
        if (!edge) continue;
        edges.push({
            id: edge.id,
            name: edge.name,
            description: edge.description,
            fromNodeId: ne.from_node_id,
            toNodeId: ne.to_node_id,
        });
    }

    return {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        nodes,
        edges,
    };
}
