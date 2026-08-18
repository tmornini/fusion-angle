import type { FlowSnapshot } from
    './presenters/flow-designer.ts';
import type { RequestContext } from
    './adapters/shared.ts';
import type {
    GraphEdge,
    GraphNode,
    NodeAttribute,
    RecordAttributeId,
} from '../../api/types.ts';
import {
    DEFAULT_NEW_STATE_NAME,
    DEFAULT_TRANSITION_NAME,
} from '../../api/types.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../../api/http-errors.ts';
import {
    putFlow,
    enqueueFlowSave,
    notifyFlowChange,
    getFlowGraph,
    generateCryptoSafeBase62,
    nowUtc,
} from './adapters/index.ts';
import type {
    FlowSaveShape,
} from './adapters/flow-mutations.ts';
import {
    jitteredBackoff,
    organizationItem,
} from './adapters/shared.ts';
import {
    NODE_WIDTH,
    NODE_HEIGHT,
} from './flow-layout.ts';
import {
    applyAddNode,
    applyAddEdge,
    applyAddAttributeRef,
    applyRemoveAttributeRef,
    applyUpdateAttributeMode,
    applyUpdateAttributeRequired,
    applyDeleteNodes,
    applyDeleteEdge,
} from './flow-designer-actions.ts';
import {
    recordUndoHistoryMark,
    appendToRedoStack,
    removeFromRedoStack,
} from './flow-history.ts';
import type {
    FlowHistorySnapshot,
} from './flow-history.ts';
import { log } from './logger.ts';

function isIntermediateNode(
    node: GraphNode | undefined,
): node is GraphNode {
    return node !== undefined
        && !node.isCreate
        && !node.isArchive;
}

function singleSelectedNodeId(
    snap: FlowSnapshot,
): string | null {
    const sel = snap.interaction.selection;
    if (sel.kind !== 'nodes') return null;
    if (sel.nodeIds.size !== 1) return null;
    return sel.nodeIds.values().next().value!;
}

function snapToSave(
    snap: FlowSnapshot,
    nodes: GraphNode[],
    edges: GraphEdge[],
): FlowSaveShape {
    return {
        name: snap.flowName,
        isLocked: snap.isLocked,
        isAutoLayout: snap.isAutoLayout,
        isAutoFit: snap.isAutoFit,
        lockTimeout: snap.lockTimeout,
        nodes,
        edges,
    };
}

// Undo-as-replay (Phase 14 Task 8): no longer archives the
// PRE-edit state through postFlowVersion first — that archive
// existed solely to give the OLD undo mechanism a flow_versions
// row to consume. putFlow's own document pair (written on every
// call, always) is now what a LATER undo's pair-plane walk finds
// as "the state before this edit," so the archive write is dead.
// Routed through enqueueFlowSave (same per-flowId chain as the
// designer's #queueSave) so graph-edit commits cannot race
// presenter-originated puts against the same baseline.
async function commitFlowMutation(
    ctx: RequestContext,
    snap: FlowSnapshot,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await enqueueFlowSave(snap.flowId, () => putFlow(
        ctx,
        snap.flowId,
        snapToSave(snap, nodes, edges),
    ));
}

export type ToastVariant =
    | 'success'
    | 'error'
    | 'warning'
    | 'info';

export interface OpFail {
    readonly kind: 'fail';
    readonly toast: string;
    readonly toastVariant: ToastVariant;
}

export interface OpNoop {
    readonly kind: 'noop';
}

export type OpResult<TOk extends object> =
    | (TOk & { readonly kind: 'ok' })
    | OpFail;

export function failOp(
    toast: string,
    toastVariant: ToastVariant,
): OpFail {
    return { kind: 'fail', toast, toastVariant };
}

// The lock guard at the head of every mutating perform*: a
// locked flow rejects with a uniform fail. Returns the OpFail to
// return, or null when the flow is writable.
export function requireFlowNotLocked(
    snap: FlowSnapshot,
): OpFail | null {
    return snap.isLocked
        ? failOp('Flow is locked', 'error')
        : null;
}

export interface EdgeAddOk {
    readonly edge: GraphEdge;
    readonly advanceHistory: true;
}

function hasEdgeBetween(
    edges: readonly GraphEdge[],
    fromId: string,
    toId: string,
): boolean {
    return edges.some(
        e => e.fromNodeId === fromId
            && e.toNodeId === toId,
    );
}

