import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout.ts';
import { showToast } from './toast.ts';
import { reduceFsm }
    from './flow-fsm-reduce.ts';
import type {
    FsmInput,
    Action,
} from './flow-fsm-types.ts';

const AUTOFIT_TOAST_MSG =
    'Disable Auto-Fit to change the view';
const WHEEL_TOAST_COOLDOWN_MS = 2000;
const ZOOM_TO_FIT_PADDING_PX = 70;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

// Cooldown state: 'never' before the
// first toast, 'last' with the firing
// timestamp afterward. The discriminated
// union makes "have we ever fired?"
// explicit, instead of encoding it as
// a magic 0 in a number.
type CooldownState =
    | { kind: 'never' }
    | { kind: 'last'; at: number };

const toastWithCooldown = (() => {
    let cooldown: CooldownState =
        { kind: 'never' };
    return (
        msg: string,
        tone: 'error' | 'success',
    ): void => {
        const now = Date.now();
        if (
            cooldown.kind === 'last'
            && now - cooldown.at
                < WHEEL_TOAST_COOLDOWN_MS
        ) return;
        cooldown = { kind: 'last', at: now };
        showToast(msg, tone);
    };
})();

export interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type FlowGestureContext = Readonly<{
    isAutoFit: boolean;
    isLocked: boolean;
}>;

export type Selection =
    | { kind: 'none' }
    | {
        kind: 'nodes';
        nodeIds: Set<string>;
    }
    | { kind: 'edge'; edgeId: string };

export type DragMode =
    | { kind: 'idle' }
    | {
        kind: 'dragging';
        anchorNodeId: string;
        startPointerX: number;
        startPointerY: number;
        currentPointerX: number;
        currentPointerY: number;
        initialPositions: Map<
            string,
            { x: number; y: number }
        >;
    };

export type ConnectTarget =
    | { kind: 'none' }
    | { kind: 'node'; id: string };

export type ConnectMode =
    | { kind: 'idle' }
    | {
        kind: 'connecting';
        fromNodeId: string;
        toX: number;
        toY: number;
        isShift: boolean;
        target: ConnectTarget;
    };

export type PanMode =
    | { kind: 'idle' }
    | {
        kind: 'panning';
        startX: number;
        startY: number;
    };

export type MarqueeMode =
    | { kind: 'idle' }
    | {
        kind: 'selecting';
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    };

export type LastClick =
    | { kind: 'none' }
    | {
        kind: 'clicked';
        id: string;
        time: number;
    };

export interface InteractionState {
    selection: Selection;
    lastClick: LastClick;
    drag: DragMode;
    connect: ConnectMode;
    pan: PanMode;
    marquee: MarqueeMode;
    viewBox: ViewBox;
    zoom: number;
    isSpaceDown: boolean;
}

export type PanelRequestCallback =
    (open: boolean) => void;

export type NodePositionLookup = (
    id: string,
) => {
    x: number;
    y: number;
    isDraggable: boolean;
};

export type NodeListLookup = (
) => Iterable<{
    id: string;
    x: number;
    y: number;
}>;

export type InteractionCallback = () => void;

export function buildInteractionState(
    viewBoxW: number,
    viewBoxH: number,
): InteractionState {
    return {
        selection: { kind: 'none' },
        lastClick: { kind: 'none' },
        drag: { kind: 'idle' },
        connect: { kind: 'idle' },
        pan: { kind: 'idle' },
        marquee: { kind: 'idle' },
        viewBox: {
            x: -viewBoxW / 2,
            y: -viewBoxH / 2,
            w: viewBoxW,
            h: viewBoxH,
        },
        zoom: 1.0,
        isSpaceDown: false,
    };
}

function screenToSvg(
    svg: SVGSVGElement,
    clientX: number,
    clientY: number,
): { x: number; y: number } {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(
        ctm.inverse(),
    );
    return { x: svgPt.x, y: svgPt.y };
}

function ancestorAttr(
    el: Element,
    attrName: string,
): string | null {
    let current: Element | null = el;
    while (current) {
        const value =
            current.getAttribute(attrName);
        if (value !== null) return value;
        current = current.parentElement;
    }
    return null;
}

