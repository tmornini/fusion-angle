import type { GraphNode, GraphEdge } from '../../api/types.ts';
import {
    computeLayout, NODE_WIDTH, NODE_HEIGHT,
} from './flow-layout.ts';
import type { LayoutInput, LayoutResult } from './flow-layout.ts';
import { computeEdgeLabelWidth } from './flow-graph.ts';
import type { FlowGraph } from './adapters/flow-queries.ts';

// The minimal edge shape a layout needs: who connects to whom,
// and the label whose width reserves horizontal room.
type LayoutEdgeInput = {
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly name: string;
};

// Lay out a graph from layout-shaped node inputs. Edges out of
// the start node get a zero label width — the renderer never
// labels them, so they must not push siblings apart. With no
// canvas, computeLayout returns the natural (un-stretched,
// un-rotated) layout; an SVG viewBox fits it to its canvas.
export function runLayoutFromInputs(
    inputs: readonly LayoutInput[],
    edges: readonly LayoutEdgeInput[],
    canvas?: { w: number; h: number },
): LayoutResult {
    const startId = inputs.find(i => i.isStart)?.id;
    return computeLayout({
        nodes: inputs,
        edges: edges.map(e => ({
            fromId: e.fromNodeId,
            toId: e.toNodeId,
            labelWidth: e.fromNodeId === startId
                ? 0
                : computeEdgeLabelWidth(e.name),
        })),
        canvasWidth: canvas?.w ?? 0,
        canvasHeight: canvas?.h ?? 0,
    });
}

// Lay out a graph from its persisted nodes/edges. computeLayout
// reads only id / isStart / isComplete and the edges — the
// stored positions are ignored — so re-laying-out an already-
// laid-out graph is harmless.
export function runFlowLayout(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
    canvas?: { w: number; h: number },
): LayoutResult {
    return runLayoutFromInputs(
        nodes.map(n => ({
            id: n.id,
            isStart: n.isStart,
            isComplete: n.isComplete,
        })),
        edges,
        canvas,
    );
}

// True when 2+ nodes are packed within a single node-rect's
// worth of space: they overlap, and the canvas-fit blows one
// node up to fill the viewport. A laid-out graph keeps nodes
// at least a layer-step apart in one axis, so it never trips
// this. An empty or single-node graph has nothing to pile up
// — and must not be relaid out, lest a hand-placed lone node
// snap back to the origin.
export function areNodePositionsDegenerate(
    nodes: readonly GraphNode[],
): boolean {
    if (nodes.length < 2) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
        if (n.positionX < minX) minX = n.positionX;
        if (n.positionX > maxX) maxX = n.positionX;
        if (n.positionY < minY) minY = n.positionY;
        if (n.positionY > maxY) maxY = n.positionY;
    }
    return (maxX - minX) <= NODE_WIDTH
        && (maxY - minY) <= NODE_HEIGHT;
}

// Resolve a graph's node positions for rendering. An
// auto-layout flow's stored positions are placeholders, and a
// degenerate stored layout is unusable — in either case
// compute fresh positions so the designer and the read-only
// stats page start from the same sane layout. A non-auto
// flow with real stored positions passes through untouched.
// A read path never crashes on bad stored data, so a
// startless graph (which computeLayout rejects) is returned
// as-is rather than thrown on.
export function withRenderableLayout(
    graph: FlowGraph,
): FlowGraph {
    if (graph.nodes.length === 0) return graph;
    if (
        !graph.isAutoLayout
        && !areNodePositionsDegenerate(graph.nodes)
    ) {
        return graph;
    }
    if (!graph.nodes.some(n => n.isStart)) return graph;
    const { positions } = runFlowLayout(
        graph.nodes, graph.edges,
    );
    return {
        ...graph,
        nodes: graph.nodes.map(n => {
            const p = positions.get(n.id);
            return p
                ? { ...n, positionX: p.x, positionY: p.y }
                : n;
        }),
    };
}
