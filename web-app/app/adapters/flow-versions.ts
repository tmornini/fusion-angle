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
import { filterByField } from './shared.ts';

export interface FlowVersion {
    id: string;
    flowId: string;
    name: string;
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
        createdAt: row.at,
    };
}

function compareRows(
    a: FlowVersionEntity,
    b: FlowVersionEntity,
): number {
    if (a.at < b.at) return -1;
    if (a.at > b.at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

// The version-snapshot write set — the current flow row
// captured as a new version, plus any over-cap trims — as
// batch ops, so a caller can land them atomically beside
// sibling ops in ONE ctx.commit.
export async function postFlowVersionOps(
    ctx: RequestContext,
    versionId: string,
    flowId: string,
): Promise<WriteOp[]> {
    const [flow, allVersions] = await Promise.all([
        ctx.GET<FlowEntity>('flows/' + flowId),
        ctx.GET<FlowVersionEntity[]>(
            'flow-versions',
        ),
    ]);
    const mine = filterByField(allVersions, 'flow_id', flowId)
        .sort(compareRows);
    // Anticipate the version about to be written;
    // trim the oldest if that pushes us past cap.
    const excess =
        (mine.length + 1) - FLOW_VERSION_CAP;
    const trims: WriteOp[] = [];
    for (let i = 0; i < excess; i++) {
        trims.push(deleteFlowVersionOp(mine[i]!.id));
    }
    return [
        {
            method: 'put',
            resource:
                `flow-versions/${versionId}`,
            body: {
                flow_id: flowId,
                name: flow.name,
                is_locked: flow.is_locked,
                is_auto_layout:
                    flow.is_auto_layout,
                is_auto_fit: flow.is_auto_fit,
                lock_timeout:
                    flow.lock_timeout,
                graph: flow.graph,
                at: nowUtc(),
            },
        },
        ...trims,
    ];
}

export async function postFlowVersion(
    ctx: RequestContext,
    versionId: string,
    flowId: string,
): Promise<void> {
    await ctx.commit({
        ops: await postFlowVersionOps(
            ctx, versionId, flowId,
        ),
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
    return filterByField(all, 'flow_id', flowId)
        .sort((a, b) => -compareRows(a, b))
        .map(computeFlowVersion);
}

export function deleteFlowVersionOp(
    versionId: string,
): WriteOp {
    return {
        method: 'delete',
        resource: 'flow-versions/' + versionId,
    };
}
