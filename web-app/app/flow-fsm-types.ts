import type {
    InteractionState,
    Selection,
} from './flow-interactions.ts';

export type FsmState = InteractionState;
export type { Selection };

export interface NodeMoveUpdate {
    nodeId: string;
    x: number;
    y: number;
}

export interface NodePosition {
    x: number;
    y: number;
    isDraggable: boolean;
}

export interface NodeWithPos {
    id: string;
    x: number;
    y: number;
}

export type FsmInput =
    | {
        kind: 'pointer-down-on-canvas';
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
    }
    | {
        kind: 'pointer-down-on-node';
        nodeId: string;
        isPort: boolean;
        isDraggable: boolean;
        isShift: boolean;
        isMeta: boolean;
        isLocked: boolean;
        svgX: number;
        svgY: number;
        now: number;
        selectedPositions: Map<
            string,
            { x: number; y: number }
        >;
    }
    | {
        kind: 'pointer-down-on-edge';
        edgeId: string;
        now: number;
    }
    | {
        kind: 'pointer-move';
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
        isShift: boolean;
        hoverNodeId: string | null;
        svgRectW: number;
        svgRectH: number;
    }
    | {
        kind: 'pointer-up';
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
        isShift: boolean;
        hoverNodeId: string | null;
        fromNodePosition:
            { x: number; y: number } | null;
        allNodes: NodeWithPos[];
    }
    | {
        kind: 'wheel';
        deltaY: number;
        svgX: number;
        svgY: number;
        isAutoFit: boolean;
    }
    | {
        kind: 'space-down';
        isAutoFit: boolean;
        isFormFocused: boolean;
    }
    | { kind: 'space-up' }
    | {
        kind: 'shift-key';
        isShift: boolean;
    }
    | {
        kind: 'canvas-key-activate';
        nodeId: string | null;
        edgeId: string | null;
    };

export type Action =
    | {
        kind: 'move-nodes';
        updates: NodeMoveUpdate[];
    }
    | {
        kind: 'add-edge';
        fromId: string;
        toId: string;
    }
    | {
        kind: 'add-node';
        fromId: string;
        svgX: number;
        svgY: number;
    }
    | {
        kind: 'open-panel';
        open: boolean;
    }
    | { kind: 'request-update' }
    | { kind: 'capture-pointer' }
    | { kind: 'release-pointer' }
    | {
        kind: 'set-pan-cursor';
        on: boolean;
    }
    | {
        kind: 'show-toast';
        message: string;
        tone: 'error' | 'success';
    };

export interface FsmResult {
    readonly state: FsmState;
    readonly actions: readonly Action[];
}
