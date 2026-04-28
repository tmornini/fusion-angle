import { PUT } from '../../../api/api.ts';
import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../../../api/types.ts';
import {
    buildStartAndCompleteNodes,
} from './flow-defaults.ts';
import {
    createChannel,
    bridgeStorageToChannel,
} from '../channels.ts';

const flowChangedChannel =
    createChannel<void>();
bridgeStorageToChannel(
    ['flows', 'flow-versions', 'project-flows'],
    flowChangedChannel,
);

export function subscribeFlowChanges(
    fn: () => void,
): () => void {
    return flowChangedChannel.subscribe(fn);
}

export function notifyFlowChange(): void {
    flowChangedChannel.send();
}

function putFlowGraph(
    graph: StoredGraph,
): string {
    return jsonObjectField(
        graph as unknown as Record<
            string, unknown
        >,
    );
}

export interface FlowCreationInput {
    flowId: string;
    linkId: string;
    projectId: string;
    name: string;
    description: string;
}

export async function postFlowCreation(
    ctx: FlowCreationInput,
): Promise<void> {
    const now = nowUtc();
    const { start, complete } =
        buildStartAndCompleteNodes();
    const graph: StoredGraph = {
        nodes: [start, complete],
        edges: [],
    };

    await PUT<void>('flows', {
        id: ctx.flowId,
        name: ctx.name,
        description: ctx.description,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: putFlowGraph(graph),
        created_at: now,
        updated_at: now,
    });

    await PUT<void>('project-flows', {
        id: ctx.linkId,
        project_id: ctx.projectId,
        flow_id: ctx.flowId,
        created_at: now,
    });

    flowChangedChannel.send();
}

export interface FlowSaveShape {
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

export async function putFlow(
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    const entity: Omit<FlowEntity, 'id'> = {
        name: save.name,
        description: save.description,
        is_locked: save.isLocked,
        is_auto_layout: save.isAutoLayout,
        is_auto_fit: save.isAutoFit,
        lock_timeout: save.lockTimeout,
        graph: jsonObjectField({
            nodes: save.nodes as unknown as
                Record<string, unknown>[],
            edges: save.edges as unknown as
                Record<string, unknown>[],
        }),
        created_at: save.createdAt,
        updated_at: nowUtc(),
    };
    await PUT(`flows/${id}`, entity);
    flowChangedChannel.send();
}
