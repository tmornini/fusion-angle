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
        this.#undoStack = [
            ...this.#undoStack,
            action,
        ];
        this.#redoStack = [];
    }

    async undo(): Promise<
        UndoAction | null
    > {
        const action =
            this.#undoStack.at(-1);
        if (!action) return null;
        this.#undoStack =
            this.#undoStack.slice(0, -1);
        await this.#executor(
            action.reverse,
        );
        this.#redoStack = [
            ...this.#redoStack,
            action,
        ];
        return action;
    }

    async redo(): Promise<
        UndoAction | null
    > {
        const action =
            this.#redoStack.at(-1);
        if (!action) return null;
        this.#redoStack =
            this.#redoStack.slice(0, -1);
        await this.#executor(
            action.forward,
        );
        this.#undoStack = [
            ...this.#undoStack,
            action,
        ];
        return action;
    }

    canUndo(): boolean {
        return this.#undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.#redoStack.length > 0;
    }
}
