import type {
    FlowEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../../../api/types.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../../../api/types.ts';
import type {
    FlowGraphDelta,
    FlowNodeRowBody,
    FlowEdgeRowBody,
    GraphDeletion,
    FlowNodeMemberRowBody,
    FlowNodeAttributeRowBody,
    FlowWriteHistory,
} from '../../../api/validators.ts';
import { getFlowGraph } from './flow-queries.ts';
export type {
    FlowGraphDelta,
    FlowNodeRowBody,
    FlowEdgeRowBody,
    GraphDeletion,
    FlowNodeMemberRowBody,
    FlowNodeAttributeRowBody,
};
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
    const graphDelta = buildSaveEvents(
        { nodes: [], edges: [] },
        graph,
        input.flowId,
        generateCryptoSafeBase62,
        now,
    );

    await ctx.POST('flows', {
        id: input.flowId,
        flow: {
            name: input.name,
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
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
        graphDelta,
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
// verified token and re-validates the rest). The graph is NOT a
// column — it lands in the relation tables via the graph delta,
// so the body carries only the flow's scalar fields. camelCase
// enters, snake_case exits — this builder is the divorce point.
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
    };
    return entity as unknown as Record<string, unknown>;
}

// Pure diff: working vs baseline StoredGraph → FlowGraphDelta.
// Every working node emits an upsert row (idempotent overwrite).
// Every working edge emits an upsert row.
// Every id in baseline but absent in working emits a deletion.
// Per node: member diff by member_id; attribute diff by
// attributeId — added/removed per presence; changed mode or
// is_required → a NEW 'added' row (latest-wins semantics,
// never an update). Unchanged attributes emit NO event.
// The caller passes `generateCryptoSafeBase62` as `mint` and
// a single `nowUtc()` as `at` (one moment for the whole save).
export function buildSaveEvents(
    baseline: StoredGraph,
    working: StoredGraph,
    flowId: string,
    mint: () => string,
    at: string,
): FlowGraphDelta {
    // Build lookup sets for working ids (used in deletions)
    const workingNodeIds = new Set(
        working.nodes.map(n => n.id),
    );
    const workingEdgeIds = new Set(
        working.edges.map(e => e.id),
    );

    // Node upserts — always every working node
    const nodes: FlowNodeRowBody[] =
        working.nodes.map(node => ({
            id: node.id,
            flow_id: flowId,
            name: node.name,
            position_x: node.positionX,
            position_y: node.positionY,
            is_create: node.isCreate,
            is_archive: node.isArchive,
            task_instructions: node.taskInstructions,
            at,
        }));

    // Edge upserts — always every working edge
    const edges: FlowEdgeRowBody[] =
        working.edges.map(edge => ({
            id: edge.id,
            flow_id: flowId,
            name: edge.name,
            from_node_id: edge.fromNodeId,
            to_node_id: edge.toNodeId,
            at,
        }));

    // Deletions — baseline ids absent in working
    const deletions: GraphDeletion[] = [];
    for (const node of baseline.nodes) {
        if (!workingNodeIds.has(node.id)) {
            deletions.push({
                eventId: mint(),
                entityId: node.id,
                at,
            });
        }
    }
    for (const edge of baseline.edges) {
        if (!workingEdgeIds.has(edge.id)) {
            deletions.push({
                eventId: mint(),
                entityId: edge.id,
                at,
            });
        }
    }

    // Member events — per node diff
    const memberEvents: FlowNodeMemberRowBody[] = [];
    const baseNodeMap = new Map(
        baseline.nodes.map(n => [n.id, n]),
    );
    for (const node of working.nodes) {
        const base = baseNodeMap.get(node.id);
        const baseIds = new Set(
            base ? base.memberIds : [],
        );
        const workIds = new Set(node.memberIds);
        for (const mid of workIds) {
            if (!baseIds.has(mid)) {
                memberEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    member_id: mid,
                    action: 'added',
                    at,
                });
            }
        }
        for (const mid of baseIds) {
            if (!workIds.has(mid)) {
                memberEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    member_id: mid,
                    action: 'removed',
                    at,
                });
            }
        }
    }

    // Attribute events — per node diff by attributeId
    const attributeEvents:
        FlowNodeAttributeRowBody[] = [];
    for (const node of working.nodes) {
        const base = baseNodeMap.get(node.id);
        const baseAttrMap = new Map(
            (base ? base.attributes : []).map(
                a => [a.attributeId, a],
            ),
        );
        const workAttrMap = new Map(
            node.attributes.map(
                a => [a.attributeId, a],
            ),
        );
        // Added or changed
        for (const [aid, wa] of workAttrMap) {
            const ba = baseAttrMap.get(aid);
            if (ba === undefined) {
                // New attribute
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: wa.mode,
                    is_required: wa.isRequired,
                    action: 'added',
                    at,
                });
            } else if (
                wa.mode !== ba.mode
                || wa.isRequired !== ba.isRequired
            ) {
                // Changed — emit a new 'added' row
                // (latest-wins semantics)
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: wa.mode,
                    is_required: wa.isRequired,
                    action: 'added',
                    at,
                });
            }
            // Unchanged → no event
        }
        // Removed
        for (const [aid, ba] of baseAttrMap) {
            if (!workAttrMap.has(aid)) {
                attributeEvents.push({
                    id: mint(),
                    flow_node_id: node.id,
                    attribute_id: aid,
                    mode: ba.mode,
                    is_required: ba.isRequired,
                    action: 'removed',
                    at,
                });
            }
        }
    }

    return {
        nodes, edges, deletions,
        memberEvents, attributeEvents,
    };
}

// Assemble the PUT /flows/:id body for a save: the flow row
// (scalar fields only — no graph blob), a fresh 'updated' event
// id, the caller moment, the version-history side-effect, and
// the graph delta diffed against the CURRENT stored graph. The
// baseline is fetched HERE, before the body is built — never
// empty, so deletions fire only for ids the working copy
// dropped. Both PUT call sites (putFlow and the designer's
// persist chain) build their body through this single voice.
export async function buildFlowPutBody(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
    history: FlowWriteHistory,
): Promise<Record<string, unknown>> {
    const now = nowUtc();
    const baseline = await getFlowGraph(ctx, id);
    const delta = buildSaveEvents(
        { nodes: baseline.nodes, edges: baseline.edges },
        { nodes: save.nodes, edges: save.edges },
        id,
        generateCryptoSafeBase62,
        now,
    );
    return {
        flow: buildFlowBody(save),
        eventId: generateCryptoSafeBase62(),
        at: now,
        history,
        graphDelta: delta,
    };
}

// Save a flow with NO version snapshot: the flow row PUT, its
// 'updated' state event, and the graph delta — written
// atomically through PUT /flows/:id (one re-entrant
// transaction). The author is stamped server-side from the
// token; the client mints the event id.
export async function putFlow(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    await ctx.PUT(
        `flows/${id}`,
        await buildFlowPutBody(
            ctx, id, save, { kind: 'none' },
        ),
    );
    flowChanges.notify();
}
