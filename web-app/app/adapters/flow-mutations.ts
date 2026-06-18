import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    storedGraphField,
    DEFAULT_LOCK_TIMEOUT,
} from '../../../api/types.ts';
import {
    buildStartAndCompleteNodes,
} from './flow-defaults.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import type {
    RequestContext,
} from './shared.ts';

const flowChanges =
    createSubscriptionChannel(
        [
            'flows',
            'flow_versions',
            'project_flows',
        ],
    );

export function subscribeFlowChanges(
    fn: () => void,
): () => void {
    return flowChanges.subscribe(fn);
}

export function notifyFlowChange(): void {
    flowChanges.notify();
}

export interface FlowCreationInput {
    flowId: string;
    linkId: string;
    projectId: string;
    name: string;
}

export async function postFlowCreation(
    ctx: RequestContext,
    input: FlowCreationInput,
): Promise<void> {
    const now = nowUtc();
    const { start, complete } =
        buildStartAndCompleteNodes();
    const graph: StoredGraph = {
        nodes: [start, complete],
        edges: [],
    };

    await ctx.POST('flows', {
        id: input.flowId,
        flow: {
            name: input.name,
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: storedGraphField(graph),
        },
        projectFlowId: input.linkId,
        projectFlow: {
            project_id: input.projectId,
            flow_id: input.flowId,
            at: now,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
        initialStateAt: nowUtc(),
    });

    flowChanges.notify();
}

export interface FlowSaveShape {
    name: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// The flow row body the named save/undo/redo POSTs carry —
// the FlowSaveShape projected onto the storage columns, minus
// the org column (the org-scoped flows store stamps it from the
// verified token and re-validates the rest). camelCase enters,
// snake_case exits — this builder is the divorce point.
export function buildFlowBody(
    save: FlowSaveShape,
): Record<string, unknown> {
    const entity: Omit<
        FlowEntity, 'id' | 'organization_id'
    > = {
        name: save.name,
        is_locked: save.isLocked,
        is_auto_layout: save.isAutoLayout,
        is_auto_fit: save.isAutoFit,
        lock_timeout: save.lockTimeout,
        graph: storedGraphField({
            nodes: save.nodes,
            edges: save.edges,
        }),
    };
    return entity as unknown as Record<string, unknown>;
}

// Save a flow with NO version snapshot: the flow row PUT plus
// its 'updated' state event, written atomically through
// PUT /flows/:id (the put + the event in one re-entrant
// transaction). The author is stamped server-side from the
// token; the client mints the event id.
export async function putFlow(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    await ctx.PUT(`flows/${id}`, {
        flow: buildFlowBody(save),
        eventId: generateCryptoSafeBase62(),
        at: nowUtc(),
        history: { kind: 'none' },
    });
    flowChanges.notify();
}
