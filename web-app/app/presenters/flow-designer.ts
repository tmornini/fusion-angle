import {
    html, setHtml, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import { showToast } from '../toast';
import {
    iconArrowLeft,
    iconUndo,
    iconRedo,
} from '../icons';
import {
    putNode,
    putWfEdge,
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
import { UndoManager } from '../flow-undo';
import type { UndoStep } from '../flow-undo';
import {
    buildGraphSvg,
} from '../flow-graph';
import {
    computeLayout,
    NODE_WIDTH,
    NODE_HEIGHT,
    HORIZONTAL_GAP,
    VERTICAL_GAP,
    START_X,
    START_Y,
} from '../flow-layout';
import {
    createInteractionState,
    zoomIn as zoomInState,
    zoomOut as zoomOutState,
    zoomToFit as zoomToFitState,
} from '../flow-interactions';
import type {
    InteractionState,
} from '../flow-interactions';

interface DesignerState {
    flowId: string;
    flowName: string;
    flowDescription: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    interaction: InteractionState;
}

export class FlowDesignerPresenter {
    #state: DesignerState;
    #canvasW: number;
    #canvasH: number;
    #undo: UndoManager;

    constructor(
        graph: FlowGraph,
        canvasW: number,
        canvasH: number,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        this.#undo = new UndoManager(
            executeUndoSteps,
        );
        const interaction =
            createInteractionState(
                canvasW, canvasH,
            );
        this.#state = {
            flowId: graph.id,
            flowName: graph.name,
            flowDescription:
                graph.description,
            nodes: graph.nodes,
            edges: graph.edges,
            interaction,
        };
        this.#migrateToCenter();
        this.#applyZoomToFit();
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
        if (!graph) return;
        this.#state.nodes = graph.nodes;
        this.#state.edges = graph.edges;
        this.#state.interaction
            .selectedNodeId = null;
        this.#state.interaction
            .selectedEdgeId = null;
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
            void putNode(n.id, {
                position_x: n.positionX,
                position_y: n.positionY,
            });
        }
    }

    selectedNodeId(): string | null {
        return this.#state
            .interaction
            .selectedNodeId;
    }

    selectedEdgeId(): string | null {
        return this.#state
            .interaction
            .selectedEdgeId;
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
            isDraggable:
                !node.isStart
                && !node.isComplete,
        };
    }

    render(
        container: HTMLElement,
    ): void {
        const toolbar =
            this.#buildToolbar();
        const panel =
            this.#buildPropsPanel();
        const canvas =
            this.#buildCanvas();
        const dialog =
            this.#buildAddStateDialog();
        const content = html`<div
class="wf-designer">
<div class="wf-designer-header">
<h2 class="text-lg font-semibold"
    >${this.#state.flowName}</h2>
<p class="text-sm text-muted"
    >${this.#state.flowDescription}</p>
</div>
${toolbar}
${panel}
<div class="wf-canvas-wrap"
    >${canvas}</div>
</div>
${dialog}`;
        setHtml(container, content);
    }

    moveNode(
        nodeId: string,
        x: number,
        y: number,
    ): void {
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const oldX = node.positionX;
        const oldY = node.positionY;
        node.positionX = x;
        node.positionY = y;
        const resource =
            `wf-nodes/${nodeId}`;
        this.#undo.push({
            type: 'move-node',
            forward: [{
                op: 'put',
                resource,
                body: {
                    position_x: x,
                    position_y: y,
                },
            }],
            reverse: [{
                op: 'put',
                resource,
                body: {
                    position_x: oldX,
                    position_y: oldY,
                },
            }],
        });
        void putNode(nodeId, {
            position_x: x,
            position_y: y,
        });
    }

    async addNode(): Promise<boolean> {
        const x = START_X
            + (this.#state.nodes.length - 1)
            * (NODE_WIDTH + 120);
        const y = START_Y + 100;
        const nodeId = crypto.randomUUID();
        const flowNodeId =
            crypto.randomUUID();
        try {
            await postNodeAddition({
                nodeId,
                flowNodeId,
                flowId:
                    this.#state.flowId,
                name: 'New State',
                positionX: x,
                positionY: y,
            });
        } catch {
            showToast(
                'Failed to add state',
                'error',
            );
            return false;
        }
        this.#state.nodes.push({
            id: nodeId,
            name: 'New State',
            description: '',
            positionX: x,
            positionY: y,
            isStart: false,
            isComplete: false,
            fields: [],
        });
        this.#undo.push({
            type: 'add-node',
            forward: [],
            reverse: [
                {
                    op: 'delete',
                    resource:
                        'wf-flow-nodes/'
                        + flowNodeId,
                },
                {
                    op: 'delete',
                    resource:
                        `wf-nodes/${nodeId}`,
                },
            ],
        });
        return true;
    }

    async addEdge(
        fromId: string,
        toId: string,
    ): Promise<boolean> {
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
        const edgeId = crypto.randomUUID();
        const nodeEdgeId =
            crypto.randomUUID();
        try {
            await postEdgeConnection({
                edgeId,
                nodeEdgeId,
                name: 'Transition',
                fromNodeId: fromId,
                toNodeId: toId,
            });
        } catch {
            showToast(
                'Failed to create transition',
                'error',
            );
            return false;
        }
        this.#state.edges.push({
            id: edgeId,
            name: 'Transition',
            description: '',
            fromNodeId: fromId,
            toNodeId: toId,
        });
        this.#undo.push({
            type: 'add-edge',
            forward: [],
            reverse: [
                {
                    op: 'delete',
                    resource:
                        'wf-node-edges/'
                        + nodeEdgeId,
                },
                {
                    op: 'delete',
                    resource:
                        `wf-edges/${edgeId}`,
                },
            ],
        });
        return true;
    }

    async deleteSelectedNode(
    ): Promise<boolean> {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return false;
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
        } catch {
            showToast(
                'Failed to delete state',
                'error',
            );
            return false;
        }
        this.#state
            .interaction
            .selectedNodeId = null;
        return true;
    }

    async deleteSelectedEdge(
    ): Promise<boolean> {
        const edgeId =
            this.#state
                .interaction
                .selectedEdgeId;
        if (edgeId === null) return false;
        try {
            const capture =
                await deleteEdgeCapture(
                    edgeId,
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
        } catch {
            showToast(
                'Failed to delete transition',
                'error',
            );
            return false;
        }
        this.#state
            .interaction
            .selectedEdgeId = null;
        return true;
    }

    relayout(): void {
        const oldPositions: UndoStep[] =
            this.#state.nodes.map(n => ({
                op: 'put' as const,
                resource:
                    `wf-nodes/${n.id}`,
                body: {
                    position_x: n.positionX,
                    position_y: n.positionY,
                },
            }));
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
        const newPositions: UndoStep[] = [];
        for (
            const node of this.#state.nodes
        ) {
            const pos =
                positions.get(node.id);
            if (!pos) continue;
            node.positionX = pos.x;
            node.positionY = pos.y;
            newPositions.push({
                op: 'put',
                resource:
                    `wf-nodes/${node.id}`,
                body: {
                    position_x: pos.x,
                    position_y: pos.y,
                },
            });
            void putNode(node.id, {
                position_x: pos.x,
                position_y: pos.y,
            });
        }
        this.#undo.push({
            type: 'relayout',
            forward: newPositions,
            reverse: oldPositions,
        });
    }

    updateNodeName(
        name: string,
    ): void {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const oldName = node.name;
        node.name = name;
        const resource =
            `wf-nodes/${nodeId}`;
        this.#undo.push({
            type: 'update-node-name',
            forward: [{
                op: 'put', resource,
                body: { name },
            }],
            reverse: [{
                op: 'put', resource,
                body: { name: oldName },
            }],
        });
        void putNode(nodeId, { name });
    }

    updateNodeDescription(
        desc: string,
    ): void {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return;
        const oldDesc = node.description;
        node.description = desc;
        const resource =
            `wf-nodes/${nodeId}`;
        this.#undo.push({
            type: 'update-node-desc',
            forward: [{
                op: 'put', resource,
                body: { description: desc },
            }],
            reverse: [{
                op: 'put', resource,
                body: {
                    description: oldDesc,
                },
            }],
        });
        void putNode(
            nodeId, { description: desc },
        );
    }

    updateEdgeName(
        name: string,
    ): void {
        const edgeId =
            this.#state
                .interaction
                .selectedEdgeId;
        if (edgeId === null) return;
        const edge = this.#state.edges.find(
            e => e.id === edgeId,
        );
        if (!edge) return;
        const oldName = edge.name;
        edge.name = name;
        const resource =
            `wf-edges/${edgeId}`;
        this.#undo.push({
            type: 'update-edge-name',
            forward: [{
                op: 'put', resource,
                body: { name },
            }],
            reverse: [{
                op: 'put', resource,
                body: { name: oldName },
            }],
        });
        void putWfEdge(edgeId, { name });
    }

    updateEdgeDescription(
        desc: string,
    ): void {
        const edgeId =
            this.#state
                .interaction
                .selectedEdgeId;
        if (edgeId === null) return;
        const edge = this.#state.edges.find(
            e => e.id === edgeId,
        );
        if (!edge) return;
        const oldDesc = edge.description;
        edge.description = desc;
        const resource =
            `wf-edges/${edgeId}`;
        this.#undo.push({
            type: 'update-edge-desc',
            forward: [{
                op: 'put', resource,
                body: { description: desc },
            }],
            reverse: [{
                op: 'put', resource,
                body: {
                    description: oldDesc,
                },
            }],
        });
        void putWfEdge(
            edgeId, { description: desc },
        );
    }

    async addField(
        name: string,
        fieldType: string,
        isRequired: boolean,
        options: string[],
    ): Promise<boolean> {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return false;
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (!node) return false;
        const sortOrder = node.fields.length;
        const fieldId = crypto.randomUUID();
        const nodeFieldId =
            crypto.randomUUID();
        try {
            await postFieldAddition({
                fieldId,
                nodeFieldId,
                nodeId,
                name,
                fieldType,
                sortOrder,
                isRequired,
                options,
            });
        } catch {
            showToast(
                'Failed to add field',
                'error',
            );
            return false;
        }
        node.fields.push({
            id: fieldId,
            name,
            fieldType,
            sortOrder,
            isRequired,
            options,
        });
        this.#undo.push({
            type: 'add-field',
            forward: [],
            reverse: [
                {
                    op: 'delete',
                    resource:
                        'wf-node-fields/'
                        + nodeFieldId,
                },
                {
                    op: 'delete',
                    resource:
                        'wf-fields/'
                        + fieldId,
                },
            ],
        });
        return true;
    }

    async deleteField(
        fieldId: string,
    ): Promise<boolean> {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return false;
        try {
            const capture =
                await deleteFieldCapture(
                    fieldId, nodeId,
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
        } catch {
            showToast(
                'Failed to delete field',
                'error',
            );
            return false;
        }
        return true;
    }

    selectedNodeName(): string {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return '';
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        return node?.name ?? '';
    }

    async addNodeWithEdge(
        name: string,
        transitionName: string,
        direction: string,
    ): Promise<boolean> {
        const fromNodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (fromNodeId === null) return false;
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
        const flowNodeId =
            crypto.randomUUID();
        const edgeId = crypto.randomUUID();
        const nodeEdgeId =
            crypto.randomUUID();

        try {
            await postNodeAddition({
                nodeId,
                flowNodeId,
                flowId:
                    this.#state.flowId,
                name,
                positionX: pos.x,
                positionY: pos.y,
            });
            await postEdgeConnection({
                edgeId,
                nodeEdgeId,
                name: transitionName,
                fromNodeId,
                toNodeId: nodeId,
            });
        } catch {
            showToast(
                'Failed to add state',
                'error',
            );
            return false;
        }
        this.#state.nodes.push({
            id: nodeId,
            name,
            description: '',
            positionX: pos.x,
            positionY: pos.y,
            isStart: false,
            isComplete: false,
            fields: [],
        });
        this.#state.edges.push({
            id: edgeId,
            name: transitionName,
            description: '',
            fromNodeId,
            toNodeId: nodeId,
        });
        this.#undo.push({
            type: 'add-node-and-edge',
            forward: [],
            reverse: [
                {
                    op: 'delete',
                    resource:
                        'wf-node-edges/'
                        + nodeEdgeId,
                },
                {
                    op: 'delete',
                    resource:
                        `wf-edges/${edgeId}`,
                },
                {
                    op: 'delete',
                    resource:
                        'wf-flow-nodes/'
                        + flowNodeId,
                },
                {
                    op: 'delete',
                    resource:
                        `wf-nodes/${nodeId}`,
                },
            ],
        });
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
        );
    }

    zoomOut(): void {
        zoomOutState(
            this.#state.interaction,
        );
    }

    zoomToFit(): void {
        this.#applyZoomToFit();
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
        );
    }

    #buildToolbar(): SafeHtml {
        const nodeCount =
            this.#state.nodes.length;
        const edgeCount =
            this.#state.edges.length;
        const stats = String(nodeCount)
            + ' state'
            + (nodeCount !== 1 ? 's' : '')
            + ' \u00b7 '
            + String(edgeCount)
            + ' transition'
            + (edgeCount !== 1 ? 's' : '');
        return html`<div
class="wf-toolbar">
<div class="wf-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    id="flow-back-btn"
    >${iconArrowLeft(20, '')}</button>
</div>
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
<div class="wf-toolbar-group">
<button class="btn btn-primary btn-sm"
    data-action="add-state"${
    trusted(
        this.#state.interaction
            .selectedNodeId !== null
            ? '' : ' disabled',
    )}>+ Add State</button>
</div>
<div class="wf-toolbar-group">
<button class="btn btn-ghost btn-sm"
    data-action="re-layout"
    >Re-layout</button>
<button class="btn btn-ghost btn-sm"
    data-action="zoom-in"
    >Zoom +</button>
<button class="btn btn-ghost btn-sm"
    data-action="zoom-out"
    >Zoom \u2212</button>
<button class="btn btn-ghost btn-sm"
    data-action="fit">Fit</button>
</div>
<div class="wf-toolbar-group">
<span class="text-muted text-sm"
    >${stats}</span>
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
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return html``;
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
<h3 class="text-sm font-semibold mb-3"
    >${kind} State</h3>
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
<h3 class="text-sm font-semibold mb-3"
    >State Properties</h3>
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
<button
class="btn btn-destructive btn-sm mt-4"
data-action="delete-node"
>Delete State</button>
</div>`;
    }

    #buildEdgePanel(
        edge: GraphEdge,
        fromNode: GraphNode | undefined,
        toNode: GraphNode | undefined,
    ): SafeHtml {
        const fromName =
            fromNode?.name ?? '\u2014';
        const toName =
            toNode?.name ?? '\u2014';
        return html`<div
class="wf-props-panel">
<h3 class="text-sm font-semibold mb-3"
    >Transition Properties</h3>
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
<button
class="btn btn-destructive btn-sm mt-4"
data-action="delete-edge"
>Delete Transition</button>
</div>`;
    }

    #buildPropsPanel(): SafeHtml {
        const interaction =
            this.#state.interaction;
        const selNodeId =
            interaction.selectedNodeId;
        const selEdgeId =
            interaction.selectedEdgeId;

        if (selNodeId !== null) {
            const node =
                this.#state.nodes.find(
                    n => n.id === selNodeId,
                );
            if (!node) return html``;
            const outgoing =
                this.#state.edges.filter(
                    e => e.fromNodeId
                        === selNodeId,
                );
            return this.#buildNodePanel(
                node, outgoing,
            );
        }

        if (selEdgeId !== null) {
            const edge =
                this.#state.edges.find(
                    e => e.id === selEdgeId,
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

    #buildConnectPreview(): string {
        const interaction =
            this.#state.interaction;
        if (!interaction.isConnecting) {
            return '';
        }
        if (!interaction.connectFromNodeId) {
            return '';
        }
        const fromNode =
            this.#state.nodes.find(
                n => n.id
                    === interaction
                        .connectFromNodeId,
            );
        if (!fromNode) return '';
        const startX =
            fromNode.positionX + NODE_WIDTH;
        const startY =
            fromNode.positionY
            + NODE_HEIGHT / 2;
        const endX =
            interaction.connectToX;
        const endY =
            interaction.connectToY;
        return '<line'
            + ' x1="' + String(startX) + '"'
            + ' y1="' + String(startY) + '"'
            + ' x2="' + String(endX) + '"'
            + ' y2="' + String(endY) + '"'
            + ' stroke="#4B6CA1"'
            + ' stroke-width="2"'
            + ' stroke-dasharray="6 3"'
            + ' opacity="0.6"/>';
    }

    #nodesForRender(): GraphNode[] {
        const interaction =
            this.#state.interaction;
        if (
            !interaction.isDragging
            || !interaction.dragNodeId
        ) {
            return this.#state.nodes;
        }
        return this.#state.nodes.map(n => {
            if (
                n.id
                !== interaction.dragNodeId
            ) {
                return n;
            }
            return {
                ...n,
                positionX:
                    interaction.dragCurrentX,
                positionY:
                    interaction.dragCurrentY,
            };
        });
    }

    #buildCanvas(): SafeHtml {
        const nodes = this.#nodesForRender();
        const vb =
            this.#state.interaction.viewBox;
        const svgHtml = buildGraphSvg(
            nodes,
            this.#state.edges,
            vb.x,
            vb.y,
            vb.w,
            vb.h,
            this.#state
                .interaction
                .selectedNodeId,
            this.#state
                .interaction
                .selectedEdgeId,
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

    #buildAddStateDialog(): SafeHtml {
        const selNodeId =
            this.#state.interaction
                .selectedNodeId;
        const selNode = selNodeId
            !== null
            ? this.#state.nodes.find(
                n => n.id === selNodeId,
            )
            : undefined;
        const fromName =
            selNode?.name ?? '';
        const dirStyle =
            'padding:0.5rem;'
            + 'border-radius:6px;'
            + 'cursor:pointer;'
            + 'text-align:center';
        return html`<div
class="dialog-backdrop hidden"
id="add-state-backdrop">
<div class="dialog hidden"
    id="add-state-dialog"
    aria-hidden="true"
    style="max-width:28rem">
<div style="${
    'padding:1.5rem;'
    + 'border-bottom:1px solid'
    + ' hsl(var(--border))'
}">
<h3 class="text-lg font-display font-semibold"
    >Add State</h3>
<p class="text-sm text-muted"
    >Connected from <strong
    >${fromName}</strong></p>
</div>
<div style="${
    'padding:1.5rem;'
    + 'display:flex;'
    + 'flex-direction:column;'
    + 'gap:1rem'
}">
<div>
<label class="label mb-1"
    for="add-state-name"
    >State Name</label>
<input class="input"
    id="add-state-name"
    placeholder="e.g., Approved" />
</div>
<div>
<label class="label mb-1"
    for="add-state-transition"
    >Transition Name</label>
<input class="input"
    id="add-state-transition"
    placeholder="e.g., approve" />
</div>
<div>
<label class="label mb-1"
    >Placement Direction</label>
<div style="${
    'display:grid;'
    + 'grid-template-columns:1fr 1fr;'
    + 'gap:0.5rem'
}">
<button class="btn btn-outline active"
    data-direction="right"
    style="${dirStyle}"
    >\u2192 Right</button>
<button class="btn btn-outline"
    data-direction="left"
    style="${dirStyle}"
    >\u2190 Left</button>
<button class="btn btn-outline"
    data-direction="above"
    style="${dirStyle}"
    >\u2191 Above</button>
<button class="btn btn-outline"
    data-direction="below"
    style="${dirStyle}"
    >\u2193 Below</button>
</div>
</div>
</div>
<div style="${
    'padding:1rem 1.5rem;'
    + 'border-top:1px solid'
    + ' hsl(var(--border));'
    + 'display:flex;'
    + 'justify-content:flex-end;'
    + 'gap:0.75rem'
}">
<button class="btn btn-outline"
    id="add-state-cancel"
    >Cancel</button>
<button class="btn btn-primary"
    id="add-state-submit"
    >Add State</button>
</div>
</div>
</div>`;
    }
}
