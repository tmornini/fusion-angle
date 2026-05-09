import type {
    FlowEntity,
    FlowVersionEntity,
    GraphNode,
    GraphEdge,
} from '../../../api/types.ts';
import {
    nowUtc,
} from '../../../api/types.ts';
import {
    asBoolean,
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import {
    notifyFlowChange,
} from './flow-mutations.ts';
import type {
    RequestContext, WriteOp,
} from './shared.ts';

export interface FlowVersion {
    id: string;
    flowId: string;
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

export const FLOW_VERSION_CAP = 10;

function computeFlowVersion(
    row: FlowVersionEntity,
): FlowVersion {
    const g = validateStoredGraphJson(
        row.graph, 'flow.graph',
    );
    return {
        id: row.id,
        flowId: row.flow_id,
        name: row.name,
        description: row.description,
        isLocked: asBoolean(
            row.is_locked,
            'is_locked',
        ),
        isAutoLayout: asBoolean(
            row.is_auto_layout,
            'is_auto_layout',
        ),
        isAutoFit: asBoolean(
            row.is_auto_fit,
            'is_auto_fit',
        ),
        lockTimeout: row.lock_timeout,
        nodes: g.nodes,
        edges: g.edges,
        createdAt: row.created_at,
    };
}

function compareRows(
    a: FlowVersionEntity,
    b: FlowVersionEntity,
): number {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

export async function postFlowVersion(
    ctx: RequestContext,
    versionId: string,
    flowId: string,
): Promise<void> {
    const [flow, allVersions] = await Promise.all([
        ctx.GET<FlowEntity>('flows/' + flowId),
        ctx.GET<FlowVersionEntity[]>(
            'flow-versions',
        ),
    ]);
    const mine = allVersions
        .filter(v => v.flow_id === flowId)
        .sort(compareRows);
    // Anticipate the version about to be written;
    // trim the oldest if that pushes us past cap.
    const excess =
        (mine.length + 1) - FLOW_VERSION_CAP;
    const trims: WriteOp[] = [];
    for (let i = 0; i < excess; i++) {
        trims.push({
            method: 'delete',
            resource:
                'flow-versions/' + mine[i]!.id,
        });
    }
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `flow-versions/${versionId}`,
                body: {
                    flow_id: flowId,
                    name: flow.name,
                    description: flow.description,
                    is_locked: flow.is_locked,
                    is_auto_layout:
                        flow.is_auto_layout,
                    is_auto_fit: flow.is_auto_fit,
                    lock_timeout:
                        flow.lock_timeout,
                    graph: flow.graph,
                    created_at: nowUtc(),
                },
            },
            ...trims,
        ],
    });
    notifyFlowChange();
}

export async function getFlowVersions(
    ctx: RequestContext,
    flowId: string,
): Promise<FlowVersion[]> {
    const all = await ctx.GET<
        FlowVersionEntity[]
    >('flow-versions');
    return all
        .filter(v => v.flow_id === flowId)
        .sort((a, b) => -compareRows(a, b))
        .map(computeFlowVersion);
}

export async function deleteFlowVersion(
    ctx: RequestContext,
    versionId: string,
): Promise<void> {
    await ctx.DELETE(
        'flow-versions/' + versionId,
    );
    notifyFlowChange();
}

