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
import type { FetchContext } from './shared.ts';

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
    ctx: FetchContext,
    versionId: string,
    flowId: string,
): Promise<void> {
    const flow = await ctx.GET<FlowEntity>(
        'flows/' + flowId,
    );
    await ctx.PUT<void>(`flow-versions/${versionId}`, {
        flow_id: flowId,
        name: flow.name,
        description: flow.description,
        is_locked: flow.is_locked,
        is_auto_layout: flow.is_auto_layout,
        is_auto_fit: flow.is_auto_fit,
        lock_timeout: flow.lock_timeout,
        graph: flow.graph,
        created_at: nowUtc(),
    });
    const all = await ctx.GET<
        FlowVersionEntity[]
    >('flow-versions');
    const mine = all
        .filter(v => v.flow_id === flowId)
        .sort(compareRows);
    const excess = mine.length - FLOW_VERSION_CAP;
    for (let i = 0; i < excess; i++) {
        await ctx.DELETE(
            'flow-versions/' + mine[i]!.id,
        );
    }
    notifyFlowChange();
}

export async function getFlowVersions(
    ctx: FetchContext,
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
    ctx: FetchContext,
    versionId: string,
): Promise<void> {
    await ctx.DELETE(
        'flow-versions/' + versionId,
    );
    notifyFlowChange();
}

