export interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface InteractionState {
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    isDragging: boolean;
    dragNodeId: string | null;
    dragOffsetX: number;
    dragOffsetY: number;
    dragCurrentX: number;
    dragCurrentY: number;
    isConnecting: boolean;
    connectFromNodeId: string | null;
    connectFromPort: string | null;
    connectToX: number;
    connectToY: number;
    isPanning: boolean;
    panStartX: number;
    panStartY: number;
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

export function createInteractionState(
    viewBoxW: number,
    viewBoxH: number,
): InteractionState {
    return {
        selectedNodeId: null,
        selectedEdgeId: null,
        isDragging: false,
        dragNodeId: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        dragCurrentX: 0,
        dragCurrentY: 0,
        isConnecting: false,
        connectFromNodeId: null,
        connectFromPort: null,
        connectToX: 0,
        connectToY: 0,
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
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

    const portAttr =
        target.getAttribute('data-port');
    if (portAttr !== null) {
        const nodeId = findAncestorAttr(
            target, 'data-node-id',
        );
        if (!nodeId) return;
        state.isConnecting = true;
        state.connectFromNodeId = nodeId;
        state.connectFromPort = portAttr;
        state.connectToX = svgPt.x;
        state.connectToY = svgPt.y;
        state.activePointerId = e.pointerId;
        svg.setPointerCapture(e.pointerId);
        onUpdate();
        return;
    }

    const nodeId = findAncestorAttr(
        target, 'data-node-id',
    );
    if (nodeId) {
        state.selectedNodeId = nodeId;
        state.selectedEdgeId = null;
        const pos = getNodePosition(nodeId);
        if (!pos || !pos.isDraggable) {
            onUpdate();
            return;
        }
        state.isDragging = true;
        state.dragNodeId = nodeId;
        state.dragCurrentX = pos.x;
        state.dragCurrentY = pos.y;
        state.dragOffsetX =
            svgPt.x - pos.x;
        state.dragOffsetY =
            svgPt.y - pos.y;
        state.activePointerId = e.pointerId;
        svg.setPointerCapture(e.pointerId);
        onUpdate();
        return;
    }

    const edgeId = findAncestorAttr(
        target, 'data-edge-id',
    );
    if (edgeId) {
        state.selectedEdgeId = edgeId;
        state.selectedNodeId = null;
        onUpdate();
        return;
    }

    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.isPanning = true;
    state.panStartX = e.clientX;
    state.panStartY = e.clientY;
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
    if (state.isDragging) {
        const svgPt = screenToSvg(
            svg, e.clientX, e.clientY,
        );
        state.dragCurrentX =
            svgPt.x - state.dragOffsetX;
        state.dragCurrentY =
            svgPt.y - state.dragOffsetY;
        onUpdate();
        return;
    }

    if (state.isConnecting) {
        const svgPt = screenToSvg(
            svg, e.clientX, e.clientY,
        );
        state.connectToX = svgPt.x;
        state.connectToY = svgPt.y;
        onUpdate();
        return;
    }

    if (state.isPanning) {
        const dx = e.clientX - state.panStartX;
        const dy = e.clientY - state.panStartY;
        const rect = svg.getBoundingClientRect();
        const scaleX =
            state.viewBox.w / rect.width;
        const scaleY =
            state.viewBox.h / rect.height;
        state.viewBox.x -= dx * scaleX;
        state.viewBox.y -= dy * scaleY;
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
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
    if (state.isDragging && state.dragNodeId) {
        onNodeDragEnd(
            state.dragNodeId,
            state.dragCurrentX,
            state.dragCurrentY,
        );
        state.isDragging = false;
        state.dragNodeId = null;
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (
        state.isConnecting
        && state.connectFromNodeId
    ) {
        const target = e.target;
        if (target instanceof Element) {
            const portAttr = target
                .getAttribute('data-port');
            if (portAttr !== null) {
                const toNodeId =
                    findAncestorAttr(
                        target,
                        'data-node-id',
                    );
                if (
                    toNodeId
                    && toNodeId
                        !== state
                            .connectFromNodeId
                ) {
                    onEdgeCreated(
                        state
                            .connectFromNodeId,
                        toNodeId,
                    );
                }
            }
        }
        state.isConnecting = false;
        state.connectFromNodeId = null;
        state.connectFromPort = null;
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (state.isPanning) {
        state.isPanning = false;
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
): void {
    if (nodePositions.length === 0) return;

    const PAD = 80;
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

    state.viewBox.x = minX - PAD;
    state.viewBox.y = minY - PAD;
    state.viewBox.w =
        maxX - minX + PAD * 2;
    state.viewBox.h =
        maxY - minY + PAD * 2;
    state.zoom = 1.0;
}