function nodeHasOutgoingEdges(
    nodeId: string,
    edges: readonly GraphEdge[],
): boolean {
    return edges.some(
        e => e.fromNodeId === nodeId,
    );
}

export async function performAddEdge(
    ctx: RequestContext,
    snap: FlowSnapshot,
    fromId: string,
    toId: string,
): Promise<OpResult<EdgeAddOk>> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const from = snap.nodes.find(
        n => n.id === fromId,
    );
    const to = snap.nodes.find(
        n => n.id === toId,
    );
    if (!from) {
        throw new Error(
            'performAddEdge: unknown fromId '
                + fromId,
        );
    }
    if (!to) {
        throw new Error(
            'performAddEdge: unknown toId '
                + toId,
        );
    }
    if (from.isArchive) {
        return failOp(
            'Cannot create transition'
            + ' from end state',
            'error',
        );
    }
    if (to.isCreate) {
        return failOp(
            'Cannot create transition'
            + ' to start state',
            'error',
        );
    }
    if (hasEdgeBetween(snap.edges, fromId, toId)) {
        return failOp(
            'Transition already exists', 'error',
        );
    }
    if (
        from.isCreate
        && nodeHasOutgoingEdges(fromId, snap.edges)
    ) {
        return failOp(
            'Start state allows'
            + ' only one outgoing'
            + ' transition',
            'error',
        );
    }
    const edgeId = generateCryptoSafeBase62();
    const newEdges = applyAddEdge(
        snap.edges,
        edgeId,
        DEFAULT_TRANSITION_NAME,
        fromId,
        toId,
    );
    try {
        await commitFlowMutation(
            ctx, snap, snap.nodes, newEdges,
        );
    } catch (err) {
        log.error(
            'performAddEdge failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to create transition',
            'error',
        );
    }
    return {
        kind: 'ok',
        edge: newEdges[newEdges.length - 1]!,
        advanceHistory: true,
    };
}

export interface NodeAddOk {
    readonly node: GraphNode;
    readonly edge: GraphEdge;
    readonly selectId: string;
    readonly advanceHistory: true;
}

export async function performAddNodeAtPosition(
    ctx: RequestContext,
    snap: FlowSnapshot,
    fromNodeId: string,
    x: number,
    y: number,
): Promise<OpResult<NodeAddOk>> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const fromNode = snap.nodes.find(
        n => n.id === fromNodeId,
    );
    if (!fromNode) {
        throw new Error(
            'performAddNodeAtPosition:'
                + ' unknown fromNodeId '
                + fromNodeId,
        );
    }
    if (fromNode.isArchive) {
        return failOp(
            'Cannot create from end state',
            'error',
        );
    }
    if (
        fromNode.isCreate
        && nodeHasOutgoingEdges(fromNodeId, snap.edges)
    ) {
        return failOp(
            'Start state allows'
            + ' only one outgoing'
            + ' transition',
            'error',
        );
    }
    const nodeId = generateCryptoSafeBase62();
    const edgeId = generateCryptoSafeBase62();
    const posX = x - NODE_WIDTH / 2;
    const posY = y - NODE_HEIGHT / 2;
    const newNodes = applyAddNode(
        snap.nodes,
        nodeId,
        DEFAULT_NEW_STATE_NAME,
        posX,
        posY,
    );
    const newEdges = applyAddEdge(
        snap.edges,
        edgeId,
        DEFAULT_TRANSITION_NAME,
        fromNodeId,
        nodeId,
    );
    try {
        await commitFlowMutation(
            ctx, snap, newNodes, newEdges,
        );
    } catch (err) {
        log.error(
            'performAddNodeAtPosition failed',
            'flow-operations', err,
        );
        return failOp('Failed to add state', 'error');
    }
    return {
        kind: 'ok',
        node: newNodes[newNodes.length - 1]!,
        edge: newEdges[newEdges.length - 1]!,
        selectId: nodeId,
        advanceHistory: true,
    };
}

export interface NodesDeleteOk {
    readonly nodes: GraphNode[];
    readonly edges: GraphEdge[];
    readonly advanceHistory: true;
}

