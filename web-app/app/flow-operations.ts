import type { FlowSnapshot } from
    './presenters/flow-designer.ts';
import type { RequestContext } from
    './adapters/shared.ts';
import type {
    GraphEdge,
    GraphNode,
    NodeAttribute,
    RecordAttributeId,
    StoredGraph,
} from '../../api/types.ts';
import {
    DEFAULT_NEW_STATE_NAME,
    DEFAULT_TRANSITION_NAME,
    storedGraphField,
} from '../../api/types.ts';
import { RequestError } from '../../api/api.ts';
import {
    postFlowVersion,
    putFlow,
    buildFlowBody,
    buildSaveEvents,
    buildRevivals,
    notifyFlowChange,
    getFlowGraph,
    getFlowVersions,
    generateCryptoSafeBase62,
    nowUtc,
} from './adapters/index.ts';
import type {
    FlowSaveShape,
} from './adapters/flow-mutations.ts';
import type { FlowVersion } from './adapters/flow-versions.ts';
import { jitteredBackoff } from './adapters/shared.ts';
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

async function commitFlowMutation(
    ctx: RequestContext,
    snap: FlowSnapshot,
    nodes: GraphNode[],
    edges: GraphEdge[],
): Promise<void> {
    await postFlowVersion(
        ctx,
        generateCryptoSafeBase62(),
        snap.flowId,
    );
    await putFlow(
        ctx,
        snap.flowId,
        snapToSave(snap, nodes, edges),
    );
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

// Drive POST /flows/:id/undo with its own jittered 412-absorb
// (Task 5, corrected): the undo op's synthesized document pair
// takes the LOCKED family's follows slot, so a save racing this
// undo for the SAME head 412s the whole transaction (the
// responses.follows unique index — message-pair.ts). Attempt 1
// computes graphDelta/revivals from the CALLER's in-memory
// liveGraph — the designer's live working snapshot IS the
// baseline on the happy path, exactly as the pre-Task-5 code
// did, so the happy path never fetches getFlowGraph at all (it
// stays at getFlowVersions + POST + a TRAILING getFlowGraph +
// getFlowVersions — 4 hops, performUndo below). Only a 412 retry
// (attempt 2+) re-fetches a FRESH getFlowGraph baseline before
// recomputing — retrying against the ORIGINAL (now-stale)
// baseline would under-revive any node a concurrent save deleted
// in between (the same hazard class Task 4 closed for redo's
// revivals; re-reading getFlowVersions alone would not catch
// it — the TARGET version stays fixed across attempts, only the
// CURRENT baseline is re-read on retry). Not exported: performUndo
// is the only caller.
async function postFlowUndo(
    ctx: RequestContext,
    flowId: string,
    version: FlowVersion,
    liveGraph: StoredGraph,
): Promise<void> {
    const target = {
        nodes: version.nodes,
        edges: version.edges,
    };
    let baseline: StoredGraph = liveGraph;
    for (
        let attempt = 1;
        attempt <= MAX_UNDO_ATTEMPTS;
        attempt++
    ) {
        const now = nowUtc();
        const graphDelta = buildSaveEvents(
            baseline,
            target,
            flowId,
            generateCryptoSafeBase62,
            now,
        );
        const revivals = buildRevivals(
            baseline,
            target,
            now,
        );
        try {
            await ctx.POST(`flows/${flowId}/undo`, {
                flow: buildFlowBody({
                    name: version.name,
                    isLocked: version.isLocked,
                    isAutoLayout: version.isAutoLayout,
                    isAutoFit: version.isAutoFit,
                    lockTimeout: version.lockTimeout,
                    nodes: version.nodes,
                    edges: version.edges,
                }),
                eventId: generateCryptoSafeBase62(),
                at: now,
                consumedVersionId: version.id,
                graph: storedGraphField(target),
                graphDelta,
                revivals,
            });
            return;
        } catch (err) {
            if (
                err instanceof RequestError
                && err.status === 412
                && attempt < MAX_UNDO_ATTEMPTS
            ) {
                await jitteredBackoff(attempt);
                baseline = await getFlowGraph(ctx, flowId);
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
    const versions = await getFlowVersions(
        ctx, snap.flowId,
    );
    const version = versions[0];
    if (!version) {
        return {
            kind: 'ok',
            freshSnap: snap,
            newHistory: recordUndoHistoryMark(
                history, false,
            ),
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
    // Restore + consume as ONE atomic transaction through the
    // named POST /flows/:id/undo — the flow can never land
    // reverted while the version row survives unconsumed. The
    // 3-attempt jittered 412-absorb lives in postFlowUndo, above;
    // its attempt-1 baseline is THIS snap — the designer's live
    // working state — never a fetch.
    try {
        await postFlowUndo(
            ctx, snap.flowId, version,
            { nodes: snap.nodes, edges: snap.edges },
        );
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
    const remaining = await getFlowVersions(
        ctx, snap.flowId,
    );
    const newHistory = recordUndoHistoryMark(
        stagedHistory,
        remaining.length > 0,
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
    // POST /flows/:id/redo's ONE atomic transaction splits into
    // two independent writes — the SAME non-atomic shape every
    // OTHER perform* mutation (commitFlowMutation) already
    // carries. First, archive the CURRENT state as a version
    // snapshot through postFlowVersion ALONE — that POST
    // computes the publish internally (the exact `version`
    // field the retired route carried), so this never also
    // calls buildFlowVersionSnapshot (double-compute). Then save
    // the redo target's graph through putFlow, passing the
    // TARGET graph itself as the revival intent — putFlow's own
    // C6 retry loop derives the actual revivals fresh from EACH
    // attempt's own baseline, never a list this function
    // precomputes: a concurrent save landing between attempts can
    // tombstone a node the target carries, and only a recompute
    // against the FRESH baseline catches that (see putFlow /
    // buildRevivals in adapters/flow-mutations.ts). One catch
    // spans both writes below: any failure in the redo
    // sequence — postFlowVersion, or putFlow's own exhausted
    // retry / non-412 error — degrades to the same visible
    // failOp, mirroring performUndo's single covenant for its
    // own (one-call) write.
    try {
        await postFlowVersion(
            ctx,
            generateCryptoSafeBase62(),
            snap.flowId,
        );
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
        popped.snapshot, true,
    );
    return {
        kind: 'ok',
        freshSnap: applyServerGraph(snap, graph),
        newHistory,
    };
}
