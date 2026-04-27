import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout.ts';
import type {
    FsmState,
    FsmInput,
    FsmResult,
    Action,
    Selection,
} from './flow-fsm-types.ts';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const DBLCLICK_MS = 400;
const MIN_DRAG_DISTANCE = 20;
const AUTOFIT_TOAST_MSG =
    'Disable Auto-Fit to change the view';

export function reduceFsm(
    state: FsmState,
    input: FsmInput,
): FsmResult {
    switch (input.kind) {
        case 'pointer-down-on-canvas':
            return onCanvasPointerDown(
                state, input,
            );
        case 'pointer-down-on-node':
            return onNodePointerDown(
                state, input,
            );
        case 'pointer-down-on-edge':
            return onEdgePointerDown(
                state, input,
            );
        case 'pointer-move':
            return onPointerMove(state, input);
        case 'pointer-up':
            return onPointerUp(state, input);
        case 'wheel':
            return onWheel(state, input);
        case 'space-down':
            return onSpaceDown(state, input);
        case 'space-up':
            return onSpaceUp(state);
        case 'shift-key':
            return onShiftKey(state, input);
        case 'canvas-key-activate':
            return onCanvasKeyActivate(
                state, input,
            );
    }
}

function onCanvasPointerDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-canvas';
    }>,
): FsmResult {
    if (state.isSpaceDown) {
        return {
            state: {
                ...state,
                pan: {
                    kind: 'panning',
                    startX: input.clientX,
                    startY: input.clientY,
                },
            },
            actions: [
                { kind: 'capture-pointer' },
                { kind: 'request-update' },
            ],
        };
    }
    return {
        state: {
            ...state,
            lastClick: { kind: 'none' },
            selection: { kind: 'none' },
            marquee: {
                kind: 'selecting',
                startX: input.svgX,
                startY: input.svgY,
                currentX: input.svgX,
                currentY: input.svgY,
            },
        },
        actions: [
            { kind: 'open-panel', open: false },
            { kind: 'capture-pointer' },
            { kind: 'request-update' },
        ],
    };
}

function onNodePointerDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-node';
    }>,
): FsmResult {
    if (state.isSpaceDown) {
        return startPanFromNode(state, input);
    }
    const isDbl =
        state.lastClick.kind === 'clicked'
        && input.nodeId === state.lastClick.id
        && input.now - state.lastClick.time
            < DBLCLICK_MS;
    const lastClick = {
        kind: 'clicked' as const,
        id: input.nodeId,
        time: input.now,
    };
    if (input.isPort || !input.isDraggable) {
        return {
            state: {
                ...state,
                lastClick,
                selection: {
                    kind: 'nodes',
                    nodeIds: new Set([
                        input.nodeId,
                    ]),
                },
                connect: {
                    kind: 'connecting',
                    fromNodeId: input.nodeId,
                    toX: input.svgX,
                    toY: input.svgY,
                    isShift: input.isShift,
                    target: { kind: 'none' },
                },
            },
            actions: [
                {
                    kind: 'open-panel',
                    open: isDbl,
                },
                { kind: 'capture-pointer' },
                { kind: 'request-update' },
            ],
        };
    }
    const newSelection =
        nextSelectionForNodeClick(
            state.selection,
            input.nodeId,
            input.isShift,
            input.isMeta,
        );
    if (input.isLocked) {
        return {
            state: {
                ...state,
                lastClick,
                selection: newSelection,
            },
            actions: [
                {
                    kind: 'open-panel',
                    open: isDbl,
                },
                { kind: 'request-update' },
            ],
        };
    }
    const dragIds =
        newSelection.kind === 'nodes'
            ? newSelection.nodeIds
            : new Set<string>();
    const initialPositions =
        new Map<
            string,
            { x: number; y: number }
        >();
    for (const id of dragIds) {
        const pos = input.selectedPositions
            .get(id);
        if (pos) {
            initialPositions.set(id, {
                x: pos.x, y: pos.y,
            });
        }
    }
    return {
        state: {
            ...state,
            lastClick,
            selection: newSelection,
            drag: {
                kind: 'dragging',
                anchorNodeId: input.nodeId,
                startPointerX: input.svgX,
                startPointerY: input.svgY,
                currentPointerX: input.svgX,
                currentPointerY: input.svgY,
                initialPositions,
            },
        },
        actions: [
            { kind: 'open-panel', open: isDbl },
            { kind: 'capture-pointer' },
            { kind: 'request-update' },
        ],
    };
}

function startPanFromNode(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-node';
    }>,
): FsmResult {
    return {
        state: {
            ...state,
            pan: {
                kind: 'panning',
                startX: input.svgX,
                startY: input.svgY,
            },
        },
        actions: [
            { kind: 'capture-pointer' },
            { kind: 'request-update' },
        ],
    };
}

