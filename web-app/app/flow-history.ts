import type { FlowVersion } from './adapters';

export class FlowHistory {
    #hasUndoHistory: boolean;
    #redoStack: FlowVersion[] = [];

    constructor(hasUndoHistory: boolean) {
        this.#hasUndoHistory = hasUndoHistory;
    }

    canUndo(): boolean {
        return this.#hasUndoHistory;
    }

    canRedo(): boolean {
        return this.#redoStack.length > 0;
    }

    noteMutation(): void {
        this.#hasUndoHistory = true;
        this.#redoStack = [];
    }

    setHasUndoHistory(value: boolean): void {
        this.#hasUndoHistory = value;
    }

    pushRedo(version: FlowVersion): void {
        this.#redoStack.push(version);
    }

    popRedo(): FlowVersion | undefined {
        return this.#redoStack.pop();
    }
}