export async function performDeleteSelectedNodes(
    ctx: RequestContext,
    snap: FlowSnapshot,
): Promise<OpResult<NodesDeleteOk> | OpNoop> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const sel = snap.interaction.selection;
    if (sel.kind !== 'nodes') {
        return { kind: 'noop' };
    }
    const deletableIds: string[] = [];
    for (const id of sel.nodeIds) {
        const n = snap.nodes.find(
            nd => nd.id === id,
        );
        if (isIntermediateNode(n)) {
            deletableIds.push(id);
        }
    }
    if (deletableIds.length === 0) {
        return { kind: 'noop' };
    }
    const result = applyDeleteNodes(
        snap.nodes, snap.edges,
        new Set(deletableIds),
    );
    try {
        await commitFlowMutation(
            ctx, snap, result.nodes, result.edges,
        );
    } catch (err) {
        log.error(
            'performDeleteSelectedNodes failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to delete state', 'error',
        );
    }
    return {
        kind: 'ok',
        nodes: result.nodes,
        edges: result.edges,
        advanceHistory: true,
    };
}

export interface EdgeDeleteOk {
    readonly edgeId: string;
    readonly advanceHistory: true;
}

export async function performDeleteSelectedEdge(
    ctx: RequestContext,
    snap: FlowSnapshot,
): Promise<OpResult<EdgeDeleteOk> | OpNoop> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const sel = snap.interaction.selection;
    if (sel.kind !== 'edge') {
        return { kind: 'noop' };
    }
    const edgeId = sel.edgeId;
    const newEdges = applyDeleteEdge(
        snap.edges, edgeId,
    );
    try {
        await commitFlowMutation(
            ctx, snap, snap.nodes, newEdges,
        );
    } catch (err) {
        log.error(
            'performDeleteSelectedEdge failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to delete transition',
            'error',
        );
    }
    return {
        kind: 'ok',
        edgeId,
        advanceHistory: true,
    };
}

export interface AttributeRefAddOk {
    readonly nodeId: string;
    readonly ref: NodeAttribute;
    readonly advanceHistory: true;
}

export async function performAddAttributeRef(
    ctx: RequestContext,
    snap: FlowSnapshot,
    attributeId: RecordAttributeId,
    mode: 'editable' | 'readonly',
    isRequired: boolean,
): Promise<
    OpResult<AttributeRefAddOk> | OpNoop
> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const nodeId = singleSelectedNodeId(snap);
    if (!nodeId) {
        return { kind: 'noop' };
    }
    const node = snap.nodes.find(
        n => n.id === nodeId,
    );
    if (!node) {
        return { kind: 'noop' };
    }
    const ref: NodeAttribute = {
        attributeId,
        mode,
        isRequired,
    };
    const newNodes = applyAddAttributeRef(
        snap.nodes, nodeId, ref,
    );
    try {
        await commitFlowMutation(
            ctx, snap, newNodes, snap.edges,
        );
    } catch (err) {
        log.error(
            'performAddAttributeRef failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to add attribute',
            'error',
        );
    }
    return {
        kind: 'ok',
        nodeId,
        ref,
        advanceHistory: true,
    };
}

export interface AttributeRefRemoveOk {
    readonly nodeId: string;
    readonly attributeId: RecordAttributeId;
    readonly advanceHistory: true;
}

export async function performRemoveAttributeRef(
    ctx: RequestContext,
    snap: FlowSnapshot,
    attributeId: RecordAttributeId,
): Promise<
    OpResult<AttributeRefRemoveOk> | OpNoop
> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const nodeId = singleSelectedNodeId(snap);
    if (!nodeId) {
        return { kind: 'noop' };
    }
    const newNodes = applyRemoveAttributeRef(
        snap.nodes, nodeId, attributeId,
    );
    try {
        await commitFlowMutation(
            ctx, snap, newNodes, snap.edges,
        );
    } catch (err) {
        log.error(
            'performRemoveAttributeRef failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to remove attribute',
            'error',
        );
    }
    return {
        kind: 'ok',
        nodeId,
        attributeId,
        advanceHistory: true,
    };
}

export interface AttributeModeUpdateOk {
    readonly nodeId: string;
    readonly attributeId: RecordAttributeId;
    readonly mode: 'editable' | 'readonly';
    readonly advanceHistory: true;
}

export async function performUpdateAttributeMode(
    ctx: RequestContext,
    snap: FlowSnapshot,
    attributeId: RecordAttributeId,
    mode: 'editable' | 'readonly',
): Promise<
    OpResult<AttributeModeUpdateOk> | OpNoop
> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const nodeId = singleSelectedNodeId(snap);
    if (!nodeId) {
        return { kind: 'noop' };
    }
    const newNodes = applyUpdateAttributeMode(
        snap.nodes, nodeId, attributeId, mode,
    );
    try {
        await commitFlowMutation(
            ctx, snap, newNodes, snap.edges,
        );
    } catch (err) {
        log.error(
            'performUpdateAttributeMode failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to update attribute mode',
            'error',
        );
    }
    return {
        kind: 'ok',
        nodeId,
        attributeId,
        mode,
        advanceHistory: true,
    };
}

export interface AttributeRequiredUpdateOk {
    readonly nodeId: string;
    readonly attributeId: RecordAttributeId;
    readonly isRequired: boolean;
    readonly advanceHistory: true;
}

export async function
performUpdateAttributeRequired(
    ctx: RequestContext,
    snap: FlowSnapshot,
    attributeId: RecordAttributeId,
    isRequired: boolean,
): Promise<
    OpResult<AttributeRequiredUpdateOk> | OpNoop
> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const nodeId = singleSelectedNodeId(snap);
    if (!nodeId) {
        return { kind: 'noop' };
    }
    const newNodes =
        applyUpdateAttributeRequired(
            snap.nodes, nodeId,
            attributeId, isRequired,
        );
    try {
        await commitFlowMutation(
            ctx, snap, newNodes, snap.edges,
        );
    } catch (err) {
        log.error(
            'performUpdateAttributeRequired'
            + ' failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to update attribute'
            + ' required',
            'error',
        );
    }
    return {
        kind: 'ok',
        nodeId,
        attributeId,
        isRequired,
        advanceHistory: true,
    };
}

export interface HistoryOpOk {
    readonly freshSnap: FlowSnapshot;
    readonly newHistory: FlowHistorySnapshot;
}

function applyServerGraph(
    snap: FlowSnapshot,
    graph: {
        name: string;
        isLocked: boolean;
        isAutoLayout: boolean;
        isAutoFit: boolean;
        lockTimeout: number;
        nodes: GraphNode[];
        edges: GraphEdge[];
    },
): FlowSnapshot {
    return {
        ...snap,
        flowName: graph.name,
        isLocked: graph.isLocked,
        isAutoLayout: graph.isAutoLayout,
        isAutoFit: graph.isAutoFit,
        lockTimeout: graph.lockTimeout,
        nodes: graph.nodes,
        edges: graph.edges,
        isPanelOpen: false,
        interaction: {
            ...snap.interaction,
            selection: { kind: 'none' },
        },
    };
}

// The C6-style retry cap for the undo POST — same three-attempt
// bound putFlow's own PUT retry uses (adapters/flow-mutations.ts).
const MAX_UNDO_ATTEMPTS = 3;

// Drive POST /flows/:id/undo with its own jittered 412-absorb:
// the undo op's synthesized document pair takes the LOCKED
// family's lock head, so a save racing this undo for the SAME
// head 412s the whole transaction (the in-tx head re-read).
// Undo-as-replay (Phase 14 Task 8)
// resolves the restore target SERVER-SIDE from the pair plane
// (api/derive-flows.ts's resolveFlowUndoTarget), so this loop
// carries no baseline of its own — a 412 just means the head
// moved; the server re-resolves fresh against the NEW head on
// the very next attempt, landing correctly on "one step back
// from whatever raced this undo in" with nothing for the client
// to recompute or refetch. Each attempt mints a FRESH
// eventId/at (the E6 split putFlow's own retry uses) — a resent
// attempt must be a byte-DIFFERENT request, or it would collide
// on the gate's idempotency fast path (FlowUndoBody's own doc
// comment, api/validators.ts, names why the body keeps these two
// fields at all). Not exported: performUndo is the only caller.
async function postFlowUndo(
    ctx: RequestContext,
    flowId: string,
): Promise<void> {
    for (
        let attempt = 1;
        attempt <= MAX_UNDO_ATTEMPTS;
        attempt++
    ) {
        try {
            await ctx.POST(
                organizationItem(ctx, 'flows', flowId)
                    + '/undo',
                {
                eventId: generateCryptoSafeBase62(),
                at: nowUtc(),
            });
            return;
        } catch (err) {
            if (
                err instanceof RequestError
                && err.status === HTTP_PRECONDITION_FAILED
                && attempt < MAX_UNDO_ATTEMPTS
            ) {
                await jitteredBackoff(attempt);
                continue;
            }
            throw err;
        }
    }
}

