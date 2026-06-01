import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    RecordAttributeId,
} from '../../api/types.ts';
import {
    DEFAULT_NODE_ATTRIBUTES,
    DEFAULT_NODE_WORKER_IDS,
} from '../../api/types.ts';
import {
    edgeWaypointKey,
    NODE_WIDTH,
    NODE_HEIGHT,
} from './flow-layout.ts';
import { runFlowLayout } from './flow-graph-layout.ts';
import type {
    ViewBox,
    DragMode,
} from './flow-interactions.ts';

export type Waypoint = {
    readonly x: number;
    readonly y: number;
};

export interface NodeMove {
    readonly nodeId: string;
    readonly x: number;
    readonly y: number;
}

export function applyMoveNodes(
    nodes: readonly GraphNode[],
    updates: readonly NodeMove[],
): GraphNode[] {
    const updateMap = new Map(
        updates.map(
            update => [update.nodeId, update],
        ),
    );
    return nodes.map(node => {
        const update = updateMap.get(node.id);
        if (!update) return node;
        return {
            ...node,
            positionX: update.x,
            positionY: update.y,
        };
    });
}

export function applyDragPreview(
    nodes: readonly GraphNode[],
    drag: DragMode,
): GraphNode[] {
    if (drag.kind !== 'dragging') {
        return [...nodes];
    }
    const dx =
        drag.currentPointerX
        - drag.startPointerX;
    const dy =
        drag.currentPointerY
        - drag.startPointerY;
    return nodes.map(n => {
        const init =
            drag.initialPositions.get(n.id);
        if (!init) return n;
        return {
            ...n,
            positionX: init.x + dx,
            positionY: init.y + dy,
        };
    });
}

export interface LockToggleResult {
    readonly isLocked: boolean;
    readonly isEditingName: boolean;
}

export function applyToggleLock(
    isLocked: boolean,
    isEditingName: boolean,
): LockToggleResult {
    const next = !isLocked;
    return {
        isLocked: next,
        isEditingName:
            next ? false : isEditingName,
    };
}

export interface FlowNameUpdateResult {
    readonly flowName: string;
    readonly isEditingName: boolean;
}

export function applyUpdateFlowName(
    name: string,
): FlowNameUpdateResult {
    return {
        flowName: name.trim(),
        isEditingName: false,
    };
}

export function applyAddNode(
    nodes: readonly GraphNode[],
    nodeId: string,
    name: string,
    positionX: number,
    positionY: number,
): GraphNode[] {
    return [
        ...nodes,
        {
            id: nodeId,
            name,
            positionX,
            positionY,
            isCreate: false,
            isArchive: false,
            workerIds: [
                ...DEFAULT_NODE_WORKER_IDS,
            ],
            attributes: [
                ...DEFAULT_NODE_ATTRIBUTES,
            ],
        },
    ];
}

export function applyAddEdge(
    edges: readonly GraphEdge[],
    edgeId: string,
    name: string,
    fromNodeId: string,
    toNodeId: string,
): GraphEdge[] {
    return [
        ...edges,
        {
            id: edgeId,
            name,
            fromNodeId,
            toNodeId,
        },
    ];
}

export interface DeleteNodesResult {
    readonly nodes: GraphNode[];
    readonly edges: GraphEdge[];
}

function edgeSurvivesNodeDeletion(
    edge: GraphEdge,
    deletedNodeIds: ReadonlySet<string>,
): boolean {
    return !deletedNodeIds.has(edge.fromNodeId)
        && !deletedNodeIds.has(edge.toNodeId);
}

export function applyDeleteNodes(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
    nodeIds: ReadonlySet<string>,
): DeleteNodesResult {
    return {
        nodes: nodes.filter(
            n => !nodeIds.has(n.id),
        ),
        edges: edges.filter(
            e => edgeSurvivesNodeDeletion(e, nodeIds),
        ),
    };
}

