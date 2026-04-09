import { GET } from '../../../api/api';
import type {
    FlowEntity,
    ProjectEntity,
    ProjectFlowEntity,
    GraphNode,
    GraphEdge,
    GraphField,
} from '../../../api/types';
import { toBool } from '../../../api/types';
import { parseJson } from './helpers';

export type { GraphNode, GraphEdge, GraphField };

export interface FlowGraph {
    id: string;
    name: string;
    description: string;
    isLocked: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

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

export async function getFlows(
): Promise<FlowSummary[]> {
    const [
        flows, projectFlows, projects,
    ] = await Promise.all([
        GET<FlowEntity[]>('flows'),
        GET<ProjectFlowEntity[]>(
            'project-flows',
        ),
        GET<ProjectEntity[]>('projects'),
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

    return flows.map(f => {
        const g = parseGraph(f.graph);
        return {
            id: f.id,
            name: f.name,
            description: f.description,
            projectName:
                projectByFlow.get(f.id)
                    ?? null,
            nodeCount: g.nodes.length,
            edgeCount: g.edges.length,
        };
    });
}

export async function getFlowsByProject(
    projectId: string,
): Promise<FlowListItem[]> {
    const [projectFlows, flows] =
        await Promise.all([
            GET<ProjectFlowEntity[]>(
                'project-flows',
            ),
            GET<FlowEntity[]>('flows'),
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
        flows.map(f => [f.id, f]),
    );

    const result: FlowListItem[] = [];
    for (const fId of flowIds) {
        const f = flowMap.get(fId);
        if (!f) continue;
        const g = parseGraph(f.graph);
        result.push({
            id: f.id,
            name: f.name,
            description: f.description,
            nodeCount: g.nodes.length,
            edgeCount: g.edges.length,
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
    const g = parseGraph(flow.graph);
    return {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        isLocked: toBool(
            flow.is_locked,
        ),
        nodes: g.nodes,
        edges: g.edges,
    };
}
