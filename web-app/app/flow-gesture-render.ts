// Narrow DOM mutation for in-flight canvas gestures.
//
// While a drag, pan, marquee, or connect gesture is in
// flight, the flow detail page routes FSM updates here —
// one call per animation frame — instead of rebuilding
// the canvas. Only the attributes the gesture changes are
// touched: node transforms, affected edge paths and
// labels, the marquee rect, the viewBox, the connect
// preview layer. The full innerHTML rebuild
// (FlowDesignerPresenter.renderUpdate) remains the single
// truth at gesture boundaries: pointer-down paints the
// gesture's first state, pointer-up rebuilds from the
// committed snapshot. Geometry comes from the same pure
// functions the full rebuild uses (computeEdgeGeometry,
// buildConnectPreview, marqueeDrawRect), so a mid-gesture
// frame can never drift from its rebuilt form.

import type {
    GraphNode, GraphEdge,
} from './adapters/flows.ts';
import type {
    InteractionState,
    ViewBox,
    DragMode,
    ConnectMode,
} from './flow-interactions.ts';
import {
    marqueeDrawRect,
} from './flow-interactions.ts';
import {
    computeEdgeGeometry,
    computeEdgeAimOffsets,
    computeEdgeLabelWidth,
    buildConnectPreview,
    LABEL_HEIGHT,
    LABEL_TEXT_OFFSET_Y,
} from './flow-graph.ts';
import {
    applyDragPreview,
} from './flow-designer-actions.ts';
import {
    setHtml, trusted,
} from './safe-html.ts';

// The graph data a gesture cannot change: node and edge
// sets are only mutated by commits, which end gestures.
export interface GestureGraph {
    nodes: readonly GraphNode[];
    edges: readonly GraphEdge[];
    edgeWaypoints: ReadonlyMap<
        string,
        readonly { x: number; y: number }[]
    >;
}

// The canvas markup these mutations target was built by
// buildGraphSvg in the gesture-start rebuild; a missing
// element is a structural bug, not a recoverable state.
function mustFind(
    svg: SVGSVGElement,
    selector: string,
): Element {
    const el = svg.querySelector(selector);
    if (!el) {
        throw new Error(
            'gesture frame target missing: '
            + selector,
        );
    }
    return el;
}

function elementsByAttr(
    svg: SVGSVGElement,
    attrName: string,
): Map<string, Element> {
    const byId = new Map<string, Element>();
    const els = svg.querySelectorAll(
        '[' + attrName + ']',
    );
    for (const el of els) {
        const id = el.getAttribute(attrName);
        if (id !== null) byId.set(id, el);
    }
    return byId;
}

// The viewBox and the two grid rects sized to it. Pan
// frames are this sync alone; other gestures hit it only
// when a mid-gesture wheel zoom moved the viewBox.
function syncViewport(
    svg: SVGSVGElement,
    vb: ViewBox,
): void {
    const next = String(vb.x)
        + ' ' + String(vb.y)
        + ' ' + String(vb.w)
        + ' ' + String(vb.h);
    if (
        svg.getAttribute('viewBox') === next
    ) return;
    svg.setAttribute('viewBox', next);
    const rects = [
        mustFind(svg, '.flow-grid-bg'),
        mustFind(svg, '.flow-grid-dots'),
    ];
    for (const rect of rects) {
        rect.setAttribute('x', String(vb.x));
        rect.setAttribute('y', String(vb.y));
        rect.setAttribute(
            'width', String(vb.w),
        );
        rect.setAttribute(
            'height', String(vb.h),
        );
    }
}

function renderDragFrame(
    svg: SVGSVGElement,
    drag: Extract<
        DragMode, { kind: 'dragging' }
    >,
    graph: GestureGraph,
): void {
    const preview = applyDragPreview(
        graph.nodes, drag,
    );
    const byId = new Map(
        preview.map(n => [n.id, n]),
    );
    const nodeEls = elementsByAttr(
        svg, 'data-node-id',
    );
    for (
        const id of
        drag.initialPositions.keys()
    ) {
        const n = byId.get(id);
        const el = nodeEls.get(id);
        if (!n || !el) continue;
        el.setAttribute(
            'transform',
            'translate('
            + String(n.positionX)
            + ', '
            + String(n.positionY)
            + ')',
        );
    }
    const aimOffsets =
        computeEdgeAimOffsets(graph.edges);
    const edgeEls = elementsByAttr(
        svg, 'data-edge-ref',
    );
    for (const edge of graph.edges) {
        const touched =
            drag.initialPositions.has(
                edge.fromNodeId,
            )
            || drag.initialPositions.has(
                edge.toNodeId,
            );
        if (!touched) continue;
        const from = byId.get(edge.fromNodeId);
        const to = byId.get(edge.toNodeId);
        const el = edgeEls.get(edge.id);
        if (!from || !to || !el) continue;
        const geo = computeEdgeGeometry(
            from, to,
            aimOffsets.get(edge.id)!,
            graph.edgeWaypoints.get(edge.id)
                ?? [],
        );
        const paths =
            el.querySelectorAll('path');
        for (const p of paths) {
            p.setAttribute('d', geo.pathD);
        }
        const labelW = computeEdgeLabelWidth(
            edge.name,
        );
        const bg = el.querySelector('rect');
        if (bg) {
            bg.setAttribute(
                'x',
                String(
                    geo.labelX - labelW / 2,
                ),
            );
            bg.setAttribute(
                'y',
                String(
                    geo.labelY
                    - LABEL_HEIGHT / 2,
                ),
            );
        }
        const text = el.querySelector('text');
        if (text) {
            text.setAttribute(
                'x', String(geo.labelX),
            );
            text.setAttribute(
                'y',
                String(
                    geo.labelY
                    + LABEL_TEXT_OFFSET_Y,
                ),
            );
        }
    }
}

function renderConnectFrame(
    svg: SVGSVGElement,
    connect: Extract<
        ConnectMode, { kind: 'connecting' }
    >,
    graph: GestureGraph,
): void {
    const layer = mustFind(
        svg, '.flow-connect-preview',
    );
    // Geometry numerals and literals only — the same
    // trusted string the full rebuild embeds.
    setHtml(layer, trusted(
        buildConnectPreview(
            connect, graph.nodes, graph.edges,
        ),
    ));
}

function renderMarqueeFrame(
    svg: SVGSVGElement,
    state: InteractionState,
): void {
    const rect = marqueeDrawRect(
        state.marquee,
    );
    if (!rect) return;
    const el = mustFind(svg, '.flow-marquee');
    el.setAttribute('x', String(rect.x));
    el.setAttribute('y', String(rect.y));
    el.setAttribute(
        'width', String(rect.w),
    );
    el.setAttribute(
        'height', String(rect.h),
    );
}

export function renderGestureFrame(
    svg: SVGSVGElement,
    state: InteractionState,
    graph: GestureGraph,
): void {
    syncViewport(svg, state.viewBox);
    if (state.drag.kind === 'dragging') {
        renderDragFrame(
            svg, state.drag, graph,
        );
    }
    if (
        state.connect.kind === 'connecting'
    ) {
        renderConnectFrame(
            svg, state.connect, graph,
        );
    }
    renderMarqueeFrame(svg, state);
    // pan: the viewport sync above is the
    // whole frame
}
