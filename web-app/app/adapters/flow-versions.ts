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
    RequestContext,
} from './shared.ts';

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

// The publish derivation: the current flow captured as a new
// version-snapshot row, plus the ids of the over-cap versions to
// trim. The web-app owns this cap-retention computation — the
// server just writes the resulting put + deletes atomically.
interface FlowVersionPublish {
    version: Record<string, unknown>;
    trimIds: string[];
}

async function computeFlowVersionPublish(
    ctx: RequestContext,
    flowId: string,
): Promise<FlowVersionPublish> {
    const [flow, mine] = await Promise.all([
        ctx.GET<FlowEntity>('flows/' + flowId),
        ctx.GET<FlowVersionEntity[]>(
            'flows/' + flowId + '/versions',
        ),
    ]);
    mine.sort(compareRows);
    // Anticipate the version about to be written;
    // trim the oldest if that pushes us past cap.
    const excess =
        (mine.length + 1) - FLOW_VERSION_CAP;
    const trimIds: string[] = [];
    for (let i = 0; i < excess; i++) {
        trimIds.push(mine[i]!.id);
    }
    return {
        version: {
            flow_id: flowId,
            name: flow.name,
            is_locked: flow.is_locked,
            is_auto_layout: flow.is_auto_layout,
            is_auto_fit: flow.is_auto_fit,
            lock_timeout: flow.lock_timeout,
            graph: flow.graph,
            at: nowUtc(),
        },
        trimIds,
    };
}

// The version-snapshot sub-object the named POST /flows/:id/save
// and /redo operations carry: the current flow captured as a new
// version row (under `versionId`) plus the ids of the over-cap
// versions to trim. The web-app owns the cap-retention
// derivation; the server writes the put + the N deletes inside
// the same re-entrant transaction as the flow write.
export interface FlowVersionSnapshot {
    id: string;
    version: Record<string, unknown>;
    trimIds: string[];
}

export async function buildFlowVersionSnapshot(
    ctx: RequestContext,
    versionId: string,
    flowId: string,
): Promise<FlowVersionSnapshot> {
    const { version, trimIds } =
        await computeFlowVersionPublish(ctx, flowId);
    return { id: versionId, version, trimIds };
}

// Publish a flow version standalone: the new snapshot row plus
// the over-cap trims, written atomically through the named
// POST /flow-versions operation (the put + the N deletes in one
// re-entrant transaction). The trim computation stays
// client-side, consistent with the other flow writes.
export async function postFlowVersion(
    ctx: RequestContext,
    versionId: string,
    flowId: string,
): Promise<void> {
    const { version, trimIds } =
        await computeFlowVersionPublish(ctx, flowId);
    await ctx.POST('flows/' + flowId + '/versions', {
        id: versionId,
        version,
        trimIds,
    });
    notifyFlowChange();
}

export async function getFlowVersions(
    ctx: RequestContext,
    flowId: string,
): Promise<FlowVersion[]> {
    const mine = await ctx.GET<
        FlowVersionEntity[]
    >('flows/' + flowId + '/versions');
    return mine
        .sort((a, b) => -compareRows(a, b))
        .map(computeFlowVersion);
}
