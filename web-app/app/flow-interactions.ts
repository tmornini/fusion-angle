import {
    NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout';
import { showToast } from './toast';

const AUTOFIT_TOAST_MSG =
    'Disable Auto-Fit to change the view';
const WHEEL_TOAST_COOLDOWN_MS = 2000;
let lastWheelToastAt = 0;

function toastAutoFitWheel(): void {
    const now = Date.now();
    if (
        now - lastWheelToastAt
        < WHEEL_TOAST_COOLDOWN_MS
    ) return;
    lastWheelToastAt = now;
    showToast(AUTOFIT_TOAST_MSG, 'error');
}

export interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

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
    isPanelOpen: boolean;
    lastClick: LastClick;
    drag: DragMode;
    connect: ConnectMode;
    pan: PanMode;
    marquee: MarqueeMode;
    viewBox: ViewBox;
    zoom: number;
    activePointerId: number;
    isSpaceDown: boolean;
}

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
        marquee: { kind: 'idle' },
        viewBox: {
            x: -viewBoxW / 2,
            y: -viewBoxH / 2,
            w: viewBoxW,
            h: viewBoxH,
        },
        zoom: 1.0,
        activePointerId: 0,
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

function handlePointerDown(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    getNodePosition: NodePositionLookup,
    isLocked: () => boolean,
): void {
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (state.isSpaceDown) {
        state.pan = {
            kind: 'panning',
            startX: e.clientX,
            startY: e.clientY,
        };
        state.activePointerId =
            e.pointerId;
        svg.setPointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

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
        state.lastClick = {
            kind: 'clicked',
            id: nodeId,
            time: now,
        };
        const isPort = ancestorAttr(
            target, 'data-connect-port',
        ) !== null;
        const pos =
            getNodePosition(nodeId);
        if (isPort || !pos.isDraggable) {
            state.selection = {
                kind: 'nodes',
                nodeIds: new Set([nodeId]),
            };
            state.isPanelOpen = isDbl;
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
        applyNodeClickSelection(
            state, nodeId, e,
        );
        state.isPanelOpen = isDbl;
        if (isLocked()) {
            onUpdate();
            return;
        }
        const sel = state.selection;
        const ids =
            sel.kind === 'nodes'
                ? sel.nodeIds
                : new Set<string>();
        const initialPositions =
            new Map<
                string,
                { x: number; y: number }
            >();
        for (const id of ids) {
            const p = getNodePosition(id);
            initialPositions.set(
                id, { x: p.x, y: p.y },
            );
        }
        state.drag = {
            kind: 'dragging',
            anchorNodeId: nodeId,
            startPointerX: svgPt.x,
            startPointerY: svgPt.y,
            currentPointerX: svgPt.x,
            currentPointerY: svgPt.y,
            initialPositions,
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

    state.lastClick = { kind: 'none' };
    startBackgroundDrag(e, svg, state);
    onUpdate();
}

function startBackgroundDrag(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
): void {
    state.isPanelOpen = false;
    const svgPt = screenToSvg(
        svg, e.clientX, e.clientY,
    );
    state.selection = { kind: 'none' };
    state.marquee = {
        kind: 'selecting',
        startX: svgPt.x,
        startY: svgPt.y,
        currentX: svgPt.x,
        currentY: svgPt.y,
    };
    state.activePointerId = e.pointerId;
    svg.setPointerCapture(e.pointerId);
}

function applyNodeClickSelection(
    state: InteractionState,
    nodeId: string,
    e: PointerEvent,
): void {
    const sel = state.selection;
    const current =
        sel.kind === 'nodes'
            ? sel.nodeIds
            : new Set<string>();
    if (e.shiftKey) {
        const next = new Set(current);
        next.add(nodeId);
        state.selection = {
            kind: 'nodes', nodeIds: next,
        };
        return;
    }
    if (e.metaKey || e.ctrlKey) {
        const next = new Set(current);
        if (next.has(nodeId)) {
            next.delete(nodeId);
        } else {
            next.add(nodeId);
        }
        state.selection = next.size === 0
            ? { kind: 'none' }
            : {
                kind: 'nodes',
                nodeIds: next,
            };
        return;
    }
    if (current.has(nodeId)) {
        return;
    }
    state.selection = {
        kind: 'nodes',
        nodeIds: new Set([nodeId]),
    };
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
            currentPointerX: svgPt.x,
            currentPointerY: svgPt.y,
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
        return;
    }

    if (
        state.marquee.kind === 'selecting'
    ) {
        const svgPt = screenToSvg(
            svg, e.clientX, e.clientY,
        );
        state.marquee = {
            ...state.marquee,
            currentX: svgPt.x,
            currentY: svgPt.y,
        };
        onUpdate();
    }
}

function handlePointerUp(
    e: PointerEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
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
): void {
    if (state.pan.kind === 'panning') {
        state.pan = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (state.drag.kind === 'dragging') {
        const dx =
            state.drag.currentPointerX
            - state.drag.startPointerX;
        const dy =
            state.drag.currentPointerY
            - state.drag.startPointerY;
        const updates: Array<{
            nodeId: string;
            x: number;
            y: number;
        }> = [];
        for (const [
            id, init,
        ] of state.drag.initialPositions) {
            updates.push({
                nodeId: id,
                x: init.x + dx,
                y: init.y + dy,
            });
        }
        onNodesDragEnd(updates);
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
        state.connect = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
        return;
    }

    if (
        state.marquee.kind === 'selecting'
    ) {
        const m = state.marquee;
        const minX = Math.min(
            m.startX, m.currentX,
        );
        const minY = Math.min(
            m.startY, m.currentY,
        );
        const maxX = Math.max(
            m.startX, m.currentX,
        );
        const maxY = Math.max(
            m.startY, m.currentY,
        );
        const hits = new Set<string>();
        for (const n of getAllNodes()) {
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
        state.selection = hits.size === 0
            ? { kind: 'none' }
            : {
                kind: 'nodes',
                nodeIds: hits,
            };
        state.marquee = { kind: 'idle' };
        state.activePointerId = 0;
        svg.releasePointerCapture(
            e.pointerId,
        );
        onUpdate();
    }
}

function handleWheel(
    e: WheelEvent,
    svg: SVGSVGElement,
    state: InteractionState,
    onUpdate: InteractionCallback,
    isAutoFit: () => boolean,
): void {
    e.preventDefault();
    if (isAutoFit()) {
        toastAutoFitWheel();
        return;
    }

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
    isAutoFit: () => boolean,
    isLocked: () => boolean,
    signal: AbortSignal,
): void {
    const cursorHost =
        svg.parentElement as HTMLElement;
    if (state.isSpaceDown) {
        cursorHost.classList.add(
            'wf-pan-cursor',
        );
    }

    svg.addEventListener(
        'pointerdown',
        (e) => handlePointerDown(
            e, svg, state, onUpdate,
            getNodePosition, isLocked,
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
            onNodesDragEnd,
            onEdgeCreated,
            onNodeCreated,
            getNodePosition,
            getAllNodes,
        ),
        { signal },
    );

    svg.addEventListener(
        'wheel',
        (e) => handleWheel(
            e, svg, state, onUpdate,
            isAutoFit,
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

    const isFormFocused = (): boolean => {
        const a = document.activeElement;
        if (!a) return false;
        const tag = a.tagName.toLowerCase();
        if (
            tag === 'input'
            || tag === 'textarea'
            || tag === 'select'
            || tag === 'button'
            || tag === 'a'
        ) return true;
        return (
            a as HTMLElement
        ).isContentEditable;
    };

    const handleSpace = (
        ke: KeyboardEvent,
    ): void => {
        if (ke.key !== ' ') return;
        if (isFormFocused()) return;
        ke.preventDefault();
        const next = ke.type === 'keydown';
        if (state.isSpaceDown === next) {
            return;
        }
        if (next && isAutoFit()) {
            showToast(
                AUTOFIT_TOAST_MSG, 'error',
            );
            return;
        }
        state.isSpaceDown = next;
        if (next) {
            cursorHost.classList.add(
                'wf-pan-cursor',
            );
        } else {
            cursorHost.classList.remove(
                'wf-pan-cursor',
            );
            if (
                state.pan.kind === 'panning'
            ) {
                state.pan = { kind: 'idle' };
            }
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
}

export function zoomIn(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): void {
    applyButtonZoom(
        state, ZOOM_STEP, focalPt,
    );
}

export function zoomOut(
    state: InteractionState,
    focalPt?: {
        x: number;
        y: number;
    } | null,
): void {
    applyButtonZoom(
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
): void {
    const prevCx = state.viewBox.x
        + state.viewBox.w / 2;
    const prevCy = state.viewBox.y
        + state.viewBox.h / 2;
    const prevZoom = state.zoom;
    state.zoom = Math.max(
        MIN_ZOOM,
        Math.min(
            MAX_ZOOM, prevZoom + delta,
        ),
    );
    const ratio = prevZoom / state.zoom;
    state.viewBox.w *= ratio;
    state.viewBox.h *= ratio;
    const cx = focalPt?.x ?? prevCx;
    const cy = focalPt?.y ?? prevCy;
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
