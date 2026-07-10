import type {
    GraphNode,
    GraphEdge,
} from '../../api/types.ts';

// Client redo-stack snapshot shape. Relocated here from
// adapters/flow-versions.ts (Phase 15 Task 7): the type is LIVE
// via the redo stack; the versions routes/adapters retire.
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

export interface FlowHistorySnapshot {
    readonly hasUndoHistory: boolean;
    readonly redoStack: readonly FlowVersion[];
}

export function buildFlowHistorySnapshot(
    hasUndoHistory: boolean,
): FlowHistorySnapshot {
    return {
        hasUndoHistory,
        redoStack: [],
    };
}

export function canUndoFlowEdits(
    s: FlowHistorySnapshot,
): boolean {
    return s.hasUndoHistory;
}

export function canRedoFlowEdits(
    s: FlowHistorySnapshot,
): boolean {
    return s.redoStack.length > 0;
}

export function recordFlowMutation(
): FlowHistorySnapshot {
    return {
        hasUndoHistory: true,
        redoStack: [],
    };
}

export function recordUndoHistoryMark(
    s: FlowHistorySnapshot,
    value: boolean,
): FlowHistorySnapshot {
    return { ...s, hasUndoHistory: value };
}

export function appendToRedoStack(
    s: FlowHistorySnapshot,
    version: FlowVersion,
): FlowHistorySnapshot {
    return {
        ...s,
        redoStack: [...s.redoStack, version],
    };
}

export interface PoppedRedo {
    readonly snapshot: FlowHistorySnapshot;
    readonly version: FlowVersion | undefined;
}

export function removeFromRedoStack(
    s: FlowHistorySnapshot,
): PoppedRedo {
    if (s.redoStack.length === 0) {
        return { snapshot: s, version: undefined };
    }
    const last = s.redoStack.length - 1;
    return {
        snapshot: {
            ...s,
            redoStack: s.redoStack.slice(0, last),
        },
        version: s.redoStack[last],
    };
}