function buildSelectedPositions(
    state: InteractionState,
    clickedId: string,
    getNodePosition: NodePositionLookup,
): Map<string, { x: number; y: number }> {
    const m = new Map<
        string,
        { x: number; y: number }
    >();
    if (state.selection.kind === 'nodes') {
        for (
            const id of state.selection.nodeIds
        ) {
            const pos = getNodePosition(id);
            m.set(id, {
                x: pos.x, y: pos.y,
            });
        }
    }
    const clickedPos =
        getNodePosition(clickedId);
    m.set(clickedId, {
        x: clickedPos.x, y: clickedPos.y,
    });
    return m;
}

function isFormFocused(): boolean {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName
        .toLowerCase();
    if (
        tag === 'input'
        || tag === 'textarea'
        || tag === 'select'
        || tag === 'button'
        || tag === 'a'
    ) return true;
    return (
        activeEl as HTMLElement
    ).isContentEditable;
}

export function bindInteractions(
    wrap: HTMLElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    onPanelRequest: PanelRequestCallback,
    onNodesDragEnd: (
        updates: Array<{
            nodeId: string;
            x: number;
            y: number;
        }>,
    ) => void,
    onEdgeCreated: (
        fromNodeId: string,
        toNodeId: string,
    ) => void,
    onNodeCreated: (
        fromNodeId: string,
        x: number,
        y: number,
    ) => void,
    getNodePosition: NodePositionLookup,
    getAllNodes: NodeListLookup,
    initialContext: FlowGestureContext,
    signal: AbortSignal,
): (next: FlowGestureContext) => void {
    let context = initialContext;
    let activePointerId: number | null = null;
    if (state.isSpaceDown) {
        wrap.classList.add(
            'flow-pan-cursor',
        );
    }

    const liveSvg = (
    ): SVGSVGElement | null => {
        const el = wrap.querySelector(
            'svg.flow-canvas',
        );
        return el instanceof SVGSVGElement
            ? el : null;
    };

    const applyAction = (
        action: Action,
    ): void => {
        switch (action.kind) {
            case 'move-nodes':
                onNodesDragEnd(action.updates);
                return;
            case 'add-edge':
                onEdgeCreated(
                    action.fromId,
                    action.toId,
                );
                return;
            case 'add-node':
                onNodeCreated(
                    action.fromId,
                    action.svgX,
                    action.svgY,
                );
                return;
            case 'open-panel':
                onPanelRequest(action.open);
                return;
            case 'request-update':
                onUpdate();
                return;
            case 'capture-pointer':
                if (
                    activePointerId !== null
                ) {
                    wrap.setPointerCapture(
                        activePointerId,
                    );
                }
                return;
            case 'release-pointer':
                if (
                    activePointerId !== null
                ) {
                    wrap.releasePointerCapture(
                        activePointerId,
                    );
                    activePointerId = null;
                }
                return;
            case 'set-pan-cursor':
                if (action.on) {
                    wrap.classList.add(
                        'flow-pan-cursor',
                    );
                } else {
                    wrap.classList.remove(
                        'flow-pan-cursor',
                    );
                }
                return;
            case 'show-toast':
                if (
                    action.message
                        === AUTOFIT_TOAST_MSG
                ) {
                    toastWithCooldown(
                        action.message,
                        action.tone,
                    );
                } else {
                    showToast(
                        action.message,
                        action.tone,
                    );
                }
                return;
        }
    };

    const dispatch = (
        input: FsmInput,
    ): void => {
        const result = reduceFsm(
            state, input,
        );
        Object.assign(state, result.state);
        for (const action of result.actions) {
            applyAction(action);
        }
    };

    wrap.addEventListener(
        'pointerdown',
        (e) => {
            activePointerId = e.pointerId;
            const svg = liveSvg();
            if (!svg) return;
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const svgPt = screenToSvg(
                svg, e.clientX, e.clientY,
            );

            if (state.isSpaceDown) {
                dispatch({
                    kind:
                        'pointer-down-on-canvas',
                    svgX: svgPt.x,
                    svgY: svgPt.y,
                    clientX: e.clientX,
                    clientY: e.clientY,
                });
                return;
            }

            const nodeId = ancestorAttr(
                target, 'data-node-id',
            );
            if (nodeId) {
                const isPort =
                    ancestorAttr(
                        target,
                        'data-connect-port',
                    ) !== null;
                const pos =
                    getNodePosition(nodeId);
                const positions =
                    buildSelectedPositions(
                        state,
                        nodeId,
                        getNodePosition,
                    );
                dispatch({
                    kind:
                        'pointer-down-on-node',
                    nodeId,
                    isPort,
                    isDraggable:
                        pos.isDraggable,
                    isShift: e.shiftKey,
                    isMeta:
                        e.metaKey
                        || e.ctrlKey,
                    isLocked:
                        context.isLocked,
                    svgX: svgPt.x,
                    svgY: svgPt.y,
                    now: Date.now(),
                    selectedPositions:
                        positions,
                });
                return;
            }

            const edgeId = ancestorAttr(
                target, 'data-edge-id',
            );
            if (edgeId) {
                dispatch({
                    kind:
                        'pointer-down-on-edge',
                    edgeId,
                    now: Date.now(),
                });
                return;
            }

            dispatch({
                kind:
                    'pointer-down-on-canvas',
                svgX: svgPt.x,
                svgY: svgPt.y,
                clientX: e.clientX,
                clientY: e.clientY,
            });
        },
        { signal },
    );

    wrap.addEventListener(
        'pointermove',
        (e) => {
            const svg = liveSvg();
            if (!svg) return;
            const svgPt = screenToSvg(
                svg, e.clientX, e.clientY,
            );
            let hoverNodeId: string | null
                = null;
            const hit =
                document.elementFromPoint(
                    e.clientX, e.clientY,
                );
            if (hit instanceof Element) {
                hoverNodeId = ancestorAttr(
                    hit, 'data-node-id',
                );
            }
            const rect =
                svg.getBoundingClientRect();
            dispatch({
                kind: 'pointer-move',
                svgX: svgPt.x,
                svgY: svgPt.y,
                clientX: e.clientX,
                clientY: e.clientY,
                isShift: e.shiftKey,
                hoverNodeId,
                svgRectW: rect.width,
                svgRectH: rect.height,
            });
        },
        { signal },
    );

    wrap.addEventListener(
        'pointerup',
        (e) => {
            const svg = liveSvg();
            if (!svg) return;
            const svgPt = screenToSvg(
                svg, e.clientX, e.clientY,
            );
            let hoverNodeId: string | null
                = null;
            const hit =
                document.elementFromPoint(
                    e.clientX, e.clientY,
                );
            if (hit instanceof Element) {
                hoverNodeId = ancestorAttr(
                    hit, 'data-node-id',
                );
            }
            let fromNodePosition: {
                x: number;
                y: number;
            } | null = null;
            if (
                state.connect.kind
                    === 'connecting'
            ) {
                const pos = getNodePosition(
                    state.connect.fromNodeId,
                );
                fromNodePosition = {
                    x: pos.x, y: pos.y,
                };
            }
            const allNodes =
                state.marquee.kind
                    === 'selecting'
                    ? Array.from(
                        getAllNodes(),
                    )
                    : [];
            dispatch({
                kind: 'pointer-up',
                svgX: svgPt.x,
                svgY: svgPt.y,
                clientX: e.clientX,
                clientY: e.clientY,
                isShift: e.shiftKey,
                hoverNodeId,
                fromNodePosition,
                allNodes,
            });
        },
        { signal },
    );

    wrap.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            const svg = liveSvg();
            if (!svg) return;
            const svgPt = screenToSvg(
                svg, e.clientX, e.clientY,
            );
            dispatch({
                kind: 'wheel',
                deltaY: e.deltaY,
                svgX: svgPt.x,
                svgY: svgPt.y,
                isAutoFit: context.isAutoFit,
            });
        },
        { passive: false, signal },
    );

    const handleShift = (
        ke: KeyboardEvent,
    ): void => {
        if (ke.key !== 'Shift') return;
        dispatch({
            kind: 'shift-key',
            isShift: ke.shiftKey,
        });
    };
    window.addEventListener(
        'keydown', handleShift,
        { signal },
    );
    window.addEventListener(
        'keyup', handleShift,
        { signal },
    );

    const handleSpace = (
        ke: KeyboardEvent,
    ): void => {
        if (ke.key !== ' ') return;
        if (isFormFocused()) return;
        ke.preventDefault();
        if (ke.type === 'keydown') {
            dispatch({
                kind: 'space-down',
                isAutoFit: context.isAutoFit,
                isFormFocused: false,
            });
        } else {
            dispatch({ kind: 'space-up' });
        }
    };
    window.addEventListener(
        'keydown', handleSpace,
        { signal },
    );
    window.addEventListener(
        'keyup', handleSpace,
        { signal },
    );

    document.addEventListener(
        'keydown',
        (e) => {
            if (
                e.key !== 'Enter'
                && e.key !== ' '
            ) return;
            const active =
                document.activeElement;
            if (
                !(active instanceof Element)
            ) return;
            if (
                !wrap.contains(active)
            ) return;
            const nodeId = ancestorAttr(
                active, 'data-node-id',
            );
            const edgeId = ancestorAttr(
                active, 'data-edge-id',
            );
            if (!nodeId && !edgeId) return;
            e.preventDefault();
            dispatch({
                kind:
                    'canvas-key-activate',
                nodeId,
                edgeId,
            });
        },
        { signal },
    );

    return (next) => {
        context = next;
    };
}

