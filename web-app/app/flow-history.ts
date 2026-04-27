import type { FlowVersion } from './adapters';

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
    s: FlowHistorySnapshot,
): FlowHistorySnapshot {
    return {
        hasUndoHistory: true,
        redoStack: [],
    };
}

export function setHasUndoHistory(
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
