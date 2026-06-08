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
    postFlowVersion,
    putFlow,
    deleteFlowVersion,
    getFlowGraph,
    getFlowVersions,
    generateCryptoSafeBase62,
    nowUtc,
} from './adapters/index.ts';
import type {
    FlowSaveShape,
} from './adapters/flow-mutations.ts';
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
    toastVariant: ToastVariant = 'error',
): OpFail {
    return { kind: 'fail', toast, toastVariant };
}

// The lock guard at the head of every mutating perform*: a
// locked flow rejects with a uniform fail. Returns the OpFail to
// return, or null when the flow is writable.
export function requireFlowNotLocked(
    snap: FlowSnapshot,
): OpFail | null {
    return snap.isLocked ? failOp('Flow is locked') : null;
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
        );
    }
    if (to.isCreate) {
        return failOp(
            'Cannot create transition'
            + ' to start state',
        );
    }
    if (hasEdgeBetween(snap.edges, fromId, toId)) {
        return failOp('Transition already exists');
    }
    if (
        from.isCreate
        && nodeHasOutgoingEdges(fromId, snap.edges)
    ) {
        return failOp(
            'Start state allows'
            + ' only one outgoing'
            + ' transition',
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
        return failOp('Failed to add state');
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
        return failOp('Failed to delete state');
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
        attribute_id: attributeId,
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

export async function performUndo(
    ctx: RequestContext,
    snap: FlowSnapshot,
    history: FlowHistorySnapshot,
): Promise<OpResult<HistoryOpOk>> {
    const locked = requireFlowNotLocked(snap);
    if (locked) return locked;
    try {
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
        await putFlow(ctx, snap.flowId, {
            name: version.name,
            isLocked: version.isLocked,
            isAutoLayout: version.isAutoLayout,
            isAutoFit: version.isAutoFit,
            lockTimeout: version.lockTimeout,
            nodes: version.nodes,
            edges: version.edges,
        });
        await deleteFlowVersion(ctx, version.id);
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
    } catch (err) {
        log.error(
            'performUndo failed',
            'flow-operations', err,
        );
        return failOp('Undo failed');
    }
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
    try {
        await postFlowVersion(
            ctx,
            generateCryptoSafeBase62(),
            snap.flowId,
        );
        const v = popped.version;
        await putFlow(ctx, snap.flowId, {
            name: v.name,
            isLocked: v.isLocked,
            isAutoLayout: v.isAutoLayout,
            isAutoFit: v.isAutoFit,
            lockTimeout: v.lockTimeout,
            nodes: v.nodes,
            edges: v.edges,
        });
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
    } catch (err) {
        log.error(
            'performRedo failed',
            'flow-operations', err,
        );
        return failOp('Redo failed');
    }
}

