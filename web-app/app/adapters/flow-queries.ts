import type {
    FlowWithGraph,
    ProjectEntity,
    ProjectFlowEntity,
    GraphNode,
    GraphEdge,
    NodeAttribute,
    StoredGraph,
    AttributeType,
} from '../../../api/types.ts';
import {
    asBoolean,
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import type { RequestContext } from './shared.ts';
import { getProjectEntities } from './projects.ts';
import { withRenderableLayout } from '../flow-graph-layout.ts';

export type {
    GraphNode, GraphEdge, NodeAttribute,
    AttributeType,
};

export interface FlowGraph {
    id: string;
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    // Phase 14 Task 8 (undo-as-replay): a cheap, approximate
    // "has this flow ever been edited past genesis" signal,
    // carried verbatim from FlowWithGraph.hasUndoHistory — see
    // that field's own doc comment (api/types.ts) for the
    // approximation and its degrade-gracefully failure mode.
    hasUndoHistory: boolean;
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
    readonly nodeCount: number;
    readonly edgeCount: number;
}

export interface FlowListItem {
    id: string;
    name: string;
    nodeCount: number;
    edgeCount: number;
}

// The flow joins for ONE project — the server filters the nested
// collection to the parent project, so no client filter is
// needed.
async function getProjectFlowsForProject(
    ctx: RequestContext,
    projectId: string,
): Promise<ProjectFlowEntity[]> {
    return ctx.GET<ProjectFlowEntity[]>(
        'projects/' + projectId + '/flows',
    );
}

// The project↔flow joins across EVERY project the caller's org
// can see — reassembled from the nested per-project collections,
// since a flow can be joined by projects the caller never named.
// The projects list is org-scoped; each project's joins are
// fetched in parallel and concatenated.
export async function getProjectFlowEntities(
    ctx: RequestContext,
): Promise<ProjectFlowEntity[]> {
    const projects = await getProjectEntities(ctx);
    const perProject = await Promise.all(
        projects.map(p => getProjectFlowsForProject(ctx, p.id)),
    );
    return perProject.flat();
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
        ctx.GET<FlowWithGraph[]>('flows'),
        getProjectFlowEntities(ctx),
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
            getProjectFlowsForProject(ctx, projectId),
            ctx.GET<FlowWithGraph[]>('flows'),
        ]);

    const flowIds = new Set(
        projectFlows.map(pw => pw.flow_id),
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
        await ctx.GET<FlowWithGraph>(
            `flows/${flowId}`,
        );
    const g = parseGraph(flow.graph);
    return withRenderableLayout({
        id: flow.id,
        name: flow.name,
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
        hasUndoHistory: flow.hasUndoHistory,
    });
}