function nextSelectionForNodeClick(
    current: Selection,
    nodeId: string,
    isShift: boolean,
    isMeta: boolean,
): Selection {
    const ids = current.kind === 'nodes'
        ? current.nodeIds
        : new Set<string>();
    if (isShift) {
        const next = new Set(ids);
        next.add(nodeId);
        return {
            kind: 'nodes', nodeIds: next,
        };
    }
    if (isMeta) {
        const next = new Set(ids);
        if (next.has(nodeId)) {
            next.delete(nodeId);
        } else {
            next.add(nodeId);
        }
        return next.size === 0
            ? { kind: 'none' }
            : {
                kind: 'nodes',
                nodeIds: next,
            };
    }
    if (ids.has(nodeId)) {
        return current;
    }
    return {
        kind: 'nodes',
        nodeIds: new Set([nodeId]),
    };
}

function onEdgePointerDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-edge';
    }>,
): FsmResult {
    const isDbl =
        state.lastClick.kind === 'clicked'
        && input.edgeId === state.lastClick.id
        && input.now - state.lastClick.time
            < DBLCLICK_MS;
    return {
        state: {
            ...state,
            selection: {
                kind: 'edge',
                edgeId: input.edgeId,
            },
            lastClick: {
                kind: 'clicked',
                id: input.edgeId,
                time: input.now,
            },
        },
        actions: [
            { kind: 'open-panel', open: isDbl },
            { kind: 'request-update' },
        ],
    };
}

function onPointerMove(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-move';
    }>,
): FsmResult {
    if (state.drag.kind === 'dragging') {
        return {
            state: {
                ...state,
                drag: {
                    ...state.drag,
                    currentPointerX: input.svgX,
                    currentPointerY: input.svgY,
                },
            },
            actions: [
                { kind: 'request-update' },
            ],
        };
    }
    if (state.connect.kind === 'connecting') {
        const target = input.hoverNodeId
            && input.hoverNodeId
                !== state.connect.fromNodeId
            ? {
                kind: 'node' as const,
                id: input.hoverNodeId,
            }
            : { kind: 'none' as const };
        return {
            state: {
                ...state,
                connect: {
                    ...state.connect,
                    toX: input.svgX,
                    toY: input.svgY,
                    isShift: input.isShift,
                    target,
                },
            },
            actions: [
                { kind: 'request-update' },
            ],
        };
    }
    if (state.pan.kind === 'panning') {
        const dx = input.clientX
            - state.pan.startX;
        const dy = input.clientY
            - state.pan.startY;
        const scaleX =
            state.viewBox.w / input.svgRectW;
        const scaleY =
            state.viewBox.h / input.svgRectH;
        return {
            state: {
                ...state,
                viewBox: {
                    ...state.viewBox,
                    x: state.viewBox.x
                        - dx * scaleX,
                    y: state.viewBox.y
                        - dy * scaleY,
                },
                pan: {
                    kind: 'panning',
                    startX: input.clientX,
                    startY: input.clientY,
                },
            },
            actions: [
                { kind: 'request-update' },
            ],
        };
    }
    if (state.marquee.kind === 'selecting') {
        return {
            state: {
                ...state,
                marquee: {
                    ...state.marquee,
                    currentX: input.svgX,
                    currentY: input.svgY,
                },
            },
            actions: [
                { kind: 'request-update' },
            ],
        };
    }
    return { state, actions: [] };
}

function onPointerUp(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-up';
    }>,
): FsmResult {
    if (state.pan.kind === 'panning') {
        return {
            state: {
                ...state,
                pan: { kind: 'idle' },
            },
            actions: [
                { kind: 'release-pointer' },
                { kind: 'request-update' },
            ],
        };
    }
    if (state.drag.kind === 'dragging') {
        const dx =
            state.drag.currentPointerX
            - state.drag.startPointerX;
        const dy =
            state.drag.currentPointerY
            - state.drag.startPointerY;
        const updates: {
            nodeId: string;
            x: number;
            y: number;
        }[] = [];
        for (const [
            id, init,
        ] of state.drag.initialPositions) {
            updates.push({
                nodeId: id,
                x: init.x + dx,
                y: init.y + dy,
            });
        }
        return {
            state: {
                ...state,
                drag: { kind: 'idle' },
            },
            actions: [
                { kind: 'move-nodes', updates },
                { kind: 'release-pointer' },
                { kind: 'request-update' },
            ],
        };
    }
    if (state.connect.kind === 'connecting') {
        return finishConnect(state, input);
    }
    if (state.marquee.kind === 'selecting') {
        return finishMarquee(state, input);
    }
    return { state, actions: [] };
}

