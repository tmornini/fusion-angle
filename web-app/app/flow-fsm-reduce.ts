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
        case 'space-toggle':
            return onSpaceToggle(state, input);
        case 'shift-key':
            return onShiftKey(state, input);
        case 'canvas-key-activate':
            return onCanvasKeyActivate(
                state, input,
            );
        case 'canvas-focus':
            return onCanvasFocus(state, input);
    }
}

function onCanvasPointerDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-canvas';
    }>,
): FsmResult {
    if (state.isPanMode) {
        const next: FsmState = {
            ...state,
            pan: {
                kind: 'panning',
                startX: input.clientX,
                startY: input.clientY,
            },
        };
        return {
            state: next,
            actions: [
                { kind: 'capture-pointer' },
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    const next: FsmState = {
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
    };
    return {
        state: next,
        actions: [
            { kind: 'open-panel', open: false },
            { kind: 'capture-pointer' },
            { kind: 'request-update', state: next },
        ],
    };
}

function shouldStartConnection(
    isPort: boolean,
    isDraggable: boolean,
): boolean {
    return isPort || !isDraggable;
}

function onNodePointerDown(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-node';
    }>,
): FsmResult {
    if (state.isPanMode) {
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
    if (shouldStartConnection(input.isPort, input.isDraggable)) {
        const next: FsmState = {
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
        };
        return {
            state: next,
            actions: [
                ...(isDbl ? [{
                    kind: 'open-panel' as const,
                    open: true,
                }] : []),
                { kind: 'capture-pointer' },
                {
                    kind: 'request-update',
                    state: next,
                },
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
        const next: FsmState = {
            ...state,
            lastClick,
            selection: newSelection,
        };
        return {
            state: next,
            actions: [
                ...(isDbl ? [{
                    kind: 'open-panel' as const,
                    open: true,
                }] : []),
                {
                    kind: 'request-update',
                    state: next,
                },
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
    const next: FsmState = {
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
    };
    return {
        state: next,
        actions: [
            ...(isDbl ? [{
                kind: 'open-panel' as const,
                open: true,
            }] : []),
            { kind: 'capture-pointer' },
            { kind: 'request-update', state: next },
        ],
    };
}

function startPanFromNode(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'pointer-down-on-node';
    }>,
): FsmResult {
    const next: FsmState = {
        ...state,
        pan: {
            kind: 'panning',
            startX: input.svgX,
            startY: input.svgY,
        },
    };
    return {
        state: next,
        actions: [
            { kind: 'capture-pointer' },
            { kind: 'request-update', state: next },
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
    const next: FsmState = {
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
    };
    return {
        state: next,
        actions: [
            ...(isDbl ? [{
                kind: 'open-panel' as const,
                open: true,
            }] : []),
            { kind: 'request-update', state: next },
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
        const next: FsmState = {
            ...state,
            drag: {
                ...state.drag,
                currentPointerX: input.svgX,
                currentPointerY: input.svgY,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
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
        const next: FsmState = {
            ...state,
            connect: {
                ...state.connect,
                toX: input.svgX,
                toY: input.svgY,
                isShift: input.isShift,
                target,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
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
        const next: FsmState = {
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
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    if (state.marquee.kind === 'selecting') {
        const next: FsmState = {
            ...state,
            marquee: {
                ...state.marquee,
                currentX: input.svgX,
                currentY: input.svgY,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
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
        const next: FsmState = {
            ...state,
            pan: { kind: 'idle' },
        };
        return {
            state: next,
            actions: [
                { kind: 'release-pointer' },
                { kind: 'request-update', state: next },
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
        const next: FsmState = {
            ...state,
            drag: { kind: 'idle' },
        };
        if (dx === 0 && dy === 0) {
            return {
                state: next,
                actions: [
                    { kind: 'release-pointer' },
                    {
                        kind: 'request-update',
                        state: next,
                    },
                ],
            };
        }
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
            state: next,
            actions: [
                { kind: 'move-nodes', updates },
                { kind: 'release-pointer' },
                { kind: 'request-update', state: next },
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
    const next: FsmState = {
        ...state,
        connect: { kind: 'idle' },
    };
    actions.push({ kind: 'release-pointer' });
    actions.push({
        kind: 'request-update',
        state: next,
    });
    return {
        state: next,
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
    const next: FsmState = {
        ...state,
        selection: hits.size === 0
            ? { kind: 'none' }
            : {
                kind: 'nodes',
                nodeIds: hits,
            },
        marquee: { kind: 'idle' },
    };
    return {
        state: next,
        actions: [
            { kind: 'release-pointer' },
            { kind: 'request-update', state: next },
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
    const next: FsmState = {
        ...state,
        zoom: nextZoom,
        viewBox: {
            x: newX, y: newY,
            w: newW, h: newH,
        },
    };
    return {
        state: next,
        actions: [
            { kind: 'request-update', state: next },
        ],
    };
}

// Exported: the interaction layer skips pointer-move
// conversion work outside a gesture, and the detail page
// routes in-gesture updates to the narrow renderer.
export function isGestureActive(
    state: FsmState,
): boolean {
    return state.drag.kind === 'dragging'
        || state.connect.kind === 'connecting'
        || state.marquee.kind === 'selecting'
        || state.pan.kind === 'panning';
}

function onSpaceToggle(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'space-toggle';
    }>,
): FsmResult {
    if (input.isFormFocused) {
        return { state, actions: [] };
    }
    if (isGestureActive(state)) {
        return { state, actions: [] };
    }
    const turningOn = !state.isPanMode;
    if (turningOn && input.isAutoFit) {
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
    const next: FsmState = {
        ...state,
        isPanMode: turningOn,
    };
    return {
        state: next,
        actions: [
            {
                kind: 'set-pan-cursor',
                on: turningOn,
            },
            {
                kind: 'request-update',
                state: next,
            },
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
    const next: FsmState = {
        ...state,
        connect: {
            ...state.connect,
            isShift: input.isShift,
        },
    };
    return {
        state: next,
        actions: [
            { kind: 'request-update', state: next },
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
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'nodes',
                nodeIds: new Set([
                    input.nodeId,
                ]),
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'open-panel',
                    open: true,
                },
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    if (input.edgeId) {
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'edge',
                edgeId: input.edgeId,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'open-panel',
                    open: true,
                },
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    return { state, actions: [] };
}

// Focus is the keyboard's click: promote it to a single
// selection with request-update only — Enter stays the
// double-click (open-panel lives in canvas-key-activate).
// isRenderedSelected reads the RENDERED aria-current, not
// this FSM's selection, because the page writes selection
// behind the FSM; it breaks the focus -> commit -> restore
// -> focusin loop.
function onCanvasFocus(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'canvas-focus';
    }>,
): FsmResult {
    if (isGestureActive(state)) {
        return { state, actions: [] };
    }
    if (input.isRenderedSelected) {
        return { state, actions: [] };
    }
    if (input.nodeId) {
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'nodes',
                nodeIds: new Set([
                    input.nodeId,
                ]),
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    if (input.edgeId) {
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'edge',
                edgeId: input.edgeId,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    return { state, actions: [] };
}
