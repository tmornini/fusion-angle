export type UndoStep =
    | {
        op: 'post';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        op: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        op: 'delete';
        resource: string;
    };

export type UndoActionType =
    | 'add-node'
    | 'delete-node'
    | 'add-edge'
    | 'delete-edge'
    | 'move-node'
    | 'update-node-name'
    | 'update-node-desc'
    | 'update-edge-name'
    | 'update-edge-desc'
    | 'add-field'
    | 'delete-field'
    | 'auto-layout'
    | 'add-node-and-edge';

export interface UndoAction {
    type: UndoActionType;
    forward: UndoStep[];
    reverse: UndoStep[];
}

export type StepExecutor = (
    steps: UndoStep[],
) => Promise<void>;

export class UndoManager {
    #undoStack: UndoAction[] = [];
    #redoStack: UndoAction[] = [];
    #executor: StepExecutor;

    constructor(executor: StepExecutor) {
        this.#executor = executor;
    }

    push(action: UndoAction): void {
        this.#undoStack.push(action);
        this.#redoStack.length = 0;
    }

    async undo(): Promise<
        UndoAction | null
    > {
        const action =
            this.#undoStack.pop();
        if (!action) return null;
        await this.#executor(
            action.reverse,
        );
        this.#redoStack.push(action);
        return action;
    }

    async redo(): Promise<
        UndoAction | null
    > {
        const action =
            this.#redoStack.pop();
        if (!action) return null;
        await this.#executor(
            action.forward,
        );
        this.#undoStack.push(action);
        return action;
    }

    canUndo(): boolean {
        return this.#undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.#redoStack.length > 0;
    }
}