function finishConnect(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-up';
    }>,
): FsmResult {
    if (state.connect.kind !== 'connecting') {
        return { state, actions: [] };
    }
    const fromId = state.connect.fromNodeId;
    const toX = state.connect.toX;
    const toY = state.connect.toY;
    const actions: Action[] = [];
    if (input.isShift) {
        if (
            input.hoverNodeId
            && input.hoverNodeId !== fromId
        ) {
            actions.push({
                kind: 'add-edge',
                fromId,
                toId: input.hoverNodeId,
            });
        }
    } else if (input.fromNodePosition) {
        const portX =
            input.fromNodePosition.x
            + NODE_WIDTH;
        const portY =
            input.fromNodePosition.y
            + NODE_HEIGHT / 2;
        const dx = toX - portX;
        const dy = toY - portY;
        const dist = Math.hypot(dx, dy);
        const overNode =
            input.hoverNodeId !== null;
        if (
            dist > MIN_DRAG_DISTANCE
            && !overNode
        ) {
            actions.push({
                kind: 'add-node',
                fromId,
                svgX: toX,
                svgY: toY,
            });
        }
    }
    actions.push({ kind: 'release-pointer' });
    actions.push({ kind: 'request-update' });
    return {
        state: {
            ...state,
            connect: { kind: 'idle' },
        },
        actions,
    };
}

function finishMarquee(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-up';
    }>,
): FsmResult {
    if (state.marquee.kind !== 'selecting') {
        return { state, actions: [] };
    }
    const m = state.marquee;
    const minX = Math.min(m.startX, m.currentX);
    const minY = Math.min(m.startY, m.currentY);
    const maxX = Math.max(m.startX, m.currentX);
    const maxY = Math.max(m.startY, m.currentY);
    const hits = new Set<string>();
    for (const n of input.allNodes) {
        const nr = n.x + NODE_WIDTH;
        const nb = n.y + NODE_HEIGHT;
        const overlaps =
            n.x < maxX
            && nr > minX
            && n.y < maxY
            && nb > minY;
        if (overlaps) {
            hits.add(n.id);
        }
    }
    return {
        state: {
            ...state,
            selection: hits.size === 0
                ? { kind: 'none' }
                : {
                    kind: 'nodes',
                    nodeIds: hits,
                },
            marquee: { kind: 'idle' },
        },
        actions: [
            { kind: 'release-pointer' },
            { kind: 'request-update' },
        ],
    };
}

function onWheel(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'wheel';
    }>,
): FsmResult {
    if (input.isAutoFit) {
        return {
            state,
            actions: [
                {
                    kind: 'show-toast',
                    message: AUTOFIT_TOAST_MSG,
                    tone: 'error',
                },
            ],
        };
    }
    const prevZoom = state.zoom;
    const delta = input.deltaY > 0
        ? -ZOOM_STEP
        : ZOOM_STEP;
    const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, prevZoom + delta),
    );
    const ratio = prevZoom / nextZoom;
    const newW = state.viewBox.w * ratio;
    const newH = state.viewBox.h * ratio;
    const newX =
        input.svgX
        - (input.svgX - state.viewBox.x) * ratio;
    const newY =
        input.svgY
        - (input.svgY - state.viewBox.y) * ratio;
    return {
        state: {
            ...state,
            zoom: nextZoom,
            viewBox: {
                x: newX, y: newY,
                w: newW, h: newH,
            },
        },
        actions: [
            { kind: 'request-update' },
        ],
    };
}

function onSpaceDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'space-down';
    }>,
): FsmResult {
    if (input.isFormFocused) {
        return { state, actions: [] };
    }
    if (state.isSpaceDown) {
        return { state, actions: [] };
    }
    if (input.isAutoFit) {
        return {
            state,
            actions: [
                {
                    kind: 'show-toast',
                    message: AUTOFIT_TOAST_MSG,
                    tone: 'error',
                },
            ],
        };
    }
    return {
        state: {
            ...state,
            isSpaceDown: true,
        },
        actions: [
            { kind: 'set-pan-cursor', on: true },
        ],
    };
}

function onSpaceUp(
    state: FsmState,
): FsmResult {
    if (!state.isSpaceDown) {
        return { state, actions: [] };
    }
    const newPan = state.pan.kind === 'panning'
        ? { kind: 'idle' as const }
        : state.pan;
    return {
        state: {
            ...state,
            isSpaceDown: false,
            pan: newPan,
        },
        actions: [
            { kind: 'set-pan-cursor', on: false },
        ],
    };
}

function onShiftKey(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'shift-key';
    }>,
): FsmResult {
    if (state.connect.kind !== 'connecting') {
        return { state, actions: [] };
    }
    return {
        state: {
            ...state,
            connect: {
                ...state.connect,
                isShift: input.isShift,
            },
        },
        actions: [
            { kind: 'request-update' },
        ],
    };
}

function onCanvasKeyActivate(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'canvas-key-activate';
    }>,
): FsmResult {
    if (input.nodeId) {
        return {
            state: {
                ...state,
                selection: {
                    kind: 'nodes',
                    nodeIds: new Set([
                        input.nodeId,
                    ]),
                },
            },
            actions: [
                {
                    kind: 'open-panel',
                    open: true,
                },
                { kind: 'request-update' },
            ],
        };
    }
    if (input.edgeId) {
        return {
            state: {
                ...state,
                selection: {
                    kind: 'edge',
                    edgeId: input.edgeId,
                },
            },
            actions: [
                {
                    kind: 'open-panel',
                    open: true,
                },
                { kind: 'request-update' },
            ],
        };
    }
    return { state, actions: [] };
}