export async function performUndo(
    ctx: RequestContext,
    snap: FlowSnapshot,
    history: FlowHistorySnapshot,
): Promise<OpResult<HistoryOpOk>> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    // Undo-as-replay (Phase 14 Task 8): exhaustion is a CLIENT-
    // side short-circuit against the session/wire hasUndoHistory
    // flag — no flow_versions fetch, no server round-trip at
    // all, mirroring today's UX shape with the source swapped
    // (see the PINNED Step 0 block,
    // .superpowers/sdd/phase14-task-8-report.md). A direct-API
    // caller that bypasses this gate still gets a graceful
    // server-side no-op — the route performs zero domain writes
    // when its own pair-plane walk finds no target.
    if (!history.hasUndoHistory) {
        return {
            kind: 'ok',
            freshSnap: snap,
            newHistory: history,
        };
    }
    const stagedHistory = appendToRedoStack(
        history,
        {
            id: generateCryptoSafeBase62(),
            flowId: snap.flowId,
            name: snap.flowName,
            isLocked: snap.isLocked,
            isAutoLayout: snap.isAutoLayout,
            isAutoFit: snap.isAutoFit,
            lockTimeout: snap.lockTimeout,
            nodes: snap.nodes,
            edges: snap.edges,
            createdAt: nowUtc(),
        },
    );
    // The restore write rides ONE named POST /flows/:id/undo
    // transaction — the flow can never land partially reverted.
    // The 3-attempt jittered 412-absorb lives in postFlowUndo,
    // above.
    try {
        await postFlowUndo(ctx, snap.flowId);
    } catch (err) {
        log.error(
            'performUndo failed',
            'flow-operations', err,
        );
        return failOp('Undo failed', 'error');
    }
    notifyFlowChange();
    const graph = await getFlowGraph(
        ctx, snap.flowId,
    );
    const newHistory = recordUndoHistoryMark(
        stagedHistory,
        graph.hasUndoHistory,
    );
    return {
        kind: 'ok',
        freshSnap: applyServerGraph(snap, graph),
        newHistory,
    };
}

export async function performRedo(
    ctx: RequestContext,
    snap: FlowSnapshot,
    history: FlowHistorySnapshot,
): Promise<OpResult<HistoryOpOk>> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    const popped = removeFromRedoStack(history);
    if (!popped.version) {
        return {
            kind: 'ok',
            freshSnap: snap,
            newHistory: popped.snapshot,
        };
    }
    const v = popped.version;
    // Redo folds into the locked save (R1/E5): the retired
    // POST /flows/:id/redo's ONE write is now just putFlow,
    // passing the TARGET graph itself as the revival intent —
    // putFlow's own C6 retry loop derives the actual revivals
    // fresh from EACH attempt's own baseline, never a list this
    // function precomputes: a concurrent save landing between
    // attempts can tombstone a node the target carries, and only
    // a recompute against the FRESH baseline catches that (see
    // putFlow / buildRevivals in adapters/flow-mutations.ts).
    // Undo-as-replay (Phase 14 Task 8) retires the OTHER write
    // this used to make (postFlowVersion, archiving the
    // pre-redo state so a LATER undo could consume it): undo no
    // longer consumes flow_versions at all — it resolves its
    // target from the flows/:id document-pair history, and THIS
    // putFlow's own document pair (every redo already wrote one)
    // is exactly what a later undo's pair-plane walk finds as
    // "the state before the redo," with no archive needed. A
    // failure here — putFlow's own exhausted retry or a non-412
    // error — degrades to the same visible failOp, mirroring
    // performUndo's single covenant for its own one-call write.
    try {
        await putFlow(
            ctx,
            snap.flowId,
            {
                name: v.name,
                isLocked: v.isLocked,
                isAutoLayout: v.isAutoLayout,
                isAutoFit: v.isAutoFit,
                lockTimeout: v.lockTimeout,
                nodes: v.nodes,
                edges: v.edges,
            },
            { nodes: v.nodes, edges: v.edges },
        );
    } catch (err) {
        log.error(
            'performRedo failed',
            'flow-operations', err,
        );
        return failOp('Redo failed', 'error');
    }
    notifyFlowChange();
    const graph = await getFlowGraph(
        ctx, snap.flowId,
    );
    const newHistory = recordUndoHistoryMark(
        popped.snapshot, graph.hasUndoHistory,
    );
    return {
        kind: 'ok',
        freshSnap: applyServerGraph(snap, graph),
        newHistory,
    };
}
