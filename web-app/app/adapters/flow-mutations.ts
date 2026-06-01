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
    buildStateEventOp,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import type { RequestContext } from './shared.ts';

const flowChanges =
    createSubscriptionChannel(
        [
            'flows',
            'flow-versions',
            'project-flows',
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

    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `flows/${input.flowId}`,
                body: {
                    name: input.name,
                    is_locked: false,
                    is_auto_layout: false,
                    is_auto_fit: false,
                    lock_timeout:
                        DEFAULT_LOCK_TIMEOUT,
                    graph: putFlowGraph(graph),
                },
            },
            {
                method: 'put',
                resource:
                    `project-flows/`
                    + `${input.linkId}`,
                body: {
                    project_id: input.projectId,
                    flow_id: input.flowId,
                    at: now,
                },
            },
            await buildStateEventOp(
                ctx, input.flowId, 'active',
            ),
        ],
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

export async function putFlow(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    const entity: Omit<FlowEntity, 'id'> = {
        name: save.name,
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
    };
    const body =
        entity as unknown as Record<
            string, unknown
        >;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `flows/${id}`,
                body,
            },
            await buildStateEventOp(
                ctx, id, 'updated',
            ),
        ],
    });
    flowChanges.notify();
}
