import {
    html, setHtml, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import { $ } from '../dom';
import { log } from '../logger';
import { showToast } from '../toast';
import {
    putFlow,
    postNodeAddition,
    postEdgeConnection,
    postFieldAddition,
    deleteEdge,
    deleteField,
    getFlowGraph,
    postFlowVersion,
    getFlowVersions,
    deleteFlowVersion,
    putFlowFromVersion,
} from '../adapters';
import type {
    GraphNode,
    GraphEdge,
    GraphField,
    FlowGraph,
    FlowVersion,
    FlowSaveShape,
} from '../adapters/flows';
import type { FlowFieldType }
    from '../adapters/flows';
import {
    jsonObjectField,
    nowUtc,
} from '../adapters';
import {
    buildGraphSvg,
    computeEdgeLabelWidth,
    perimeterPoint,
    whichEdge,
    controlOffset,
    buildEdgePreviewPath,
    BLUE,
} from '../flow-graph';
import {
    computeLayout,
    edgeWaypointKey,
    wouldBeCycle,
    NODE_WIDTH,
    NODE_HEIGHT,
    HORIZONTAL_GAP,
    VERTICAL_GAP,
    START_X,
    START_Y,
} from '../flow-layout';
import {
    buildInteractionState,
    zoomIn as zoomInState,
    zoomOut as zoomOutState,
    zoomToFit as zoomToFitState,
} from '../flow-interactions';
import type {
    InteractionState,
} from '../flow-interactions';
import {
    buildFlowHistorySnapshot,
    canUndo as historyCanUndo,
    canRedo as historyCanRedo,
    noteMutation as historyNoteMutation,
    setHasUndoHistory,
    pushRedo,
    popRedo,
} from '../flow-history';
import type {
    FlowHistorySnapshot,
} from '../flow-history';
import {
    applyMoveNodes,
} from '../flow-designer-actions';
import { iconArrowLeft } from '../icons';
import {
    buildToolbar,
    buildFieldEditor,
    buildNodePanel,
    buildEdgePanel,
    buildFlowNameHeader,
} from './flow-designer-view';

const NEW_NODE_OFFSET_X = 120;
const NEW_NODE_OFFSET_Y = 100;

function serializeGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
) {
    return jsonObjectField(
        { nodes, edges } as unknown as Record<
            string, unknown
        >,
    );
}

type SavedViewBox =
    | { kind: 'none' }
    | {
        kind: 'saved';
        x: number;
        y: number;
        w: number;
        h: number;
    };

interface DesignerState {
    flowId: string;
    flowName: string;
    flowDescription: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    createdAt: string;
    isEditingName: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
    edgeWaypoints: Map<string, Waypoint[]>;
    isPanelOpen: boolean;
    interaction: InteractionState;
    savedViewBox: SavedViewBox;
}

type Waypoint = { x: number; y: number };

function mapWaypointsByEdgeId(
    edges: readonly GraphEdge[],
    byPair: Map<string, Waypoint[]>,
): Map<string, Waypoint[]> {
    const result =
        new Map<string, Waypoint[]>();
    for (const e of edges) {
        const key = edgeWaypointKey(
            e.fromNodeId, e.toNodeId,
        );
        const wp = byPair.get(key);
        if (wp && wp.length > 0) {
            result.set(e.id, wp);
        }
    }
    return result;
}

function emptyWaypoints(
): Map<string, Waypoint[]> {
    return new Map<string, Waypoint[]>();
}

// Must match .flow-props-panel width in pages.css
// (18rem = 288px at 16px root).
const PANEL_WIDTH_PX = 288;

export class FlowDesignerPresenter {
    #state: DesignerState;
    #canvasW: number;
    #canvasH: number;
    #needsFit: boolean;
    #history: FlowHistorySnapshot;

