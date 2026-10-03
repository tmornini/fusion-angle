import type {
    FlowWithGraph,
    Id,
    ProjectEntity,
    ProjectFlowEntity,
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../shared/types.ts';
import { asStoredGraph } from '../shared/flow-graph-body.ts';
import { asBoolean } from '../shared/json-assert.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type { RequestContext } from './request-context.ts';
import {
    organizationCollection,
    organizationItem,
} from './request-context.ts';
import { getProjectEntities } from './projects.ts';

// The flow as the canvas reads it, in camelCase, with its
// graph parsed. The message is the head it was read from,
// which the designer's undo latches.
export interface FlowGraph {
    readonly message: HttpMessage<FlowWithGraph>;
    id: string;
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function parseGraph(
    value: unknown,
): StoredGraph {
    return asStoredGraph(value, 'flow.graph');
}

// One place turns a flow's message into the graph the canvas
// reads, so a fixture built from a message and the client's
// own read agree on every field.
export function flowGraphOf(
    message: HttpMessage<FlowWithGraph>,
): FlowGraph {
    const flow = message.body().toValue();
    const g = parseGraph(flow.graph);
    return {
        message,
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
    };
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
): Promise<HttpMessage<ProjectFlowEntity>[]> {
    return await ctx.GETCollection<ProjectFlowEntity>(
        organizationItem(ctx, 'projects', projectId)
            + '/flows/',
    );
}

// The project↔flow joins across EVERY project the caller's org
// can see — reassembled from the nested per-project collections,
// since a flow can be joined by projects the caller never named.
// The projects list is org-scoped; each project's joins are
// fetched in parallel and concatenated.
export async function getProjectFlowEntities(
    ctx: RequestContext,
): Promise<HttpMessage<ProjectFlowEntity>[]> {
    const projects = await getProjectEntities(ctx);
    const perProject = await Promise.all(
        projects.map(p => getProjectFlowsForProject(
            ctx, p.body().toValue().id,
        )),
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
        ctx.GETCollection<FlowWithGraph>(
            organizationCollection(ctx, 'flows'),
        ).then(parts => parts.map((m) => m.body().toValue())),
        getProjectFlowEntities(ctx),
        ctx.GETCollection<ProjectEntity>(
            organizationCollection(ctx, 'projects'),
        ).then(parts => parts.map((m) => m.body().toValue())),
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
        const link = pf.body().toValue();
        const name = projectNameById.get(
            link.project_id,
        );
        if (name !== undefined) {
            projectNameByFlow.set(
                link.flow_id, name,
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

export async function getFlowsByProject(
    ctx: RequestContext,
    projectId: string,
): Promise<FlowListItem[]> {
    const [projectFlows, flows] =
        await Promise.all([
            getProjectFlowsForProject(ctx, projectId),
            ctx.GETCollection<FlowWithGraph>(
                organizationCollection(ctx, 'flows'),
            ).then(parts => parts.map((m) => m.body().toValue())),
        ]);

    const flowIds = new Set(
        projectFlows.map(pw => pw.body().toValue().flow_id),
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

// The flow document as stored: its scalar fields and its
// graph as the wire carries it.
export async function getFlowWithGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<HttpMessage<FlowWithGraph>> {
    return await ctx.GET<FlowWithGraph>(
        organizationItem(ctx, 'flows', flowId),
    );
}

// Every flow the organization holds, each with its graph —
// the rows the work-order picker judges readiness from.
export async function getFlowsWithGraphs(
    ctx: RequestContext,
): Promise<HttpMessage<FlowWithGraph>[]> {
    return await ctx.GETCollection<FlowWithGraph>(
        organizationCollection(ctx, 'flows'),
    );
}

export async function getFlowGraph(
    ctx: RequestContext,
    flowId: string,
): Promise<FlowGraph> {
    return flowGraphOf(await getFlowWithGraph(ctx, flowId));
}

// The flow's stored PUT parts, oldest first. More than
// one part is something to undo (spec §10).
export async function getFlowVersions(
    ctx: RequestContext,
    flowId: Id,
): Promise<HttpMessage<FlowEntity>[]> {
    return await ctx.GETCollection<FlowEntity>(
        organizationItem(ctx, 'flows', flowId) + '/versions/',
    );
}