export function applyDeleteEdge(
    edges: readonly GraphEdge[],
    edgeId: string,
): GraphEdge[] {
    return edges.filter(
        e => e.id !== edgeId,
    );
}

export function applyUpdateNode(
    nodes: readonly GraphNode[],
    nodeId: string,
    patch: Partial<GraphNode>,
): GraphNode[] {
    return nodes.map(
        n => n.id === nodeId
            ? { ...n, ...patch }
            : n,
    );
}

export function applyUpdateEdge(
    edges: readonly GraphEdge[],
    edgeId: string,
    patch: Partial<GraphEdge>,
): GraphEdge[] {
    return edges.map(
        e => e.id === edgeId
            ? { ...e, ...patch }
            : e,
    );
}

export function applyAddAttributeRef(
    nodes: readonly GraphNode[],
    nodeId: string,
    ref: NodeAttribute,
): GraphNode[] {
    return nodes.map(
        n => n.id === nodeId
            ? {
                ...n,
                attributes: [
                    ...n.attributes, ref,
                ],
            }
            : n,
    );
}

export function applyRemoveAttributeRef(
    nodes: readonly GraphNode[],
    nodeId: string,
    attributeId: RecordAttributeId,
): GraphNode[] {
    return nodes.map(
        n => n.id === nodeId
            ? {
                ...n,
                attributes:
                    n.attributes.filter(
                        a => a.attribute_id
                            !== attributeId,
                    ),
            }
            : n,
    );
}

export function applyUpdateAttributeMode(
    nodes: readonly GraphNode[],
    nodeId: string,
    attributeId: RecordAttributeId,
    mode: 'editable' | 'readonly',
): GraphNode[] {
    return nodes.map(
        n => n.id === nodeId
            ? {
                ...n,
                attributes: n.attributes.map(
                    a => a.attribute_id
                        === attributeId
                        ? { ...a, mode }
                        : a,
                ),
            }
            : n,
    );
}

export function applyUpdateAttributeRequired(
    nodes: readonly GraphNode[],
    nodeId: string,
    attributeId: RecordAttributeId,
    isRequired: boolean,
): GraphNode[] {
    return nodes.map(
        n => n.id === nodeId
            ? {
                ...n,
                attributes: n.attributes.map(
                    a => a.attribute_id
                        === attributeId
                        ? { ...a, isRequired }
                        : a,
                ),
            }
            : n,
    );
}

export interface AutoLayoutResult {
    readonly nodes: GraphNode[];
    readonly edgeWaypoints:
        Map<string, Waypoint[]>;
}

function hasWaypoints(
    wp: Waypoint[] | undefined,
): wp is Waypoint[] {
    return wp !== undefined && wp.length > 0;
}

export function applyAutoLayout(
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
    canvasW: number,
    canvasH: number,
    panelOpen: boolean,
    panelWidthPx: number,
): AutoLayoutResult {
    const effectiveW = panelOpen
        ? Math.max(0, canvasW - panelWidthPx)
        : canvasW;
    const result = runFlowLayout(
        nodes, edges, { w: effectiveW, h: canvasH },
    );
    const newNodes = nodes.map(n => {
        const pos = result.positions.get(n.id);
        if (!pos) {
            throw new Error(
                'invariant violated:'
                + ' computeLayout did not'
                + ' produce a position for'
                + ' node ' + n.id,
            );
        }
        return {
            ...n,
            positionX: pos.x,
            positionY: pos.y,
        };
    });
    const edgeWaypoints =
        new Map<string, Waypoint[]>();
    for (const e of edges) {
        const key = edgeWaypointKey(
            e.fromNodeId, e.toNodeId,
        );
        const wp = result.waypoints.get(key);
        if (hasWaypoints(wp)) {
            edgeWaypoints.set(e.id, wp);
        }
    }
    return { nodes: newNodes, edgeWaypoints };
}