    constructor(
        graph: FlowGraph,
        canvasW: number,
        canvasH: number,
        hasUndoHistory: boolean,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        this.#needsFit = true;
        this.#history = buildFlowHistorySnapshot(
            hasUndoHistory,
        );
        const interaction =
            buildInteractionState(
                canvasW, canvasH,
            );
        this.#state = {
            flowId: graph.id,
            flowName: graph.name,
            flowDescription:
                graph.description,
            isLocked: graph.isLocked,
            isAutoLayout: graph.isAutoLayout,
            isAutoFit: graph.isAutoFit,
            lockTimeout: graph.lockTimeout,
            createdAt: graph.createdAt,
            isEditingName: false,
            nodes: graph.nodes,
            edges: graph.edges,
            edgeWaypoints: emptyWaypoints(),
            isPanelOpen: false,
            interaction,
            savedViewBox:
                { kind: 'none' },
        };
        this.#migrateToCenter();
    }

    #noteMutation(): void {
        this.#history = historyNoteMutation(
            this.#history,
        );
    }

    async #reloadGraphFromStore(
    ): Promise<void> {
        const g = await getFlowGraph(
            this.#state.flowId,
        );
        this.#state.flowName = g.name;
        this.#state.flowDescription =
            g.description;
        this.#state.isLocked = g.isLocked;
        this.#state.lockTimeout =
            g.lockTimeout;
        this.#state.createdAt = g.createdAt;
        this.#state.nodes = g.nodes;
        this.#state.edges = g.edges;
        this.#state.interaction
            .selection = { kind: 'none' };
    }

    #buildSaveShape(): FlowSaveShape {
        return {
            name: this.#state.flowName,
            description:
                this.#state.flowDescription,
            isLocked: this.#state.isLocked,
            isAutoLayout:
                this.#state.isAutoLayout,
            isAutoFit:
                this.#state.isAutoFit,
            lockTimeout:
                this.#state.lockTimeout,
            nodes: this.#state.nodes,
            edges: this.#state.edges,
            createdAt:
                this.#state.createdAt,
        };
    }

    async #saveFlow(
        versioned: boolean,
    ): Promise<void> {
        if (versioned) {
            await postFlowVersion(
                this.#state.flowId,
            );
        }
        await putFlow(
            this.#state.flowId,
            this.#buildSaveShape(),
        );
    }

    async #handleMutationError(
        err: unknown,
        context: string,
        userMessage: string,
    ): Promise<void> {
        log.error(
            context + ' failed',
            'flow-designer',
            err,
        );
        showToast(userMessage, 'error');
        await this
            .#reloadGraphFromStore();
    }

    startEditingName(): void {
        if (this.#guardLocked()) return;
        this.#state.isEditingName = true;
    }

    cancelEditingName(): void {
        this.#state.isEditingName = false;
    }

    isLocked(): boolean {
        return this.#state.isLocked;
    }

    toggleLocked(): void {
        const next = !this.#state.isLocked;
        this.#state.isLocked = next;
        if (next && this.#state.isEditingName) {
            this.#state.isEditingName = false;
        }
        void this.#saveFlow(false);
    }

    isAutoLayout(): boolean {
        return this.#state.isAutoLayout;
    }

    toggleAutoLayout(): void {
        const next =
            !this.#state.isAutoLayout;
        this.#state.isAutoLayout = next;
        void this.#saveFlow(false);
        if (next) {
            this.reconcileLayout();
        }
    }

    isAutoFit(): boolean {
        return this.#state.isAutoFit;
    }

    toggleAutoFit(): void {
        const next = !this.#state.isAutoFit;
        this.#state.isAutoFit = next;
        void this.#saveFlow(false);
        if (next) {
            this.#applyZoomToFit();
        }
    }

    #guardLocked(): boolean {
        if (!this.#state.isLocked) {
            return false;
        }
        showToast(
            'Flow is locked', 'error',
        );
        return true;
    }

    #guardAutoFit(): boolean {
        if (!this.#state.isAutoFit) {
            return false;
        }
        showToast(
            'Disable Auto-Fit to change the view',
            'error',
        );
        return true;
    }

    updateFlowName(name: string): void {
        if (this.#guardLocked()) return;
        name = name.trim();
        this.#state.flowName = name;
        this.#state.isEditingName = false;
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    canUndo(): boolean {
        return historyCanUndo(this.#history);
    }

    canRedo(): boolean {
        return historyCanRedo(this.#history);
    }

    async performUndo(): Promise<boolean> {
        if (this.#guardLocked()) return false;
        const versions = await getFlowVersions(
            this.#state.flowId,
        );
        const version = versions[0];
        if (!version) {
            this.#history = setHasUndoHistory(
                this.#history, false,
            );
            return false;
        }
        this.#history = pushRedo(this.#history, {
            id: crypto.randomUUID(),
            flowId: this.#state.flowId,
            name: this.#state.flowName,
            description:
                this.#state.flowDescription,
            isLocked: this.#state.isLocked,
            isAutoLayout:
                this.#state.isAutoLayout,
            isAutoFit:
                this.#state.isAutoFit,
            lockTimeout:
                this.#state.lockTimeout,
            graph: serializeGraph(
                this.#state.nodes,
                this.#state.edges,
            ),
            createdAt: nowUtc(),
        });
        await putFlowFromVersion(version);
        await deleteFlowVersion(version.id);
        await this.#refreshState();
        const remaining = await getFlowVersions(
            this.#state.flowId,
        );
        this.#history = setHasUndoHistory(
            this.#history,
            remaining.length > 0,
        );
        this.reconcileLayout();
        return true;
    }

    async performRedo(): Promise<boolean> {
        if (this.#guardLocked()) return false;
        const popped = popRedo(this.#history);
        this.#history = popped.snapshot;
        if (!popped.version) return false;
        await postFlowVersion(
            this.#state.flowId,
        );
        this.#history = setHasUndoHistory(
            this.#history, true,
        );
        await putFlowFromVersion(
            popped.version,
        );
        await this.#refreshState();
        this.reconcileLayout();
        return true;
    }

    async #refreshState(): Promise<void> {
        const graph = await getFlowGraph(
            this.#state.flowId,
        );
        this.#state.flowName = graph.name;
        this.#state.flowDescription =
            graph.description;
        this.#state.isLocked = graph.isLocked;
        this.#state.isAutoLayout =
            graph.isAutoLayout;
        this.#state.isAutoFit =
            graph.isAutoFit;
        this.#state.lockTimeout =
            graph.lockTimeout;
        this.#state.createdAt =
            graph.createdAt;
        this.#state.nodes = graph.nodes;
        this.#state.edges = graph.edges;
        this.#state.interaction
            .selection = { kind: 'none' };
        this.#state.isPanelOpen = false;
    }

    #migrateToCenter(): void {
        const nodes = this.#state.nodes;
        if (nodes.length === 0) return;
        let sumX = 0;
        let sumY = 0;
        for (const n of nodes) {
            sumX += n.positionX;
            sumY += n.positionY;
        }
        const cx = sumX / nodes.length;
        const cy = sumY / nodes.length;
        if (
            Math.abs(cx) <= 1
            && Math.abs(cy) <= 1
        ) return;
        this.#state.nodes = nodes.map(
            n => ({
                ...n,
                positionX:
                    n.positionX - cx,
                positionY:
                    n.positionY - cy,
            }),
        );
        void this.#saveFlow(false);
    }

    selectedNodeId(): string | null {
        return this
            .#singleSelectedNodeId();
    }

    selectedEdgeId(): string | null {
        const sel =
            this.#state.interaction
                .selection;
        return sel.kind === 'edge'
            ? sel.edgeId
            : null;
    }

    #singleSelectedNodeId(
    ): string | null {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'nodes') {
            return null;
        }
        if (sel.nodeIds.size !== 1) {
            return null;
        }
        return sel.nodeIds
            .values().next().value
            ?? null;
    }

    #selectedNodeIds(): Set<string> {
        const sel =
            this.#state.interaction
                .selection;
        return sel.kind === 'nodes'
            ? sel.nodeIds
            : new Set<string>();
    }

    flowId(): string {
        return this.#state.flowId;
    }

    interactionState(): InteractionState {
        return this.#state.interaction;
    }

    setPanelOpen(open: boolean): void {
        this.#state.isPanelOpen = open;
    }

    getNodePosition(id: string): {
        x: number;
        y: number;
        isDraggable: boolean;
    } {
        const node =
            this.#state.nodes.find(
                n => n.id === id,
            )!;
        return {
            x: node.positionX,
            y: node.positionY,
            isDraggable: true,
        };
    }

    getAllNodes(): Iterable<{
        id: string;
        x: number;
        y: number;
    }> {
        return this.#state.nodes.map(
            n => ({
                id: n.id,
                x: n.positionX,
                y: n.positionY,
            }),
        );
    }

    #panToRevealSelected(): void {
        // Center the selection in the visible canvas
        // region (the area not covered by the panel).
        // The panel is anchored at the left edge of
        // .flow-canvas-area with width PANEL_WIDTH_PX,
        // so visible X spans [PANEL_WIDTH_PX, canvasW].
        // Solving for vb.x such that selX lands at the
        // visible center yields:
        //   vb.x = selX - (vb.w + panelW_svg) / 2
        const sel =
            this.#state.interaction.selection;
        let selX: number | undefined;
        let selY: number | undefined;
        const singleId = this
            .#singleSelectedNodeId();
        if (singleId) {
            const n =
                this.#state.nodes.find(
                    nd => nd.id === singleId,
                );
            if (n) {
                selX = n.positionX
                    + NODE_WIDTH / 2;
                selY = n.positionY
                    + NODE_HEIGHT / 2;
            }
        }
        if (sel.kind === 'edge') {
            const e =
                this.#state.edges.find(
                    ed => ed.id
                        === sel.edgeId,
                );
            if (e) {
                const fn =
                    this.#state.nodes
                        .find(
                            nd => nd.id
                                === e
                                .fromNodeId,
                        );
                const tn =
                    this.#state.nodes
                        .find(
                            nd => nd.id
                                === e
                                .toNodeId,
                        );
                if (fn && tn) {
                    const fx = fn.positionX
                        + NODE_WIDTH / 2;
                    const fy = fn.positionY
                        + NODE_HEIGHT / 2;
                    const tx = tn.positionX
                        + NODE_WIDTH / 2;
                    const ty = tn.positionY
                        + NODE_HEIGHT / 2;
                    selX = (fx + tx) / 2;
                    selY = (fy + ty) / 2;
                }
            }
        }
        if (selX === undefined) return;
        if (selY === undefined) return;
        const vb =
            this.#state.interaction.viewBox;
        const panelW_svg =
            PANEL_WIDTH_PX
            * vb.w / this.#canvasW;
        vb.x = selX
            - (vb.w + panelW_svg) / 2;
        vb.y = selY - vb.h / 2;
    }

    #handlePanelTransition(): void {
        if (this.#state.isAutoFit) return;
        const saved =
            this.#state.savedViewBox;
        const isOpen =
            this.#state.isPanelOpen;
        const wasOpen =
            saved.kind === 'saved';
        if (isOpen && !wasOpen) {
            const vb =
                this.#state.interaction
                    .viewBox;
            this.#state.savedViewBox = {
                kind: 'saved',
                x: vb.x,
                y: vb.y,
                w: vb.w,
                h: vb.h,
            };
            this.#panToRevealSelected();
        }
        if (!isOpen && wasOpen) {
            const vb =
                this.#state.interaction
                    .viewBox;
            vb.x = saved.x;
            vb.y = saved.y;
            vb.w = saved.w;
            vb.h = saved.h;
            this.#state.savedViewBox =
                { kind: 'none' };
        }
        if (isOpen && wasOpen) {
            this.#panToRevealSelected();
        }
    }

    renderShell(
        container: HTMLElement,
    ): void {
        const shell = html`<div
class="flow-designer">
<div class="flow-designer-header">
<div class="${
    'flex items-center gap-4'
}">
<button
    class="btn btn-ghost btn-icon"
    id="flow-back-btn"
    title="Back"
    aria-label="Back"
    >${iconArrowLeft(20, '')}</button>
<div class="flex-1 flow-name-header-slot"
    ></div>
<div class="flex flex-col gap-2">
<label class="${
    'flex items-center gap-2'
    + ' text-sm flow-lock-label'
}"><button class="switch"
    role="switch"
    aria-checked="false"
    id="flow-lock-switch"
    ><span class="switch-thumb"
    ></span></button>
Locked</label>
<label class="${
    'flex items-center gap-2'
    + ' text-sm flow-lock-label'
}"><button class="switch"
    role="switch"
    aria-checked="false"
    id="flow-auto-layout-switch"
    ><span class="switch-thumb"
    ></span></button>
Auto Layout</label>
<label class="${
    'flex items-center gap-2'
    + ' text-sm flow-lock-label'
}"><button class="switch"
    role="switch"
    aria-checked="false"
    id="flow-auto-fit-switch"
    ><span class="switch-thumb"
    ></span></button>
Auto Fit</label>
</div>
</div>
</div>
<div class="flow-designer-body">
<div class="flow-toolbar-slot"></div>
<div class="flow-canvas-area"
    ><div class="flow-props-slot"></div>
<div class="flow-canvas-wrap"
    ><div class="flow-canvas-host"
    ></div></div>
</div>
</div>
</div>`;
        setHtml(container, shell);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        this.#handlePanelTransition();
        this.#mutateSwitches(container);
        this.#updateNameHeader(container);
        this.#updateToolbar(container);
        this.#updatePanel(container);
        this.#updateCanvas(container);
    }

    #mutateSwitches(
        container: HTMLElement,
    ): void {
        const set = (
            id: string, value: boolean,
        ): void => {
            const el = $(id, container);
            if (el) {
                el.setAttribute(
                    'aria-checked',
                    String(value),
                );
            }
        };
        set(
            '#flow-lock-switch',
            this.#state.isLocked,
        );
        set(
            '#flow-auto-layout-switch',
            this.#state.isAutoLayout,
        );
        set(
            '#flow-auto-fit-switch',
            this.#state.isAutoFit,
        );
    }

    #updateNameHeader(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.flow-name-header-slot',
            container,
        );
        if (!slot) return;
        const nameHtml =
            buildFlowNameHeader(
                this.#state.flowName,
                this.#state.isEditingName,
            );
        setHtml(slot, html`${nameHtml}
<p class="text-sm text-muted"
    >${this.#state.flowDescription}</p>`);
    }

    #updateToolbar(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.flow-toolbar-slot',
            container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildToolbar());
    }

    #updatePanel(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.flow-props-slot',
            container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildPropsPanel());
    }

    #updateCanvas(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.flow-canvas-host',
            container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildCanvas());
    }

    moveNodes(
        updates: Array<{
            nodeId: string;
            x: number;
            y: number;
        }>,
    ): void {
        if (this.#guardLocked()) return;
        if (updates.length === 0) return;
        this.#state.nodes = applyMoveNodes(
            this.#state.nodes, updates,
        );
        void this.#saveFlow(true);
        this.#noteMutation();
        this.reconcileLayout();
    }

    async addNode(): Promise<boolean> {
        const x = START_X
            + (this.#state.nodes.length - 1)
            * (NODE_WIDTH + NEW_NODE_OFFSET_X);
        const y = START_Y + NEW_NODE_OFFSET_Y;
        const nodeId = crypto.randomUUID();
        const fId = this.#state.flowId;
        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name: 'New State',
                positionX: x,
                positionY: y,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addNode',
                    'Failed to add state',
                );
            return false;
        }
        this.#state.nodes = [
            ...this.#state.nodes,
            {
                id: nodeId,
                name: 'New State',
                description: '',
                positionX: x,
                positionY: y,
                isStart: false,
                isComplete: false,
                fields: [],
            },
        ];
        this.#noteMutation();
        this.reconcileLayout();
        return true;
    }

    async addEdge(
        fromId: string,
        toId: string,
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const from =
            this.#state.nodes.find(
                n => n.id === fromId,
            );
        const to =
            this.#state.nodes.find(
                n => n.id === toId,
            );
        if (from?.isComplete) {
            showToast(
                'Cannot create transition'
                + ' from end state',
                'error',
            );
            return false;
        }
        if (to?.isStart) {
            showToast(
                'Cannot create transition'
                + ' to start state',
                'error',
            );
            return false;
        }
        const hasDuplicate =
            this.#state.edges.some(
                e => e.fromNodeId === fromId
                    && e.toNodeId === toId,
            );
        if (hasDuplicate) {
            showToast(
                'Transition already exists',
                'error',
            );
            return false;
        }
        if (from?.isStart) {
            const hasOutgoing =
                this.#state.edges.some(
                    e => e.fromNodeId
                        === fromId,
                );
            if (hasOutgoing) {
                showToast(
                    'Start state allows'
                    + ' only one outgoing'
                    + ' transition',
                    'error',
                );
                return false;
            }
        }
        const edgeId = crypto.randomUUID();
        const fId = this.#state.flowId;
        try {
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: 'Transition',
                fromNodeId: fromId,
                toNodeId: toId,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addEdge',
                    'Failed to create'
                    + ' transition',
                );
            return false;
        }
        this.#state.edges = [
            ...this.#state.edges,
            {
                id: edgeId,
                name: 'Transition',
                description: '',
                fromNodeId: fromId,
                toNodeId: toId,
            },
        ];
        this.#noteMutation();
        this.reconcileLayout();
        return true;
    }

    async deleteSelectedNodes(
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const ids = this
            .#deletableNodeIds();
        if (ids.length === 0) return false;
        const idSet = new Set(ids);
        const nextNodes =
            this.#state.nodes.filter(
                n => !idSet.has(n.id),
            );
        const nextEdges =
            this.#state.edges.filter(
                e =>
                    !idSet.has(
                        e.fromNodeId,
                    )
                    && !idSet.has(
                        e.toNodeId,
                    ),
            );
        const prevNodes = this.#state.nodes;
        const prevEdges = this.#state.edges;
        this.#state.nodes = nextNodes;
        this.#state.edges = nextEdges;
        try {
            await this.#saveFlow(true);
        } catch (err) {
            this.#state.nodes = prevNodes;
            this.#state.edges = prevEdges;
            await this
                .#handleMutationError(
                    err,
                    'deleteSelectedNodes',
                    'Failed to delete state',
                );
            return false;
        }
        this.#noteMutation();
        this.#state.interaction
            .selection = { kind: 'none' };
        this.reconcileLayout();
        return true;
    }

    #deletableNodeIds(): string[] {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'nodes') return [];
        const result: string[] = [];
        for (const id of sel.nodeIds) {
            const n =
                this.#state.nodes.find(
                    nd => nd.id === id,
                );
            if (
                n
                && !n.isStart
                && !n.isComplete
            ) {
                result.push(id);
            }
        }
        return result;
    }

    async deleteSelectedEdge(
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'edge') {
            return false;
        }
        const edgeId = sel.edgeId;
        try {
            await deleteEdge(
                edgeId,
                this.#state.flowId,
            );
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'deleteSelectedEdge',
                    'Failed to delete'
                    + ' transition',
                );
            return false;
        }
        this.#state.edges =
            this.#state.edges.filter(
                e => e.id !== edgeId,
            );
        this.#noteMutation();
        this.#state.interaction
            .selection = { kind: 'none' };
        this.reconcileLayout();
        return true;
    }

    async deleteSelected(
    ): Promise<boolean> {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind === 'nodes') {
            return this
                .deleteSelectedNodes();
        }
        if (sel.kind === 'edge') {
            return this
                .deleteSelectedEdge();
        }
        return false;
    }

    reconcileLayout(): void {
        if (
            this.#state.isAutoLayout
            && !this.#state.isLocked
        ) {
            this.#runAutoLayout();
        }
        if (this.#state.isAutoFit) {
            this.#applyZoomToFit();
        }
    }

    #runAutoLayout(): void {
        const nodeById = new Map(
            this.#state.nodes.map(
                n => [n.id, n],
            ),
        );
        const layoutInputs =
            this.#state.nodes.map(
                n => ({
                    id: n.id,
                    isStart: n.isStart,
                    isComplete: n.isComplete,
                }),
            );
        const layoutEdges =
            this.#state.edges.map(e => {
                const from =
                    nodeById.get(e.fromNodeId);
                const isStart =
                    from?.isStart === true;
                return {
                    fromId: e.fromNodeId,
                    toId: e.toNodeId,
                    labelWidth: isStart
                        ? 0
                        : computeEdgeLabelWidth(
                            e.name,
                        ),
                };
            });
        const panelOpen =
            this.#state.isPanelOpen;
        const effectiveW = panelOpen
            ? Math.max(
                0,
                this.#canvasW - PANEL_WIDTH_PX,
            )
            : this.#canvasW;
        const result = computeLayout({
            nodes: layoutInputs,
            edges: layoutEdges,
            canvasWidth: effectiveW,
            canvasHeight: this.#canvasH,
        });
        this.#state.nodes =
            this.#state.nodes.map(n => {
                const pos =
                    result.positions.get(n.id)!;
                return {
                    ...n,
                    positionX: pos.x,
                    positionY: pos.y,
                };
            });
        this.#state.edgeWaypoints =
            mapWaypointsByEdgeId(
                this.#state.edges,
                result.waypoints,
            );
        void this.#saveFlow(false);
    }

    updateNodeName(
        name: string,
    ): void {
        if (this.#guardLocked()) return;
        name = name.trim();
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return;
        this.#state.nodes =
            this.#state.nodes.map(
                n => n.id === nodeId
                    ? { ...n, name }
                    : n,
            );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateNodeDescription(
        desc: string,
    ): void {
        if (this.#guardLocked()) return;
        desc = desc.trim();
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return;
        this.#state.nodes =
            this.#state.nodes.map(
                n => n.id === nodeId
                    ? {
                        ...n,
                        description: desc,
                    }
                    : n,
            );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateEdgeName(
        name: string,
    ): void {
        if (this.#guardLocked()) return;
        name = name.trim();
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'edge') return;
        const edgeId = sel.edgeId;
        this.#state.edges =
            this.#state.edges.map(
                e => e.id === edgeId
                    ? { ...e, name }
                    : e,
            );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateEdgeDescription(
        desc: string,
    ): void {
        if (this.#guardLocked()) return;
        desc = desc.trim();
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'edge') return;
        const edgeId = sel.edgeId;
        this.#state.edges =
            this.#state.edges.map(
                e => e.id === edgeId
                    ? {
                        ...e,
                        description: desc,
                    }
                    : e,
            );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    async addField(
        name: string,
        fieldType: string,
        isRequired: boolean,
        options: string[],
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        name = name.trim();
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return false;
        const sortOrder =
            this.#state.nodes.find(
                n => n.id === nodeId,
            )!.fields.length;
        const fieldId = crypto.randomUUID();
        const fId = this.#state.flowId;
        try {
            await postFieldAddition({
                fieldId,
                flowId: fId,
                nodeId,
                name,
                fieldType,
                sortOrder,
                isRequired,
                options,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addField',
                    'Failed to add field',
                );
            return false;
        }
        const typed =
            fieldType as FlowFieldType;
        const newField: GraphField = {
            id: fieldId,
            name,
            fieldType: typed,
            sortOrder,
            isRequired,
            options,
        };
        this.#state.nodes =
            this.#state.nodes.map(
                n => n.id === nodeId
                    ? {
                        ...n,
                        fields: [
                            ...n.fields,
                            newField,
                        ],
                    }
                    : n,
            );
        this.#noteMutation();
        return true;
    }

    async deleteField(
        fieldId: string,
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return false;
        try {
            await deleteField(
                fieldId,
                nodeId,
                this.#state.flowId,
            );
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'deleteField',
                    'Failed to delete field',
                );
            return false;
        }
        this.#state.nodes =
            this.#state.nodes.map(
                n => n.id === nodeId
                    ? {
                        ...n,
                        fields:
                            n.fields.filter(
                                f => f.id
                                    !== fieldId,
                            ),
                    }
                    : n,
            );
        this.#noteMutation();
        return true;
    }

    selectedNodeName(): string {
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return '';
        return this.#state.nodes.find(
            n => n.id === nodeId,
        )!.name;
    }

    async addNodeAtPosition(
        fromNodeId: string,
        x: number,
        y: number,
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const fromNode =
            this.#state.nodes.find(
                n => n.id === fromNodeId,
            );
        if (!fromNode) return false;
        if (fromNode.isComplete) {
            showToast(
                'Cannot create from'
                + ' end state',
                'error',
            );
            return false;
        }
        if (fromNode.isStart) {
            const hasOut =
                this.#state.edges.some(
                    e => e.fromNodeId
                        === fromNodeId,
                );
            if (hasOut) {
                showToast(
                    'Start state allows'
                    + ' only one outgoing'
                    + ' transition',
                    'error',
                );
                return false;
            }
        }
        const nodeId = crypto.randomUUID();
        const edgeId = crypto.randomUUID();
        const fId = this.#state.flowId;
        const posX =
            x - NODE_WIDTH / 2;
        const posY =
            y - NODE_HEIGHT / 2;
        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name: 'New State',
                positionX: posX,
                positionY: posY,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addNodeAtPosition',
                    'Failed to add state',
                );
            return false;
        }
        try {
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: 'Transition',
                fromNodeId,
                toNodeId: nodeId,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addNodeAtPosition',
                    'Failed to connect'
                    + ' transition',
                );
            return false;
        }
        this.#state.nodes = [
            ...this.#state.nodes,
            {
                id: nodeId,
                name: 'New State',
                description: '',
                positionX: posX,
                positionY: posY,
                isStart: false,
                isComplete: false,
                fields: [],
            },
        ];
        this.#state.edges = [
            ...this.#state.edges,
            {
                id: edgeId,
                name: 'Transition',
                description: '',
                fromNodeId,
                toNodeId: nodeId,
            },
        ];
        this.#noteMutation();
        this.#state.interaction
            .selection = {
                kind: 'nodes',
                nodeIds: new Set([nodeId]),
            };
        this.#state.isPanelOpen = false;
        this.reconcileLayout();
        return true;
    }

    async addNodeWithEdge(
        name: string,
        transitionName: string,
        direction: string,
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const fromNodeId = this
            .#singleSelectedNodeId();
        if (!fromNodeId) return false;
        const fromNode =
            this.#state.nodes.find(
                n => n.id === fromNodeId,
            );
        if (!fromNode) return false;

        const pos =
            this.#computeDirectionPos(
                fromNode, direction,
            );
        const nodeId = crypto.randomUUID();
        const edgeId = crypto.randomUUID();
        const fId = this.#state.flowId;

        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name,
                positionX: pos.x,
                positionY: pos.y,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addNodeWithEdge',
                    'Failed to add state',
                );
            return false;
        }
        try {
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: transitionName,
                fromNodeId,
                toNodeId: nodeId,
            });
        } catch (err) {
            await this
                .#handleMutationError(
                    err,
                    'addNodeWithEdge',
                    'Failed to connect'
                    + ' transition',
                );
            return false;
        }
        this.#state.nodes = [
            ...this.#state.nodes,
            {
                id: nodeId,
                name,
                description: '',
                positionX: pos.x,
                positionY: pos.y,
                isStart: false,
                isComplete: false,
                fields: [],
            },
        ];
        this.#state.edges = [
            ...this.#state.edges,
            {
                id: edgeId,
                name: transitionName,
                description: '',
                fromNodeId,
                toNodeId: nodeId,
            },
        ];
        this.#noteMutation();
        this.reconcileLayout();
        return true;
    }

    #computeDirectionPos(
        fromNode: GraphNode,
        direction: string,
    ): { x: number; y: number } {
        switch (direction) {
            case 'left':
                return {
                    x: fromNode.positionX
                        - NODE_WIDTH
                        - HORIZONTAL_GAP,
                    y: fromNode.positionY,
                };
            case 'above':
                return {
                    x: fromNode.positionX,
                    y: fromNode.positionY
                        - NODE_HEIGHT
                        - VERTICAL_GAP,
                };
            case 'below':
                return {
                    x: fromNode.positionX,
                    y: fromNode.positionY
                        + NODE_HEIGHT
                        + VERTICAL_GAP,
                };
            default:
                return {
                    x: fromNode.positionX
                        + NODE_WIDTH
                        + HORIZONTAL_GAP,
                    y: fromNode.positionY,
                };
        }
    }

    zoomIn(): void {
        if (this.#guardAutoFit()) return;
        zoomInState(
            this.#state.interaction,
            this.#selectedFocalPt(),
        );
    }

    zoomOut(): void {
        if (this.#guardAutoFit()) return;
        zoomOutState(
            this.#state.interaction,
            this.#selectedFocalPt(),
        );
    }

    #selectedFocalPt(): {
        x: number;
        y: number;
    } | null {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind === 'nodes') {
            const selectedNodes =
                this.#state.nodes.filter(
                    n => sel.nodeIds
                        .has(n.id),
                );
            if (
                selectedNodes.length === 0
            ) return null;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const n of selectedNodes) {
                if (n.positionX < minX) {
                    minX = n.positionX;
                }
                if (n.positionY < minY) {
                    minY = n.positionY;
                }
                const r =
                    n.positionX
                    + NODE_WIDTH;
                const b =
                    n.positionY
                    + NODE_HEIGHT;
                if (r > maxX) maxX = r;
                if (b > maxY) maxY = b;
            }
            return {
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2,
            };
        }
        if (sel.kind === 'edge') {
            const edge =
                this.#state.edges.find(
                    e => e.id
                        === sel.edgeId,
                )!;
            const from =
                this.#state.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                )!;
            const to =
                this.#state.nodes.find(
                    n => n.id
                        === edge.toNodeId,
                )!;
            return {
                x: (from.positionX
                    + to.positionX
                    + NODE_WIDTH) / 2,
                y: (from.positionY
                    + to.positionY
                    + NODE_HEIGHT) / 2,
            };
        }
        return null;
    }

    updateCanvasSize(
        w: number, h: number,
    ): void {
        this.#canvasW = w;
        this.#canvasH = h;
        if (this.#needsFit) {
            this.#needsFit = false;
            this.#applyZoomToFit();
            return;
        }
        const vb =
            this.#state.interaction
                .viewBox;
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        const z =
            this.#state.interaction.zoom;
        vb.w = w / z;
        vb.h = h / z;
        vb.x = cx - vb.w / 2;
        vb.y = cy - vb.h / 2;
    }

    #applyZoomToFit(): void {
        const positions =
            this.#state.nodes.map(
                n => ({
                    x: n.positionX,
                    y: n.positionY,
                }),
            );
        zoomToFitState(
            this.#state.interaction,
            positions,
            this.#canvasW,
            this.#canvasH,
        );
    }

    #canDelete(): boolean {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind === 'nodes') {
            return this
                .#deletableNodeIds()
                .length > 0;
        }
        return sel.kind === 'edge';
    }


    #buildToolbar(): SafeHtml {
        return buildToolbar(
            this.canUndo(),
            this.canRedo(),
            this.#canDelete(),
        );
    }

    buildFieldEditor(): SafeHtml {
        return buildFieldEditor(
            this.#singleSelectedNodeId(),
        );
    }

    #buildPropsPanel(): SafeHtml {
        if (!this.#state.isPanelOpen) {
            return html``;
        }
        const sel =
            this.#state.interaction.selection;

        const singleNodeId = this
            .#singleSelectedNodeId();
        if (singleNodeId) {
            const node =
                this.#state.nodes.find(
                    n => n.id
                        === singleNodeId,
                )!;
            const outgoing =
                this.#state.edges.filter(
                    e => e.fromNodeId
                        === singleNodeId,
                );
            return buildNodePanel(
                node, outgoing,
                this.#state.isLocked,
            );
        }

        if (sel.kind === 'edge') {
            const edge =
                this.#state.edges.find(
                    e => e.id
                        === sel.edgeId,
                )!;
            const fromNode =
                this.#state.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                )!;
            const toNode =
                this.#state.nodes.find(
                    n => n.id
                        === edge.toNodeId,
                )!;
            return buildEdgePanel(
                edge, fromNode, toNode,
                this.#state.isLocked,
            );
        }

        return html``;
    }

    #connectSourcePoint(): {
        x: number;
        y: number;
    } | null {
        const conn =
            this.#state.interaction.connect;
        if (conn.kind !== 'connecting') {
            return null;
        }
        const fromNode =
            this.#state.nodes.find(
                n => n.id
                    === conn.fromNodeId,
            );
        if (!fromNode) return null;
        return perimeterPoint(
            fromNode.positionX,
            fromNode.positionY,
            NODE_WIDTH, NODE_HEIGHT,
            conn.toX, conn.toY,
        );
    }

    #buildConnectPreview(): string {
        const conn =
            this.#state.interaction
                .connect;
        if (conn.kind !== 'connecting') {
            return '';
        }
        const src =
            this.#connectSourcePoint();
        if (!src) return '';
        const fromNode =
            this.#state.nodes.find(
                n => n.id
                    === conn.fromNodeId,
            );
        if (!fromNode) return '';
        if (conn.isShift) {
            if (
                conn.target.kind === 'node'
            ) {
                const targetId =
                    conn.target.id;
                const toNode =
                    this.#state.nodes.find(
                        n => n.id
                            === targetId,
                    );
                if (toNode) {
                    const isCycle =
                        wouldBeCycle(
                            conn.fromNodeId,
                            targetId,
                            this.#state
                                .edges
                                .map(e => ({
                                    fromId:
                                        e
                                        .fromNodeId,
                                    toId:
                                        e
                                        .toNodeId,
                                })),
                        );
                    return buildEdgePreviewPath(
                        fromNode,
                        toNode,
                        isCycle,
                    );
                }
            }
            return '<line'
                + ` x1="${src.x}"`
                + ` y1="${src.y}"`
                + ` x2="${conn.toX}"`
                + ` y2="${conn.toY}"`
                + ' stroke='
                + '"var('
                + '--color-muted-foreground,'
                + ' #5a6480)"'
                + ' stroke-width="2"'
                + ' opacity="0.5"'
                + ' pointer-events="none"/>';
        }
        const gx =
            conn.toX - NODE_WIDTH / 2;
        const gy =
            conn.toY - NODE_HEIGHT / 2;
        const halfW = NODE_WIDTH / 2;
        const fromCx =
            fromNode.positionX + halfW;
        const fromCy =
            fromNode.positionY
            + NODE_HEIGHT / 2;
        const endPt = perimeterPoint(
            gx, gy,
            NODE_WIDTH, NODE_HEIGHT,
            fromCx, fromCy,
        );
        const dist = Math.hypot(
            endPt.x - src.x,
            endPt.y - src.y,
        );
        const se = whichEdge(
            src.x, src.y,
            fromNode.positionX,
            fromNode.positionY,
            NODE_WIDTH, NODE_HEIGHT,
        );
        const ee = whichEdge(
            endPt.x, endPt.y,
            gx, gy,
            NODE_WIDTH, NODE_HEIGHT,
        );
        const cp1 = controlOffset(
            se, dist,
        );
        const cp2 = controlOffset(
            ee, dist,
        );
        const pathD = 'M '
            + String(src.x) + ' '
            + String(src.y)
            + ' C '
            + String(src.x + cp1.dx)
            + ' '
            + String(src.y + cp1.dy)
            + ', '
            + String(endPt.x + cp2.dx)
            + ' '
            + String(endPt.y + cp2.dy)
            + ', '
            + String(endPt.x) + ' '
            + String(endPt.y);
        return '<path'
            + ' d="' + pathD + '"'
            + ' fill="none"'
            + ` stroke="${BLUE}"`
            + ' stroke-width="2"'
            + ' opacity="0.3"'
            + ' marker-end='
            + '"url(#flow-arrow)"'
            + ' pointer-events='
            + '"none"/>'
            + '<g transform="translate('
            + String(gx) + ', '
            + String(gy) + ')"'
            + ' opacity="0.3"'
            + ' pointer-events="none">'
            + '<rect'
            + ` width="${NODE_WIDTH}"`
            + ` height="${NODE_HEIGHT}"`
            + ' rx="10"'
            + ' fill="var('
            + '--color-card-bg)"'
            + ` stroke="${BLUE}"`
            + ' stroke-width="2"/>'
            + '<text'
            + ` x="${halfW}"`
            + ' y="22"'
            + ' text-anchor="middle"'
            + ' font-size="14"'
            + ' font-weight="600"'
            + ' fill="var('
            + '--color-foreground,'
            + ' #e0e4ef)">'
            + 'New State</text>'
            + '</g>';
    }

    #nodesForRender(): GraphNode[] {
        const drag =
            this.#state.interaction.drag;
        if (drag.kind !== 'dragging') {
            return this.#state.nodes;
        }
        const dx =
            drag.currentPointerX
            - drag.startPointerX;
        const dy =
            drag.currentPointerY
            - drag.startPointerY;
        return this.#state.nodes.map(n => {
            const init =
                drag.initialPositions
                    .get(n.id);
            if (!init) return n;
            return {
                ...n,
                positionX: init.x + dx,
                positionY: init.y + dy,
            };
        });
    }

    #buildCanvas(): SafeHtml {
        const nodes = this.#nodesForRender();
        const vb =
            this.#state.interaction.viewBox;
        const isConn =
            this.#state.interaction
                .connect.kind
                === 'connecting';
        const m =
            this.#state.interaction.marquee;
        const marqueeRect = m.kind
            === 'selecting'
            ? {
                x: Math.min(
                    m.startX, m.currentX,
                ),
                y: Math.min(
                    m.startY, m.currentY,
                ),
                w: Math.abs(
                    m.currentX - m.startX,
                ),
                h: Math.abs(
                    m.currentY - m.startY,
                ),
            }
            : null;
        const svgHtml = buildGraphSvg(
            nodes,
            this.#state.edges,
            vb.x,
            vb.y,
            vb.w,
            vb.h,
            this.#state.interaction
                .selection,
            this.#state.isLocked,
            isConn,
            marqueeRect,
            this.#state.edgeWaypoints,
        );
        const preview =
            this.#buildConnectPreview();
        if (preview.length === 0) {
            return svgHtml;
        }
        const svgStr = svgHtml.toString();
        const closeTag = '</svg>';
        const idx = svgStr.lastIndexOf(
            closeTag,
        );
        if (idx === -1) return svgHtml;
        return trusted(
            svgStr.slice(0, idx)
            + preview
            + closeTag,
        );
    }

}
