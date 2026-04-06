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

export type ConnectMode =
    | { kind: 'idle' }
    | {
        kind: 'connecting';
        fromNodeId: string;
        toX: number;
        toY: number;
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

export function createInteractionState(
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

function findAncestorAttr(
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

    const nodeId = findAncestorAttr(
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
        const isPort = findAncestorAttr(
            target, 'data-connect-port',
        ) !== null;
        if (isPort || !pos.isDraggable) {
            state.connect = {
                kind: 'connecting',
                fromNodeId: nodeId,
                toX: svgPt.x,
                toY: svgPt.y,
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

    const edgeId = findAncestorAttr(
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
        state.connect = {
            ...state.connect,
            toX: svgPt.x,
            toY: svgPt.y,
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
        const target =
            document.elementFromPoint(
                e.clientX, e.clientY,
            );
        if (target instanceof Element) {
            const toNodeId =
                findAncestorAttr(
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
    getNodePosition: NodePositionLookup,
): void {
    svg.addEventListener(
        'pointerdown',
        (e) => handlePointerDown(
            e, svg, state, onUpdate,
            getNodePosition,
        ),
    );

    svg.addEventListener(
        'pointermove',
        (e) => handlePointerMove(
            e, svg, state, onUpdate,
        ),
    );

    svg.addEventListener(
        'pointerup',
        (e) => handlePointerUp(
            e, svg, state, onUpdate,
            onNodeDragEnd, onEdgeCreated,
        ),
    );

    svg.addEventListener(
        'wheel',
        (e) => handleWheel(
            e, svg, state, onUpdate,
        ),
        { passive: false },
    );
}

export function zoomIn(
    state: InteractionState,
): void {
    const prevZoom = state.zoom;
    state.zoom = Math.min(
        MAX_ZOOM, prevZoom + ZOOM_STEP,
    );
    const ratio = prevZoom / state.zoom;
    const cx =
        state.viewBox.x + state.viewBox.w / 2;
    const cy =
        state.viewBox.y + state.viewBox.h / 2;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    state.viewBox.x =
        cx - state.viewBox.w / 2;
    state.viewBox.y =
        cy - state.viewBox.h / 2;
}

export function zoomOut(
    state: InteractionState,
): void {
    const prevZoom = state.zoom;
    state.zoom = Math.max(
        MIN_ZOOM, prevZoom - ZOOM_STEP,
    );
    const ratio = prevZoom / state.zoom;
    const cx =
        state.viewBox.x + state.viewBox.w / 2;
    const cy =
        state.viewBox.y + state.viewBox.h / 2;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    state.viewBox.x =
        cx - state.viewBox.w / 2;
    state.viewBox.y =
        cy - state.viewBox.h / 2;
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

    const PAD = 40;
    const NODE_W = 140;
    const NODE_H = 56;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pos of nodePositions) {
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + NODE_W > maxX) {
            maxX = pos.x + NODE_W;
        }
        if (pos.y + NODE_H > maxY) {
            maxY = pos.y + NODE_H;
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

    state.viewBox.x = cx - vbW / 2;
    state.viewBox.y = cy - vbH / 2;
    state.viewBox.w = vbW;
    state.viewBox.h = vbH;
    state.zoom = canvasW / vbW;
}
