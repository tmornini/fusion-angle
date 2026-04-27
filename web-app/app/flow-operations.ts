import type { FlowSnapshot } from
    './presenters/flow-designer.ts';
import type {
    GraphEdge,
    GraphField,
    GraphNode,
    FlowFieldType,
} from './adapters/flows.ts';
import {
    postEdgeConnection,
    postNodeAddition,
    postFieldAddition,
    postFlowVersion,
    putFlow,
    deleteEdge,
    deleteField,
    deleteFlowVersion,
    getFlowGraph,
    getFlowVersions,
    putFlowFromVersion,
    generateId,
    nowUtc,
    jsonObjectField,
} from './adapters/index.ts';
import {
    NODE_WIDTH,
    NODE_HEIGHT,
} from './flow-layout.ts';
import {
    applyDeleteNodes,
} from './flow-designer-actions.ts';
import {
    setHasUndoHistory,
    appendToRedoStack,
    removeFromRedoStack,
} from './flow-history.ts';
import type {
    FlowHistorySnapshot,
} from './flow-history.ts';
import { log } from './logger.ts';

function serializeGraph(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
) {
    return jsonObjectField(
        { nodes, edges } as unknown as Record<
            string, unknown
        >,
    );
}

function singleSelectedNodeId(
    snap: FlowSnapshot,
): string | null {
    const sel = snap.interaction.selection;
    if (sel.kind !== 'nodes') return null;
    if (sel.nodeIds.size !== 1) return null;
    return sel.nodeIds.values().next().value!;
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

export interface EdgeAddOk {
    readonly edge: GraphEdge;
    readonly advanceHistory: true;
}

export async function performAddEdge(
    snap: FlowSnapshot,
    fromId: string,
    toId: string,
): Promise<OpResult<EdgeAddOk>> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
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
    if (from.isComplete) {
        return failOp(
            'Cannot create transition'
            + ' from end state',
        );
    }
    if (to.isStart) {
        return failOp(
            'Cannot create transition'
            + ' to start state',
        );
    }
    const hasDuplicate = snap.edges.some(
        e => e.fromNodeId === fromId
            && e.toNodeId === toId,
    );
    if (hasDuplicate) {
        return failOp('Transition already exists');
    }
    if (from.isStart) {
        const hasOutgoing = snap.edges.some(
            e => e.fromNodeId === fromId,
        );
        if (hasOutgoing) {
            return failOp(
                'Start state allows'
                + ' only one outgoing'
                + ' transition',
            );
        }
    }
    const edgeId = generateId();
    const name = 'Transition';
    try {
        await postEdgeConnection({
            edgeId,
            flowId: snap.flowId,
            name,
            fromNodeId: fromId,
            toNodeId: toId,
        });
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
        edge: {
            id: edgeId,
            name,
            description: '',
            fromNodeId: fromId,
            toNodeId: toId,
        },
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
    snap: FlowSnapshot,
    fromNodeId: string,
    x: number,
    y: number,
): Promise<OpResult<NodeAddOk>> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
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
    if (fromNode.isComplete) {
        return failOp(
            'Cannot create from end state',
        );
    }
    if (fromNode.isStart) {
        const hasOut = snap.edges.some(
            e => e.fromNodeId === fromNodeId,
        );
        if (hasOut) {
            return failOp(
                'Start state allows'
                + ' only one outgoing'
                + ' transition',
            );
        }
    }
    const nodeId = generateId();
    const edgeId = generateId();
    const posX = x - NODE_WIDTH / 2;
    const posY = y - NODE_HEIGHT / 2;
    try {
        await postNodeAddition({
            nodeId,
            flowId: snap.flowId,
            name: 'New State',
            positionX: posX,
            positionY: posY,
        });
    } catch (err) {
        log.error(
            'performAddNodeAtPosition'
            + ' postNodeAddition failed',
            'flow-operations', err,
        );
        return failOp('Failed to add state');
    }
    try {
        await postEdgeConnection({
            edgeId,
            flowId: snap.flowId,
            name: 'Transition',
            fromNodeId,
            toNodeId: nodeId,
        });
    } catch (err) {
        log.error(
            'performAddNodeAtPosition'
            + ' postEdgeConnection failed',
            'flow-operations', err,
        );
        return failOp(
            'Failed to connect transition',
        );
    }
    return {
        kind: 'ok',
        node: {
            id: nodeId,
            name: 'New State',
            description: '',
            isStart: false,
            isComplete: false,
            positionX: posX,
            positionY: posY,
            fields: [],
        },
        edge: {
            id: edgeId,
            name: 'Transition',
            description: '',
            fromNodeId,
            toNodeId: nodeId,
        },
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
    snap: FlowSnapshot,
): Promise<OpResult<NodesDeleteOk> | OpNoop> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    const sel = snap.interaction.selection;
    if (sel.kind !== 'nodes') {
        return { kind: 'noop' };
    }
    const deletableIds: string[] = [];
    for (const id of sel.nodeIds) {
        const n = snap.nodes.find(
            nd => nd.id === id,
        );
        if (n && !n.isStart && !n.isComplete) {
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
        await postFlowVersion(snap.flowId);
        await putFlow(snap.flowId, {
            name: snap.flowName,
            description: snap.flowDescription,
            isLocked: snap.isLocked,
            isAutoLayout: snap.isAutoLayout,
            isAutoFit: snap.isAutoFit,
            lockTimeout: snap.lockTimeout,
            nodes: result.nodes,
            edges: result.edges,
            createdAt: snap.createdAt,
        });
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
    snap: FlowSnapshot,
): Promise<OpResult<EdgeDeleteOk> | OpNoop> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    const sel = snap.interaction.selection;
    if (sel.kind !== 'edge') {
        return { kind: 'noop' };
    }
    const edgeId = sel.edgeId;
    try {
        await deleteEdge(edgeId, snap.flowId);
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

export interface FieldAddOk {
    readonly nodeId: string;
    readonly field: GraphField;
    readonly advanceHistory: true;
}

export async function performAddField(
    snap: FlowSnapshot,
    name: string,
    fieldType: string,
    isRequired: boolean,
    options: string[],
): Promise<OpResult<FieldAddOk> | OpNoop> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    const trimmed = name.trim();
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
    const sortOrder = node.fields.length;
    const fieldId = generateId();
    try {
        await postFieldAddition({
            fieldId,
            flowId: snap.flowId,
            nodeId,
            name: trimmed,
            fieldType,
            sortOrder,
            isRequired,
            options,
        });
    } catch (err) {
        log.error(
            'performAddField failed',
            'flow-operations', err,
        );
        return failOp('Failed to add field');
    }
    return {
        kind: 'ok',
        nodeId,
        field: {
            id: fieldId,
            name: trimmed,
            fieldType: fieldType as FlowFieldType,
            sortOrder,
            isRequired,
            options,
        },
        advanceHistory: true,
    };
}

export interface FieldDeleteOk {
    readonly nodeId: string;
    readonly fieldId: string;
    readonly advanceHistory: true;
}

export async function performDeleteField(
    snap: FlowSnapshot,
    fieldId: string,
): Promise<OpResult<FieldDeleteOk> | OpNoop> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    const nodeId = singleSelectedNodeId(snap);
    if (!nodeId) {
        return { kind: 'noop' };
    }
    try {
        await deleteField(
            fieldId, nodeId, snap.flowId,
        );
    } catch (err) {
        log.error(
            'performDeleteField failed',
            'flow-operations', err,
        );
        return failOp('Failed to delete field');
    }
    return {
        kind: 'ok',
        nodeId,
        fieldId,
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
        description: string;
        isLocked: boolean;
        isAutoLayout: boolean;
        isAutoFit: boolean;
        lockTimeout: number;
        createdAt: string;
        nodes: GraphNode[];
        edges: GraphEdge[];
    },
): FlowSnapshot {
    return {
        ...snap,
        flowName: graph.name,
        flowDescription: graph.description,
        isLocked: graph.isLocked,
        isAutoLayout: graph.isAutoLayout,
        isAutoFit: graph.isAutoFit,
        lockTimeout: graph.lockTimeout,
        createdAt: graph.createdAt,
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
    snap: FlowSnapshot,
    history: FlowHistorySnapshot,
): Promise<OpResult<HistoryOpOk>> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    try {
        const versions = await getFlowVersions(
            snap.flowId,
        );
        const version = versions[0];
        if (!version) {
            return {
                kind: 'ok',
                freshSnap: snap,
                newHistory: setHasUndoHistory(
                    history, false,
                ),
            };
        }
        const stagedHistory = appendToRedoStack(
            history,
            {
                id: generateId(),
                flowId: snap.flowId,
                name: snap.flowName,
                description: snap.flowDescription,
                isLocked: snap.isLocked,
                isAutoLayout: snap.isAutoLayout,
                isAutoFit: snap.isAutoFit,
                lockTimeout: snap.lockTimeout,
                graph: serializeGraph(
                    snap.nodes, snap.edges,
                ),
                createdAt: nowUtc(),
            },
        );
        await putFlowFromVersion(version);
        await deleteFlowVersion(version.id);
        const graph = await getFlowGraph(
            snap.flowId,
        );
        const remaining = await getFlowVersions(
            snap.flowId,
        );
        const newHistory = setHasUndoHistory(
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
    snap: FlowSnapshot,
    history: FlowHistorySnapshot,
): Promise<OpResult<HistoryOpOk>> {
    if (snap.isLocked) {
        return failOp('Flow is locked');
    }
    const popped = removeFromRedoStack(history);
    if (!popped.version) {
        return {
            kind: 'ok',
            freshSnap: snap,
            newHistory: popped.snapshot,
        };
    }
    try {
        await postFlowVersion(snap.flowId);
        await putFlowFromVersion(popped.version);
        const graph = await getFlowGraph(
            snap.flowId,
        );
        const newHistory = setHasUndoHistory(
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