export interface ViewBoxOrigin {
    readonly x: number;
    readonly y: number;
}

export function applyPanToRevealSelected(
    nodeId: string | null,
    edgeId: string | null,
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
    viewBox: ViewBox,
    canvasW: number,
    panelWidthPx: number,
): ViewBoxOrigin | null {
    const center = selectionCenter(
        nodeId, edgeId, nodes, edges,
    );
    if (!center) return null;
    const panelW_svg =
        panelWidthPx * viewBox.w / canvasW;
    return {
        x: center.x
            - (viewBox.w + panelW_svg) / 2,
        y: center.y - viewBox.h / 2,
    };
}

function selectionCenter(
    nodeId: string | null,
    edgeId: string | null,
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
): { x: number; y: number } | null {
    if (nodeId) {
        const n = nodes.find(
            nd => nd.id === nodeId,
        );
        if (!n) return null;
        return {
            x: n.positionX + NODE_WIDTH / 2,
            y: n.positionY + NODE_HEIGHT / 2,
        };
    }
    if (edgeId) {
        const e = edges.find(
            ed => ed.id === edgeId,
        );
        if (!e) return null;
        const fn = nodes.find(
            nd => nd.id === e.fromNodeId,
        );
        const tn = nodes.find(
            nd => nd.id === e.toNodeId,
        );
        if (!fn || !tn) return null;
        const fx = fn.positionX
            + NODE_WIDTH / 2;
        const fy = fn.positionY
            + NODE_HEIGHT / 2;
        const tx = tn.positionX
            + NODE_WIDTH / 2;
        const ty = tn.positionY
            + NODE_HEIGHT / 2;
        return {
            x: (fx + tx) / 2,
            y: (fy + ty) / 2,
        };
    }
    return null;
}

export type SavedViewBox =
    | { kind: 'none' }
    | {
        kind: 'saved';
        x: number;
        y: number;
        w: number;
        h: number;
    };

export interface PanelTransitionResult {
    readonly savedViewBox: SavedViewBox;
    readonly viewBox: ViewBox;
    readonly shouldPanToReveal: boolean;
}

type SavedViewBoxOpen =
    Extract<SavedViewBox, { kind: 'saved' }>;

function panelJustOpened(
    isPanelOpen: boolean,
    savedViewBox: SavedViewBox,
): boolean {
    return isPanelOpen && savedViewBox.kind !== 'saved';
}

function panelJustClosed(
    isPanelOpen: boolean,
    savedViewBox: SavedViewBox,
): savedViewBox is SavedViewBoxOpen {
    return !isPanelOpen && savedViewBox.kind === 'saved';
}

function panelStaysOpen(
    isPanelOpen: boolean,
    savedViewBox: SavedViewBox,
): boolean {
    return isPanelOpen && savedViewBox.kind === 'saved';
}

export function applyPanelTransition(
    isAutoFit: boolean,
    isPanelOpen: boolean,
    savedViewBox: SavedViewBox,
    viewBox: ViewBox,
): PanelTransitionResult | null {
    if (isAutoFit) return null;
    if (panelJustOpened(isPanelOpen, savedViewBox)) {
        return {
            savedViewBox: {
                kind: 'saved',
                x: viewBox.x,
                y: viewBox.y,
                w: viewBox.w,
                h: viewBox.h,
            },
            viewBox,
            shouldPanToReveal: true,
        };
    }
    if (panelJustClosed(isPanelOpen, savedViewBox)) {
        return {
            savedViewBox: { kind: 'none' },
            viewBox: {
                x: savedViewBox.x,
                y: savedViewBox.y,
                w: savedViewBox.w,
                h: savedViewBox.h,
            },
            shouldPanToReveal: false,
        };
    }
    if (panelStaysOpen(isPanelOpen, savedViewBox)) {
        return {
            savedViewBox,
            viewBox,
            shouldPanToReveal: true,
        };
    }
    return null;
}
