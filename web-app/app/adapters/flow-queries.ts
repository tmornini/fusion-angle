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
import {
    asBoolean,
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import type { RequestContext } from './shared.ts';
import { getFlowRows } from './flows.ts';
import { withRenderableLayout } from '../flow-graph-layout.ts';

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
}

export interface FlowListItem {
    id: string;
    name: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
}

export async function getFlows(
    ctx: RequestContext,
): Promise<FlowSummary[]> {
    const flows = await getFlowRows(ctx);
    return flows.map(f => {
        const g = parseGraph(f.graph);
        return {
            id: f.id,
            name: f.name,
            description: f.description,
            nodeCount: g.nodes.length,
            edgeCount: g.edges.length,
        };
    });
}

export async function getProjectFlowRows(
    ctx: RequestContext,
): Promise<ProjectFlowEntity[]> {
    return ctx.GET<ProjectFlowEntity[]>(
        'project-flows',
    );
}

export interface FlowWithProjectName {
    readonly summary: FlowSummary;
    readonly projectName: string | undefined;
}

export async function
getFlowsWithProjectNames(
    ctx: RequestContext,
): Promise<FlowWithProjectName[]> {
    const [
        flows, projectFlows, allProjects,
    ] = await Promise.all([
        ctx.GET<FlowEntity[]>('flows'),
        getProjectFlowRows(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
    ]);
    const projectNameById = new Map(
        allProjects.map(
            p => [p.id, p.title],
        ),
    );
    const projectNameByFlow = new Map<
        string, string
    >();
    for (const pf of projectFlows) {
        const name = projectNameById.get(
            pf.project_id,
        );
        if (name !== undefined) {
            projectNameByFlow.set(
                pf.flow_id, name,
            );
        }
    }
    return flows.map(f => {
        const g = parseGraph(f.graph);
        return {
            summary: {
                id: f.id,
                name: f.name,
                description: f.description,
                nodeCount: g.nodes.length,
                edgeCount: g.edges.length,
            },
            projectName:
                projectNameByFlow.get(f.id),
        };
    });
}

export type {
    ProjectFlowEntity,
} from '../../../api/types.ts';

export async function getFlowsByProject(
    ctx: RequestContext,
    projectId: string,
): Promise<FlowListItem[]> {
    const [projectFlows, flows] =
        await Promise.all([
            ctx.GET<ProjectFlowEntity[]>(
                'project-flows',
            ),
            ctx.GET<FlowEntity[]>('flows'),
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
    ctx: RequestContext,
    flowId: string,
): Promise<FlowGraph> {
    const flow =
        await ctx.GET<FlowEntity>(
            `flows/${flowId}`,
        );
    const g = parseGraph(flow.graph);
    return withRenderableLayout({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        isLocked: asBoolean(
            flow.is_locked,
            'is_locked',
        ),
        isAutoLayout: asBoolean(
            flow.is_auto_layout,
            'is_auto_layout',
        ),
        isAutoFit: asBoolean(
            flow.is_auto_fit,
            'is_auto_fit',
        ),
        lockTimeout: flow.lock_timeout,
        nodes: g.nodes,
        edges: g.edges,
    });
}
