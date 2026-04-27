import { GET } from '../../../api/api.ts';
import type {
    FlowEntity,
    ProjectEntity,
    ProjectFlowEntity,
    GraphNode,
    GraphEdge,
    GraphField,
    StoredGraph,
    FlowFieldType,
} from '../../../api/types.ts';
import { toBool } from '../../../api/types.ts';
import {
    validateStoredGraphJson,
} from '../../../api/validators.ts';

export type {
    GraphNode, GraphEdge, GraphField,
    FlowFieldType,
};

export interface FlowGraph {
    id: string;
    name: string;
    description: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    createdAt: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function parseGraph(
    raw: string,
): StoredGraph {
    return validateStoredGraphJson(
        raw, 'flow.graph',
    );
}

export interface FlowSummary {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly projectName:
        string | undefined;
}

export interface FlowListItem {
    id: string;
    name: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
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
        string, string
    >();
    for (const pw of projectFlows) {
        const name = projectMap.get(
            pw.project_id,
        );
        if (name !== undefined) {
            projectByFlow.set(
                pw.flow_id, name,
            );
        }
    }

    return flows.map(f => {
        const g = parseGraph(f.graph);
        return {
            id: f.id,
            name: f.name,
            description: f.description,
            projectName:
                projectByFlow.get(f.id),
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
        isAutoLayout: toBool(
            flow.is_auto_layout,
        ),
        isAutoFit: toBool(
            flow.is_auto_fit,
        ),
        lockTimeout: flow.lock_timeout,
        createdAt: flow.created_at,
        nodes: g.nodes,
        edges: g.edges,
    };
}
