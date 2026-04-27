import {
    html, mutateHtml, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import { $, $required } from '../dom';
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
    generateId,
} from '../adapters';
import {
    buildGraphSvg,
    perimeterPoint,
    whichEdge,
    controlOffset,
    buildEdgePreviewPath,
    BLUE,
} from '../flow-graph';
import {
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
    canUndoFlowEdits,
    canRedoFlowEdits,
    recordFlowMutation,
    setHasUndoHistory,
    appendToRedoStack,
    removeFromRedoStack,
} from '../flow-history';
import type {
    FlowHistorySnapshot,
} from '../flow-history';
import {
    applyMoveNodes,
    applyDragPreview,
    applyToggleLock,
    applyUpdateFlowName,
    applyAddNode,
    applyAddEdge,
    applyDeleteNodes,
    applyDeleteEdge,
    applyUpdateNode,
    applyUpdateEdge,
    applyAddField,
    applyDeleteField,
    applyAutoLayout,
    applyPanToRevealSelected,
    applyPanelTransition,
} from '../flow-designer-actions';
import type {
    Waypoint,
    SavedViewBox,
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
        this.#history = recordFlowMutation(
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
        const result = applyToggleLock(
            this.#state.isLocked,
            this.#state.isEditingName,
        );
        this.#state.isLocked = result.isLocked;
        this.#state.isEditingName =
            result.isEditingName;
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
        const result = applyUpdateFlowName(name);
        this.#state.flowName = result.flowName;
        this.#state.isEditingName =
            result.isEditingName;
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    canUndo(): boolean {
        return canUndoFlowEdits(this.#history);
    }

    canRedo(): boolean {
        return canRedoFlowEdits(this.#history);
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
        this.#history = appendToRedoStack(this.#history, {
            id: generateId(),
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
        const popped = removeFromRedoStack(this.#history);
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
        const centerX = sumX / nodes.length;
        const centerY = sumY / nodes.length;
        if (
            Math.abs(centerX) <= 1
            && Math.abs(centerY) <= 1
        ) return;
        this.#state.nodes = nodes.map(
            n => ({
                ...n,
                positionX:
                    n.positionX - centerX,
                positionY:
                    n.positionY - centerY,
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
        const sel =
            this.#state.interaction.selection;
        const edgeId =
            sel.kind === 'edge'
                ? sel.edgeId : null;
        const origin = applyPanToRevealSelected(
            this.#singleSelectedNodeId(),
            edgeId,
            this.#state.nodes,
            this.#state.edges,
            this.#state.interaction.viewBox,
            this.#canvasW,
            PANEL_WIDTH_PX,
        );
        if (!origin) return;
        const vb =
            this.#state.interaction.viewBox;
        vb.x = origin.x;
        vb.y = origin.y;
    }

    #handlePanelTransition(): void {
        const result = applyPanelTransition(
            this.#state.isAutoFit,
            this.#state.isPanelOpen,
            this.#state.savedViewBox,
            this.#state.interaction.viewBox,
        );
        if (!result) return;
        this.#state.savedViewBox =
            result.savedViewBox;
        const vb =
            this.#state.interaction.viewBox;
        vb.x = result.viewBox.x;
        vb.y = result.viewBox.y;
        vb.w = result.viewBox.w;
        vb.h = result.viewBox.h;
        if (result.shouldPanToReveal) {
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
        mutateHtml(container, shell);
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
        const nameHtml =
            buildFlowNameHeader(
                this.#state.flowName,
                this.#state.isEditingName,
            );
        mutateHtml(
            $required(
                '.flow-name-header-slot',
                container,
            ),
            html`${nameHtml}
<p class="text-sm text-muted"
    >${this.#state.flowDescription}</p>`,
        );
    }

    #updateToolbar(
        container: HTMLElement,
    ): void {
        mutateHtml(
            $required(
                '.flow-toolbar-slot',
                container,
            ),
            this.#buildToolbar(),
        );
    }

    #updatePanel(
        container: HTMLElement,
    ): void {
        mutateHtml(
            $required(
                '.flow-props-slot',
                container,
            ),
            this.#buildPropsPanel(),
        );
    }

    #updateCanvas(
        container: HTMLElement,
    ): void {
        mutateHtml(
            $required(
                '.flow-canvas-host',
                container,
            ),
            this.#buildCanvas(),
        );
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
        const nodeId = generateId();
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
        this.#state.nodes = applyAddNode(
            this.#state.nodes,
            nodeId, 'New State', x, y,
        );
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
        if (!from) {
            throw new Error(
                'addEdge: unknown fromId '
                    + fromId,
            );
        }
        if (!to) {
            throw new Error(
                'addEdge: unknown toId '
                    + toId,
            );
        }
        if (from.isComplete) {
            showToast(
                'Cannot create transition'
                + ' from end state',
                'error',
            );
            return false;
        }
        if (to.isStart) {
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
        if (from.isStart) {
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
        const edgeId = generateId();
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
        this.#state.edges = applyAddEdge(
            this.#state.edges,
            edgeId, 'Transition',
            fromId, toId,
        );
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
        const result = applyDeleteNodes(
            this.#state.nodes,
            this.#state.edges,
            idSet,
        );
        const prevNodes = this.#state.nodes;
        const prevEdges = this.#state.edges;
        this.#state.nodes = result.nodes;
        this.#state.edges = result.edges;
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
        this.#state.edges = applyDeleteEdge(
            this.#state.edges, edgeId,
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
        const result = applyAutoLayout(
            this.#state.nodes,
            this.#state.edges,
            this.#canvasW,
            this.#canvasH,
            this.#state.isPanelOpen,
            PANEL_WIDTH_PX,
        );
        this.#state.nodes = result.nodes;
        this.#state.edgeWaypoints =
            result.edgeWaypoints;
        void this.#saveFlow(false);
    }

    updateNodeName(
        name: string,
    ): void {
        if (this.#guardLocked()) return;
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return;
        this.#state.nodes = applyUpdateNode(
            this.#state.nodes,
            nodeId,
            { name: name.trim() },
        );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateNodeDescription(
        desc: string,
    ): void {
        if (this.#guardLocked()) return;
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return;
        this.#state.nodes = applyUpdateNode(
            this.#state.nodes,
            nodeId,
            { description: desc.trim() },
        );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateEdgeName(
        name: string,
    ): void {
        if (this.#guardLocked()) return;
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'edge') return;
        this.#state.edges = applyUpdateEdge(
            this.#state.edges,
            sel.edgeId,
            { name: name.trim() },
        );
        void this.#saveFlow(true);
        this.#noteMutation();
    }

    updateEdgeDescription(
        desc: string,
    ): void {
        if (this.#guardLocked()) return;
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'edge') return;
        this.#state.edges = applyUpdateEdge(
            this.#state.edges,
            sel.edgeId,
            { description: desc.trim() },
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
        const fieldId = generateId();
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
        this.#state.nodes = applyAddField(
            this.#state.nodes,
            nodeId, newField,
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
        this.#state.nodes = applyDeleteField(
            this.#state.nodes,
            nodeId, fieldId,
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
        const nodeId = generateId();
        const edgeId = generateId();
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
        this.#state.nodes = applyAddNode(
            this.#state.nodes,
            nodeId, 'New State', posX, posY,
        );
        this.#state.edges = applyAddEdge(
            this.#state.edges,
            edgeId, 'Transition',
            fromNodeId, nodeId,
        );
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
        const nodeId = generateId();
        const edgeId = generateId();
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
        this.#state.nodes = applyAddNode(
            this.#state.nodes,
            nodeId, name, pos.x, pos.y,
        );
        this.#state.edges = applyAddEdge(
            this.#state.edges,
            edgeId, transitionName,
            fromNodeId, nodeId,
        );
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
        const centerX = vb.x + vb.w / 2;
        const centerY = vb.y + vb.h / 2;
        const z =
            this.#state.interaction.zoom;
        vb.w = w / z;
        vb.h = h / z;
        vb.x = centerX - vb.w / 2;
        vb.y = centerY - vb.h / 2;
    }

    #applyZoomToFit(): void {
        const positions =
            this.#state.nodes.map(
                n => ({
                    x: n.positionX,
                    y: n.positionY,
                }),
            );
        const result = zoomToFitState(
            positions,
            this.#canvasW,
            this.#canvasH,
        );
        if (!result) return;
        this.#state.interaction.zoom =
            result.zoom;
        this.#state.interaction.viewBox =
            { ...result.viewBox };
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

    tryShowFieldEditor(
        container: HTMLElement,
    ):
        | 'opened'
        | 'no-selection'
        | 'locked'
    {
        if (this.selectedNodeId() === null) {
            return 'no-selection';
        }
        if (this.isLocked()) {
            return 'locked';
        }
        const slot = $(
            '#field-editor-slot', container,
        );
        if (slot) {
            mutateHtml(
                slot,
                this.buildFieldEditor(),
            );
        }
        return 'opened';
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
        return applyDragPreview(
            this.#state.nodes,
            this.#state.interaction.drag,
        );
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
