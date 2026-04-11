import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout';

export interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type Selection =
    | { kind: 'none' }
    | { kind: 'node'; nodeId: string }
    | { kind: 'edge'; edgeId: string };

export type DragMode =
    | { kind: 'idle' }
    | {
        kind: 'dragging';
        nodeId: string;
        offsetX: number;
        offsetY: number;
        currentX: number;
        currentY: number;
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

export type LastClick =
    | { kind: 'none' }
    | {
        kind: 'clicked';
        id: string;
        time: number;
    };

export interface InteractionState {
    selection: Selection;
    isPanelOpen: boolean;
    lastClick: LastClick;
    drag: DragMode;
    connect: ConnectMode;
    pan: PanMode;
    viewBox: ViewBox;
    zoom: number;
    activePointerId: number;
}

export type NodePositionLookup = (
    id: string,
) => {
    x: number;
    y: number;
    isDraggable: boolean;
} | null;

export type InteractionCallback = () => void;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const DBLCLICK_MS = 400;
const MIN_DRAG_DISTANCE = 20;

export function buildInteractionState(
    viewBoxW: number,
    viewBoxH: number,
): InteractionState {
    return {
        selection: { kind: 'none' },
        isPanelOpen: false,
        lastClick: { kind: 'none' },
        drag: { kind: 'idle' },
        connect: { kind: 'idle' },
        pan: { kind: 'idle' },
        viewBox: {
            x: -viewBoxW / 2,
            y: -viewBoxH / 2,
            w: viewBoxW,
            h: viewBoxH,
        },
        zoom: 1.0,
        activePointerId: 0,
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

function handlePointerDown(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    getNodePosition: NodePositionLookup,
): void {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const svgPt = screenToSvg(
        svg, e.clientX, e.clientY,
    );

    const nodeId = ancestorAttr(
        target, 'data-node-id',
    );
    if (nodeId) {
        const now = Date.now();
        const isDbl =
            state.lastClick.kind
                === 'clicked'
            && nodeId
                === state.lastClick.id
            && now - state.lastClick.time
                < DBLCLICK_MS;
        state.selection = {
            kind: 'node', nodeId,
        };
        state.lastClick = {
            kind: 'clicked',
            id: nodeId,
            time: now,
        };
        state.isPanelOpen = isDbl;
        const pos =
            getNodePosition(nodeId);
        if (!pos) {
            onUpdate();
            return;
        }
        const isPort = ancestorAttr(
            target, 'data-connect-port',
        ) !== null;
        if (isPort || !pos.isDraggable) {
            state.connect = {
                kind: 'connecting',
                fromNodeId: nodeId,
                toX: svgPt.x,
                toY: svgPt.y,
                isShift: e.shiftKey,
                target: { kind: 'none' },
            };
            state.activePointerId =
                e.pointerId;
            svg.setPointerCapture(
                e.pointerId,
            );
            onUpdate();
            return;
        }
        state.drag = {
            kind: 'dragging',
            nodeId,
            currentX: pos.x,
            currentY: pos.y,
            offsetX: svgPt.x - pos.x,
            offsetY: svgPt.y - pos.y,
        };
        state.activePointerId =
            e.pointerId;
        svg.setPointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    const edgeId = ancestorAttr(
        target, 'data-edge-id',
    );
    if (edgeId) {
        const now = Date.now();
        const isDbl =
            state.lastClick.kind
                === 'clicked'
            && edgeId
                === state.lastClick.id
            && now - state.lastClick.time
                < DBLCLICK_MS;
        state.selection = {
            kind: 'edge', edgeId,
        };
        state.lastClick = {
            kind: 'clicked',
            id: edgeId,
            time: now,
        };
        state.isPanelOpen = isDbl;
        onUpdate();
        return;
    }

    state.selection = { kind: 'none' };
    state.isPanelOpen = false;
    state.lastClick = { kind: 'none' };
    state.pan = {
        kind: 'panning',
        startX: e.clientX,
        startY: e.clientY,
    };
    state.activePointerId = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    onUpdate();
}

function handlePointerMove(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
): void {
    if (state.drag.kind === 'dragging') {
        const svgPt = screenToSvg(
            svg, e.clientX, e.clientY,
        );
        state.drag = {
            ...state.drag,
            currentX:
                svgPt.x
                - state.drag.offsetX,
            currentY:
                svgPt.y
                - state.drag.offsetY,
        };
        onUpdate();
        return;
    }

    if (
        state.connect.kind
            === 'connecting'
    ) {
        const svgPt = screenToSvg(
            svg, e.clientX, e.clientY,
        );
        let target: ConnectTarget =
            { kind: 'none' };
        const hit =
            document.elementFromPoint(
                e.clientX, e.clientY,
            );
        if (hit instanceof Element) {
            const nid = ancestorAttr(
                hit, 'data-node-id',
            );
            if (
                nid
                && nid
                    !== state.connect
                        .fromNodeId
            ) {
                target = {
                    kind: 'node',
                    id: nid,
                };
            }
        }
        state.connect = {
            ...state.connect,
            toX: svgPt.x,
            toY: svgPt.y,
            isShift: e.shiftKey,
            target,
        };
        onUpdate();
        return;
    }

    if (state.pan.kind === 'panning') {
        const dx =
            e.clientX
            - state.pan.startX;
        const dy =
            e.clientY
            - state.pan.startY;
        const rect =
            svg.getBoundingClientRect();
        const scaleX =
            state.viewBox.w / rect.width;
        const scaleY =
            state.viewBox.h
            / rect.height;
        state.viewBox.x -= dx * scaleX;
        state.viewBox.y -= dy * scaleY;
        state.pan = {
            kind: 'panning',
            startX: e.clientX,
            startY: e.clientY,
        };
        onUpdate();
    }
}

function handlePointerUp(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    onNodeDragEnd: (
        nodeId: string,
        x: number,
        y: number,
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
): void {
    if (state.drag.kind === 'dragging') {
        onNodeDragEnd(
            state.drag.nodeId,
            state.drag.currentX,
            state.drag.currentY,
        );
        state.drag = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (
        state.connect.kind
            === 'connecting'
    ) {
        const fromId =
            state.connect.fromNodeId;
        const toX = state.connect.toX;
        const toY = state.connect.toY;
        if (e.shiftKey) {
            const target =
                document.elementFromPoint(
                    e.clientX, e.clientY,
                );
            if (
                target instanceof Element
            ) {
                const toNodeId =
                    ancestorAttr(
                        target,
                        'data-node-id',
                    );
                if (
                    toNodeId
                    && toNodeId !== fromId
                ) {
                    onEdgeCreated(
                        fromId, toNodeId,
                    );
                }
            }
        } else {
            const pos =
                getNodePosition(fromId);
            if (pos) {
                const portX =
                    pos.x + NODE_WIDTH;
                const portY =
                    pos.y
                    + NODE_HEIGHT / 2;
                const dx = toX - portX;
                const dy = toY - portY;
                const dist = Math.hypot(
                    dx, dy,
                );
                const dropHit =
                    document
                        .elementFromPoint(
                            e.clientX,
                            e.clientY,
                        );
                const overNode =
                    dropHit
                        instanceof Element
                    && ancestorAttr(
                        dropHit,
                        'data-node-id',
                    ) !== null;
                if (
                    dist > MIN_DRAG_DISTANCE
                    && !overNode
                ) {
                    onNodeCreated(
                        fromId, toX, toY,
                    );
                }
            }
        }
        state.connect = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (state.pan.kind === 'panning') {
        state.pan = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
    }
}

function handleWheel(
    e: WheelEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
): void {
    e.preventDefault();

    const svgPt = screenToSvg(
        svg, e.clientX, e.clientY,
    );

    const prevZoom = state.zoom;
    const delta = e.deltaY > 0
        ? -ZOOM_STEP
        : ZOOM_STEP;
    state.zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, prevZoom + delta),
    );

    const ratio = prevZoom / state.zoom;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    state.viewBox.x =
        svgPt.x
        - (svgPt.x - state.viewBox.x) * ratio;
    state.viewBox.y =
        svgPt.y
        - (svgPt.y - state.viewBox.y) * ratio;

    onUpdate();
}

export function bindInteractions(
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    onNodeDragEnd: (
        nodeId: string,
        x: number,
        y: number,
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
    signal: AbortSignal,
): void {
    svg.addEventListener(
        'pointerdown',
        (e) => handlePointerDown(
            e, svg, state, onUpdate,
            getNodePosition,
        ),
        { signal },
    );

    svg.addEventListener(
        'pointermove',
        (e) => handlePointerMove(
            e, svg, state, onUpdate,
        ),
        { signal },
    );

    svg.addEventListener(
        'pointerup',
        (e) => handlePointerUp(
            e, svg, state, onUpdate,
            onNodeDragEnd,
            onEdgeCreated,
            onNodeCreated,
            getNodePosition,
        ),
        { signal },
    );

    svg.addEventListener(
        'wheel',
        (e) => handleWheel(
            e, svg, state, onUpdate,
        ),
        { passive: false, signal },
    );

    const handleShift = (
        ke: KeyboardEvent,
    ): void => {
        if (ke.key !== 'Shift') return;
        if (
            state.connect.kind
                !== 'connecting'
        ) return;
        state.connect = {
            ...state.connect,
            isShift: ke.shiftKey,
        };
        onUpdate();
    };
    window.addEventListener(
        'keydown', handleShift,
        { signal },
    );
    window.addEventListener(
        'keyup', handleShift,
        { signal },
    );
}

export function zoomIn(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): void {
    const prevZoom = state.zoom;
    state.zoom = Math.min(
        MAX_ZOOM, prevZoom + ZOOM_STEP,
    );
    const ratio = prevZoom / state.zoom;
    const cx = focalPt?.x
        ?? state.viewBox.x
            + state.viewBox.w / 2;
    const cy = focalPt?.y
        ?? state.viewBox.y
            + state.viewBox.h / 2;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    state.viewBox.x =
        cx - (cx - state.viewBox.x) * ratio;
    state.viewBox.y =
        cy - (cy - state.viewBox.y) * ratio;
}

export function zoomOut(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): void {
    const prevZoom = state.zoom;
    state.zoom = Math.max(
        MIN_ZOOM, prevZoom - ZOOM_STEP,
    );
    const ratio = prevZoom / state.zoom;
    const cx = focalPt?.x
        ?? state.viewBox.x
            + state.viewBox.w / 2;
    const cy = focalPt?.y
        ?? state.viewBox.y
            + state.viewBox.h / 2;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    state.viewBox.x =
        cx - (cx - state.viewBox.x) * ratio;
    state.viewBox.y =
        cy - (cy - state.viewBox.y) * ratio;
}

export function zoomToFit(
    state: InteractionState,
    nodePositions: {
        x: number;
        y: number;
    }[],
    canvasW: number,
    canvasH: number,
): void {
    if (nodePositions.length === 0) return;

    const PAD = 70;

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
        maxX - minX + PAD * 2;
    const contentH =
        maxY - minY + PAD * 2;
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

    state.zoom = canvasW / vbW;
    if (state.zoom > MAX_ZOOM) {
        state.zoom = MAX_ZOOM;
        vbW = canvasW / MAX_ZOOM;
        vbH = canvasH / MAX_ZOOM;
    }
    state.viewBox.x = cx - vbW / 2;
    state.viewBox.y = cy - vbH / 2;
    state.viewBox.w = vbW;
    state.viewBox.h = vbH;
}