export function zoomIn(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): InteractionState {
    return applyButtonZoom(
        state, ZOOM_STEP, focalPt,
    );
}

export function zoomOut(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): InteractionState {
    return applyButtonZoom(
        state, -ZOOM_STEP, focalPt,
    );
}

function applyButtonZoom(
    state: InteractionState,
    delta: number,
    focalPt: {
        x: number;
        y: number;
    } | null | undefined,
): InteractionState {
    const prevCx = state.viewBox.x
        + state.viewBox.w / 2;
    const prevCy = state.viewBox.y
        + state.viewBox.h / 2;
    const prevZoom = state.zoom;
    const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(
            MAX_ZOOM, prevZoom + delta,
        ),
    );
    const ratio = prevZoom / nextZoom;
    const nextW = state.viewBox.w * ratio;
    const nextH = state.viewBox.h * ratio;
    const cx = focalPt?.x ?? prevCx;
    const cy = focalPt?.y ?? prevCy;
    return {
        ...state,
        zoom: nextZoom,
        viewBox: {
            x: cx - nextW / 2,
            y: cy - nextH / 2,
            w: nextW,
            h: nextH,
        },
    };
}

export interface ZoomToFitResult {
    readonly zoom: number;
    readonly viewBox: ViewBox;
}

export function zoomToFit(
    nodePositions: readonly {
        x: number;
        y: number;
    }[],
    canvasW: number,
    canvasH: number,
): ZoomToFitResult | null {
    if (nodePositions.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pos of nodePositions) {
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + NODE_WIDTH > maxX) {
            maxX = pos.x + NODE_WIDTH;
        }
        if (pos.y + NODE_HEIGHT > maxY) {
            maxY = pos.y + NODE_HEIGHT;
        }
    }

    const contentW =
        maxX - minX
        + ZOOM_TO_FIT_PADDING_PX * 2;
    const contentH =
        maxY - minY
        + ZOOM_TO_FIT_PADDING_PX * 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const containerAR = canvasW / canvasH;
    const contentAR =
        contentW / contentH;

    let vbW: number;
    let vbH: number;
    if (contentAR > containerAR) {
        vbW = contentW;
        vbH = contentW / containerAR;
    } else {
        vbH = contentH;
        vbW = contentH * containerAR;
    }

    let zoom = canvasW / vbW;
    if (zoom > MAX_ZOOM) {
        zoom = MAX_ZOOM;
        vbW = canvasW / MAX_ZOOM;
        vbH = canvasH / MAX_ZOOM;
    }
    return {
        zoom,
        viewBox: {
            x: cx - vbW / 2,
            y: cy - vbH / 2,
            w: vbW,
            h: vbH,
        },
    };
}
