import {
    html, setHtml, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import { log } from '../logger';
import { showToast } from '../toast';
import {
    DISPLAY_ABSENT,
} from '../format';
import {
    iconArrowLeft,
    iconUndo,
    iconRedo,
    iconTrash,
    iconX,
    iconEdit,
    iconCheck,
} from '../icons';
import {
    putNode,
    putGraph,
    putWfEdge,
    putFlow,
    putFlowLocked,
    postNodeAddition,
    postEdgeConnection,
    postFieldAddition,
    deleteNodeCapture,
    deleteEdgeCapture,
    deleteFieldCapture,
    executeUndoSteps,
    getFlowGraph,
} from '../adapters';
import type {
    GraphNode,
    GraphEdge,
    GraphField,
    FlowGraph,
} from '../adapters/flows';
import type { WfFieldType }
    from '../adapters/flows';
import {
    jsonObjectField,
    nowUtc,
} from '../adapters';
import { UndoManager } from '../flow-undo';
import type { UndoStep } from '../flow-undo';
import {
    buildGraphSvg,
    perimeterPoint,
    whichEdge,
    controlOffset,
    buildEdgePreviewPath,
} from '../flow-graph';
import {
    computeLayout,
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

function serializeGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
): string {
    return jsonObjectField(
        { nodes, edges } as unknown as Record<
            string, unknown
        >,
    );
}

function graphPutStep(
    flowId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
): UndoStep {
    return {
        op: 'put',
        resource: `flows/${flowId}`,
        body: {
            graph: serializeGraph(
                nodes, edges,
            ),
            updated_at: nowUtc(),
        },
    };
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
    isEditingName: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
    interaction: InteractionState;
    savedViewBox: SavedViewBox;
}

const PANEL_HEIGHT_PX = 300;
const PANEL_PAD_PX = 40;

export class FlowDesignerPresenter {
    #state: DesignerState;
    #canvasW: number;
    #canvasH: number;
    #needsFit: boolean;
    #undo: UndoManager;

    constructor(
        graph: FlowGraph,
        canvasW: number,
        canvasH: number,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        this.#needsFit = true;
        this.#undo = new UndoManager(
            executeUndoSteps,
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
            isEditingName: false,
            nodes: graph.nodes,
            edges: graph.edges,
            interaction,
            savedViewBox:
                { kind: 'none' },
        };
        this.#migrateToCenter();
    }

    startEditingName(): void {
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
        void putFlowLocked(
            this.#state.flowId, next,
        );
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

    updateFlowName(name: string): void {
        if (this.#guardLocked()) return;
        name = name.trim();
        this.#state.flowName = name;
        this.#state.isEditingName = false;
        void putFlow(
            this.#state.flowId,
            { name },
        );
    }

    canUndo(): boolean {
        return this.#undo.canUndo();
    }

    canRedo(): boolean {
        return this.#undo.canRedo();
    }

    async performUndo(): Promise<boolean> {
        const action =
            await this.#undo.undo();
        if (!action) return false;
        await this.#refreshState();
        return true;
    }

    async performRedo(): Promise<boolean> {
        const action =
            await this.#undo.redo();
        if (!action) return false;
        await this.#refreshState();
        return true;
    }

    async #refreshState(): Promise<void> {
        const graph = await getFlowGraph(
            this.#state.flowId,
        );
        this.#state.nodes = graph.nodes;
        this.#state.edges = graph.edges;
        this.#state.interaction
            .selection = { kind: 'none' };
        this.#state.interaction
            .isPanelOpen = false;
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
        for (const n of nodes) {
            n.positionX -= cx;
            n.positionY -= cy;
        }
        void putGraph(
            this.#state.flowId,
            nodes,
            this.#state.edges,
        );
    }

    selectedNodeId(): string | null {
        const sel =
            this.#state.interaction
                .selection;
        return sel.kind === 'node'
            ? sel.nodeId
            : null;
    }

    selectedEdgeId(): string | null {
        const sel =
            this.#state.interaction
                .selection;
        return sel.kind === 'edge'
            ? sel.edgeId
            : null;
    }

    flowId(): string {
        return this.#state.flowId;
    }

    interactionState(): InteractionState {
        return this.#state.interaction;
    }

    getNodePosition(id: string): {
        x: number;
        y: number;
        isDraggable: boolean;
    } | null {
        const node =
            this.#state.nodes.find(
                n => n.id === id,
            );
        if (!node) return null;
        return {
            x: node.positionX,
            y: node.positionY,
            isDraggable: true,
        };
    }

    #panToRevealSelected(): void {
        const vb =
            this.#state.interaction
                .viewBox;
        const pxToSvg =
            vb.w / this.#canvasW;
        const panelH =
            PANEL_HEIGHT_PX * pxToSvg;
        const pad =
            PANEL_PAD_PX * pxToSvg;
        const sel =
            this.#state.interaction
                .selection;
        let elementY: number | undefined;
        if (sel.kind === 'node') {
            const n =
                this.#state.nodes.find(
                    nd => nd.id
                        === sel.nodeId,
                );
            if (n) {
                elementY = n.positionY;
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
                    elementY = (
                        fn.positionY
                        + tn.positionY
                    ) / 2;
                }
            }
        }
        if (
            elementY === undefined
        ) return;
        const threshold =
            vb.y + panelH + pad;
        if (elementY < threshold) {
            vb.y =
                elementY - panelH - pad;
        }
    }

    #handlePanelTransition(): void {
        const saved =
            this.#state.savedViewBox;
        const isOpen =
            this.#state.interaction
                .isPanelOpen;
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

    render(
        container: HTMLElement,
    ): void {
        this.#handlePanelTransition();
        const toolbar =
            this.#buildToolbar();
        const panel =
            this.#buildPropsPanel();
        const canvas =
            this.#buildCanvas();
        const nameHtml =
            this.#state.isEditingName
                ? html`<div class="${
                    'flex items-center'
                    + ' gap-2'
                }">
<input class="input"
    id="flow-name-input"
    value="${this.#state.flowName}"
    style="${
        'font-size:1.125rem;'
        + 'font-weight:600;'
        + 'padding:0.25rem 0.5rem'
    }" />
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-save-btn"
    >${iconCheck(16, '')}</button>
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-cancel-btn"
    >${iconX(16, '')}</button>
</div>`
                : html`<div class="${
                    'flex items-center'
                    + ' gap-2'
                }">
<h2 class="${
    'text-lg font-semibold'
}">${this.#state.flowName}</h2>
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-edit-btn"
    style="opacity:0.5"
    >${iconEdit(14, '')}</button>
</div>`;
        const lockedAttr =
            this.#state.isLocked
                ? ' checked' : '';
        const content = html`<div
class="wf-designer">
<div class="wf-designer-header">
<div class="${
    'flex items-center gap-4'
}">
<div style="flex:1">${nameHtml}
<p class="text-sm text-muted"
    >${this.#state.flowDescription}</p>
</div>
<label class="${
    'flex items-center gap-2'
    + ' text-sm'
}" style="${
    'cursor:pointer;'
    + 'white-space:nowrap'
}"><input type="checkbox"
    id="flow-lock-checkbox"${
    trusted(lockedAttr)
} /> Locked</label>
</div>
</div>
${toolbar}
<div class="wf-canvas-area">${panel}
<div class="wf-canvas-wrap"
    >${canvas}</div>
</div>
</div>`;
        setHtml(container, content);
    }

    moveNode(
        nodeId: string,
        x: number,
        y: number,
    ): void {
        if (this.#guardLocked()) return;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        node.positionX = x;
        node.positionY = y;
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'move-node',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        void putNode(fId, nodeId, {
            positionX: x,
            positionY: y,
        });
        this.#expandIfNeeded();
    }

    async addNode(): Promise<boolean> {
        const x = START_X
            + (this.#state.nodes.length - 1)
            * (NODE_WIDTH + 120);
        const y = START_Y + 100;
        const nodeId = crypto.randomUUID();
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name: 'New State',
                positionX: x,
                positionY: y,
            });
        } catch (err) {
            log.error(
                'postNodeAddition failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to add state',
                'error',
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
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'add-node',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
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
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        try {
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: 'Transition',
                fromNodeId: fromId,
                toNodeId: toId,
            });
        } catch (err) {
            log.error(
                'postEdgeConnection failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to create'
                + ' transition',
                'error',
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
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'add-edge',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        return true;
    }

    async deleteSelectedNode(
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') {
            return false;
        }
        const nodeId = sel.nodeId;
        const target =
            this.#state.nodes.find(
                n => n.id === nodeId,
            );
        if (
            target?.isStart
            || target?.isComplete
        ) return false;
        try {
            const capture =
                await deleteNodeCapture(
                    nodeId,
                    this.#state.flowId,
                );
            this.#undo.push({
                type: 'delete-node',
                forward: capture.deleteSteps,
                reverse:
                    capture.restoreSteps,
            });
            this.#state.nodes =
                this.#state.nodes.filter(
                    n => n.id !== nodeId,
                );
            this.#state.edges =
                this.#state.edges.filter(
                    e =>
                        e.fromNodeId
                            !== nodeId
                        && e.toNodeId
                            !== nodeId,
                );
        } catch (err) {
            log.error(
                'deleteNodeCapture failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to delete state',
                'error',
            );
            return false;
        }
        this.#state.interaction
            .selection = { kind: 'none' };
        return true;
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
            const capture =
                await deleteEdgeCapture(
                    edgeId,
                    this.#state.flowId,
                );
            this.#undo.push({
                type: 'delete-edge',
                forward: capture.deleteSteps,
                reverse:
                    capture.restoreSteps,
            });
            this.#state.edges =
                this.#state.edges.filter(
                    e => e.id !== edgeId,
                );
        } catch (err) {
            log.error(
                'deleteEdgeCapture failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to delete transition',
                'error',
            );
            return false;
        }
        this.#state.interaction
            .selection = { kind: 'none' };
        return true;
    }

    autoLayout(): void {
        if (this.#guardLocked()) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
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
            this.#state.edges.map(
                e => ({
                    fromId: e.fromNodeId,
                    toId: e.toNodeId,
                }),
            );
        const positions = computeLayout(
            layoutInputs, layoutEdges,
            this.#canvasW, this.#canvasH,
        );
        for (
            const node of this.#state.nodes
        ) {
            const pos =
                positions.get(node.id);
            if (!pos) continue;
            node.positionX = pos.x;
            node.positionY = pos.y;
        }
        void putGraph(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'auto-layout',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        this.#applyZoomToFit();
    }

    updateNodeName(
        name: string,
    ): void {
        if (this.#guardLocked()) return;
        name = name.trim();
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') return;
        const nodeId = sel.nodeId;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        node.name = name;
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'update-node-name',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        void putNode(
            fId, nodeId, { name },
        );
    }

    updateNodeDescription(
        desc: string,
    ): void {
        if (this.#guardLocked()) return;
        desc = desc.trim();
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') return;
        const nodeId = sel.nodeId;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        node.description = desc;
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'update-node-desc',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        void putNode(
            fId, nodeId,
            { description: desc },
        );
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
        const edge = this.#state.edges.find(
            e => e.id === edgeId,
        );
        if (!edge) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        edge.name = name;
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'update-edge-name',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        void putWfEdge(
            fId, edgeId, { name },
        );
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
        const edge = this.#state.edges.find(
            e => e.id === edgeId,
        );
        if (!edge) return;
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        edge.description = desc;
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'update-edge-desc',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        void putWfEdge(
            fId, edgeId,
            { description: desc },
        );
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
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') {
            return false;
        }
        const nodeId = sel.nodeId;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return false;
        const sortOrder = node.fields.length;
        const fieldId = crypto.randomUUID();
        const fId = this.#state.flowId;
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
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
            log.error(
                'postFieldAddition failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to add field',
                'error',
            );
            return false;
        }
        const typed =
            fieldType as WfFieldType;
        node.fields = [
            ...node.fields,
            {
                id: fieldId,
                name,
                fieldType: typed,
                sortOrder,
                isRequired,
                options,
            },
        ];
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'add-field',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        return true;
    }

    async deleteField(
        fieldId: string,
    ): Promise<boolean> {
        if (this.#guardLocked()) {
            return false;
        }
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') {
            return false;
        }
        const nodeId = sel.nodeId;
        try {
            const capture =
                await deleteFieldCapture(
                    fieldId,
                    nodeId,
                    this.#state.flowId,
                );
            this.#undo.push({
                type: 'delete-field',
                forward: capture.deleteSteps,
                reverse:
                    capture.restoreSteps,
            });
            const node =
                this.#state.nodes.find(
                    n => n.id === nodeId,
                );
            if (node) {
                node.fields =
                    node.fields.filter(
                        f => f.id !== fieldId,
                    );
            }
        } catch (err) {
            log.error(
                'deleteFieldCapture failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to delete field',
                'error',
            );
            return false;
        }
        return true;
    }

    selectedNodeName(): string {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') return '';
        const node =
            this.#state.nodes.find(
                n => n.id === sel.nodeId,
            );
        return node?.name ?? '';
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
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name: 'New State',
                positionX: posX,
                positionY: posY,
            });
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: 'Transition',
                fromNodeId,
                toNodeId: nodeId,
            });
        } catch (err) {
            log.error(
                'postNodeAddition failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to add state',
                'error',
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
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'add-node-and-edge',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        this.#state.interaction
            .selection = {
                kind: 'node',
                nodeId,
            };
        this.#state.interaction
            .isPanelOpen = false;
        this.#expandIfNeeded();
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
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') {
            return false;
        }
        const fromNodeId = sel.nodeId;
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
        const reverseStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );

        try {
            await postNodeAddition({
                nodeId,
                flowId: fId,
                name,
                positionX: pos.x,
                positionY: pos.y,
            });
            await postEdgeConnection({
                edgeId,
                flowId: fId,
                name: transitionName,
                fromNodeId,
                toNodeId: nodeId,
            });
        } catch (err) {
            log.error(
                'postNodeAddition failed',
                'flow-designer',
                err,
            );
            showToast(
                'Failed to add state',
                'error',
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
        const forwardStep = graphPutStep(
            fId,
            this.#state.nodes,
            this.#state.edges,
        );
        this.#undo.push({
            type: 'add-node-and-edge',
            forward: [forwardStep],
            reverse: [reverseStep],
        });
        this.#expandIfNeeded();
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
        zoomInState(
            this.#state.interaction,
            this.#selectedFocalPt(),
        );
    }

    zoomOut(): void {
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
        if (sel.kind === 'node') {
            const node =
                this.#state.nodes.find(
                    n => n.id
                        === sel.nodeId,
                );
            if (!node) return null;
            return {
                x: node.positionX
                    + NODE_WIDTH / 2,
                y: node.positionY
                    + NODE_HEIGHT / 2,
            };
        }
        if (sel.kind === 'edge') {
            const edge =
                this.#state.edges.find(
                    e => e.id
                        === sel.edgeId,
                );
            if (!edge) return null;
            const from =
                this.#state.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                );
            const to =
                this.#state.nodes.find(
                    n => n.id
                        === edge.toNodeId,
                );
            if (!from || !to) return null;
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

    zoomToFit(): void {
        this.#applyZoomToFit();
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

    #expandIfNeeded(): void {
        const vb =
            this.#state.interaction.viewBox;
        for (const n of this.#state.nodes) {
            const r =
                n.positionX + NODE_WIDTH;
            const b =
                n.positionY + NODE_HEIGHT;
            if (
                n.positionX < vb.x
                || n.positionY < vb.y
                || r > vb.x + vb.w
                || b > vb.y + vb.h
            ) {
                this.#applyZoomToFit();
                return;
            }
        }
    }

    #canDelete(): boolean {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind === 'node') {
            const node =
                this.#state.nodes.find(
                    n => n.id
                        === sel.nodeId,
                );
            if (
                node
                && !node.isStart
                && !node.isComplete
            ) return true;
        }
        return sel.kind === 'edge';
    }


    #buildToolbar(): SafeHtml {
        return html`<div
class="wf-toolbar">
<div class="wf-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    id="flow-back-btn"
    >${iconArrowLeft(20, '')}</button>
</div>
<div class="wf-toolbar-spacer"></div>
<div class="wf-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="undo"${
    trusted(
        this.#undo.canUndo()
            ? '' : ' disabled',
    )}>${iconUndo(18, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="redo"${
    trusted(
        this.#undo.canRedo()
            ? '' : ' disabled',
    )}>${iconRedo(18, '')}</button>
</div>
<div class="wf-toolbar-spacer"></div>
<div class="wf-toolbar-group">
<button class="btn btn-ghost btn-sm"
    data-action="auto-layout"${
    trusted(
        this.#state.isLocked
            ? ' disabled' : '',
    )}><span class="wf-btn-stack"
    >Auto<br>Layout</span></button>
</div>
<div class="wf-toolbar-spacer"></div>
<div class="wf-toolbar-group">
<button class="btn btn-ghost btn-sm"
    data-action="zoom-out"
    >Zoom \u2212</button>
<button class="btn btn-ghost btn-sm"
    data-action="fit"
    ><span class="wf-btn-stack"
    >Show<br>All</span></button>
<button class="btn btn-ghost btn-sm"
    data-action="zoom-in"
    >Zoom +</button>
</div>
<div class="wf-toolbar-spacer"></div>
<div class="wf-toolbar-group">
<button class="btn btn-ghost btn-sm"
    data-action="copy-mermaid"
    ><span class="wf-btn-stack"
    >Copy<br>Mermaid</span></button>
<button class="btn btn-ghost btn-sm"
    data-action="export-zip"
    >Export</button>
</div>
<div class="wf-toolbar-spacer"></div>
<div class="wf-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="delete-selected"${
    trusted(
        this.#canDelete()
        && !this.#state.isLocked
            ? '' : ' disabled',
    )}>${iconTrash(18, '')}</button>
</div>
</div>`;
    }

    #buildFieldBadge(
        fieldType: string,
    ): SafeHtml {
        return html`<span
class="badge badge-outline text-xs"
>${fieldType}</span>`;
    }

    #buildFieldRow(
        field: GraphField,
    ): SafeHtml {
        const req = field.isRequired
            ? html`<span class="text-xs"
                style="${
                    'color:'
                    + 'hsl(var(--error))'
                }"> *</span>`
            : html``;
        return html`<div
class="wf-field-row"
data-field-id="${field.id}">
${this.#buildFieldBadge(field.fieldType)}
<span class="text-sm"
    >${field.name}</span>
${req}
<button
    class="btn btn-ghost btn-xs ml-auto"
    data-action="delete-field"
    data-field-id="${field.id}"
    >&times;</button>
</div>`;
    }

    buildFieldEditor(): SafeHtml {
        const sel =
            this.#state.interaction
                .selection;
        if (sel.kind !== 'node') {
            return html``;
        }
        const nodeId = sel.nodeId;
        return html`<div
class="wf-field-editor"
data-node-id="${nodeId}">
<h4 class="text-sm font-semibold mb-2"
    >Add Field</h4>
<div class="mb-2">
<input type="text"
    class="input input-sm"
    id="new-field-name"
    placeholder="Field name" />
</div>
<div class="mb-2">
<select class="input input-sm"
    id="new-field-type">
<option value="text">text</option>
<option value="textarea"
    >textarea</option>
<option value="number">number</option>
<option value="date">date</option>
<option value="select">select</option>
<option value="checkbox"
    >checkbox</option>
<option value="file">file</option>
<option value="email">email</option>
<option value="url">url</option>
<option value="phone">phone</option>
<option value="currency"
    >currency</option>
<option value="multi_select"
    >multi_select</option>
<option value="radio">radio</option>
<option value="image">image</option>
</select>
</div>
<div class="mb-2">
<label class="text-sm">
<input type="checkbox"
    id="new-field-required" />
Required</label>
</div>
<div class="mb-2">
<textarea
    class="input input-sm"
    id="new-field-options"
    placeholder="${
        'Options (one per line)'
    }"
    rows="2"></textarea>
</div>
<button class="btn btn-primary btn-xs"
    data-action="save-field"
    >Add</button>
</div>`;
    }

    #buildNodePanel(
        node: GraphNode,
        outgoing: GraphEdge[],
    ): SafeHtml {
        const isSpecial =
            node.isStart || node.isComplete;
        if (isSpecial) {
            const kind = node.isStart
                ? 'Start' : 'End';
            return html`<div
class="wf-props-panel">
<div style="display:flex;
align-items:center;
justify-content:space-between"
><h3 class="text-sm font-semibold"
    >${kind} State</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<div class="text-sm">${node.name}</div>
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Outgoing Transitions</label>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>\u2192 ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
        }
        const fieldRows = node.fields
            .map(f => this.#buildFieldRow(f));
        return html`<div
class="wf-props-panel">
<div style="display:flex;
align-items:center;
justify-content:space-between"
><h3 class="text-sm font-semibold"
    >State Properties</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<input type="text"
    class="input input-sm"
    id="prop-node-name"
    value="${node.name}" />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Description</label>
<input type="text"
    class="input input-sm"
    id="prop-node-desc"
    value="${node.description}" />
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Fields</label>
${fieldRows}
<button
    class="btn btn-ghost btn-xs mt-1"
    data-action="add-field"
    >+ Add Field</button>
<div id="field-editor-slot"></div>
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Outgoing Transitions</label>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>\u2192 ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
    }

    #buildEdgePanel(
        edge: GraphEdge,
        fromNode: GraphNode | undefined,
        toNode: GraphNode | undefined,
    ): SafeHtml {
        const fromName =
            fromNode?.name
            ?? DISPLAY_ABSENT;
        const toName =
            toNode?.name
            ?? DISPLAY_ABSENT;
        return html`<div
class="wf-props-panel">
<div style="display:flex;
align-items:center;
justify-content:space-between"
><h3 class="text-sm font-semibold"
    >Transition Properties</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<input type="text"
    class="input input-sm"
    id="prop-edge-name"
    value="${edge.name}" />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Description</label>
<input type="text"
    class="input input-sm"
    id="prop-edge-desc"
    value="${edge.description}" />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >From</label>
<div class="text-sm">${fromName}</div>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >To</label>
<div class="text-sm">${toName}</div>
</div>
</div>`;
    }

    #buildPropsPanel(): SafeHtml {
        const interaction =
            this.#state.interaction;
        if (!interaction.isPanelOpen) {
            return html``;
        }
        const sel = interaction.selection;

        if (sel.kind === 'node') {
            const node =
                this.#state.nodes.find(
                    n => n.id
                        === sel.nodeId,
                );
            if (!node) return html``;
            const outgoing =
                this.#state.edges.filter(
                    e => e.fromNodeId
                        === sel.nodeId,
                );
            return this.#buildNodePanel(
                node, outgoing,
            );
        }

        if (sel.kind === 'edge') {
            const edge =
                this.#state.edges.find(
                    e => e.id
                        === sel.edgeId,
                );
            if (!edge) return html``;
            const fromNode =
                this.#state.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                );
            const toNode =
                this.#state.nodes.find(
                    n => n.id
                        === edge.toNodeId,
                );
            return this.#buildEdgePanel(
                edge, fromNode, toNode,
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
            + ' stroke="#4B6CA1"'
            + ' stroke-width="2"'
            + ' opacity="0.3"'
            + ' marker-end='
            + '"url(#wf-arrow)"'
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
            + '--color-card-bg,'
            + ' #232940)"'
            + ' stroke="#4B6CA1"'
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
        return this.#state.nodes.map(n => {
            if (n.id !== drag.nodeId) {
                return n;
            }
            return {
                ...n,
                positionX: drag.currentX,
                positionY: drag.currentY,
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
