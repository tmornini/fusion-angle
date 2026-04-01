import {
    html, setHtml, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import { showToast } from '../toast';
import {
    putWorkflow,
    putNode,
    putWfEdge,
    postNodeAddition,
    postEdgeConnection,
    postFieldAddition,
    deleteNode,
    deleteEdge,
    deleteField,
} from '../adapters';
import type {
    GraphNode,
    GraphEdge,
    GraphField,
    WorkflowGraph,
} from '../adapters/workflows';
import {
    buildGraphSvg,
} from '../workflow-graph';
import {
    computeLayout,
    NODE_WIDTH,
    NODE_HEIGHT,
    START_X,
    START_Y,
} from '../workflow-layout';
import {
    createInteractionState,
    zoomIn as zoomInState,
    zoomOut as zoomOutState,
    zoomToFit as zoomToFitState,
} from '../workflow-interactions';
import type {
    InteractionState,
} from '../workflow-interactions';

interface DesignerState {
    workflowId: string;
    workflowName: string;
    workflowDescription: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    interaction: InteractionState;
    hasUnsavedChanges: boolean;
}

export class FlowDesignerPresenter {
    #state: DesignerState;
    #canvasW: number;
    #canvasH: number;

    constructor(
        graph: WorkflowGraph,
        canvasW: number,
        canvasH: number,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        const interaction =
            createInteractionState(
                canvasW, canvasH,
            );
        this.#state = {
            workflowId: graph.id,
            workflowName: graph.name,
            workflowDescription:
                graph.description,
            nodes: graph.nodes,
            edges: graph.edges,
            interaction,
            hasUnsavedChanges: false,
        };
        this.#applyZoomToFit();
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

    workflowId(): string {
        return this.#state.workflowId;
    }

    interactionState(): InteractionState {
        return this.#state.interaction;
    }

    initDragPositions(): void {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return;
        for (const node of this.#state.nodes) {
            if (node.id !== nodeId) continue;
            this.#state
                .interaction
                .dragCurrentX =
                    node.positionX;
            this.#state
                .interaction
                .dragCurrentY =
                    node.positionY;
            break;
        }
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
        const content = html`<div
class="wf-designer">
<div class="wf-designer-header">
<h2 class="text-lg font-semibold"
    >${this.#state.workflowName}</h2>
<p class="text-sm text-muted"
    >${this.#state.workflowDescription}</p>
</div>
${toolbar}
${panel}
<div class="wf-canvas-wrap"
    >${canvas}</div>
</div>`;
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
        node.positionX = x;
        node.positionY = y;
        this.#state.hasUnsavedChanges = true;
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
        try {
            await postNodeAddition({
                nodeId,
                workflowId:
                    this.#state.workflowId,
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
        this.#state.hasUnsavedChanges = true;
        return true;
    }

    async addEdge(
        fromId: string,
        toId: string,
    ): Promise<boolean> {
        const edgeId = crypto.randomUUID();
        try {
            await postEdgeConnection({
                edgeId,
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
        this.#state.hasUnsavedChanges = true;
        return true;
    }

    async deleteSelectedNode(
    ): Promise<boolean> {
        const nodeId =
            this.#state
                .interaction
                .selectedNodeId;
        if (nodeId === null) return false;
        try {
            await deleteNode(
                nodeId,
                this.#state.workflowId,
            );
        } catch {
            showToast(
                'Failed to delete state',
                'error',
            );
            return false;
        }
        this.#state.nodes =
            this.#state.nodes.filter(
                n => n.id !== nodeId,
            );
        this.#state.edges =
            this.#state.edges.filter(
                e => e.fromNodeId !== nodeId
                    && e.toNodeId !== nodeId,
            );
        this.#state
            .interaction
            .selectedNodeId = null;
        this.#state.hasUnsavedChanges = true;
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
            await deleteEdge(edgeId);
        } catch {
            showToast(
                'Failed to delete transition',
                'error',
            );
            return false;
        }
        this.#state.edges =
            this.#state.edges.filter(
                e => e.id !== edgeId,
            );
        this.#state
            .interaction
            .selectedEdgeId = null;
        this.#state.hasUnsavedChanges = true;
        return true;
    }

    relayout(): void {
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
        this.#state.hasUnsavedChanges = true;
    }

    async persist(): Promise<boolean> {
        try {
            await this.#persistWorkflow();
        } catch {
            showToast(
                'Failed to save workflow',
                'error',
            );
            return false;
        }
        this.#state.hasUnsavedChanges = false;
        showToast(
            'Workflow saved', 'success',
        );
        return true;
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
        node.name = name;
        this.#state.hasUnsavedChanges = true;
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
        node.description = desc;
        this.#state.hasUnsavedChanges = true;
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
        edge.name = name;
        this.#state.hasUnsavedChanges = true;
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
        edge.description = desc;
        this.#state.hasUnsavedChanges = true;
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
        try {
            await postFieldAddition({
                fieldId,
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
        this.#state.hasUnsavedChanges = true;
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
            await deleteField(
                fieldId, nodeId,
            );
        } catch {
            showToast(
                'Failed to delete field',
                'error',
            );
            return false;
        }
        const node = this.#state.nodes.find(
            n => n.id === nodeId,
        );
        if (node) {
            node.fields =
                node.fields.filter(
                    f => f.id !== fieldId,
                );
        }
        this.#state.hasUnsavedChanges = true;
        return true;
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
        const saveDisabled =
            this.#state.hasUnsavedChanges
                ? '' : ' disabled';
        return html`<div
class="wf-toolbar">
<div class="wf-toolbar-group">
<button class="btn btn-primary btn-sm"
    data-action="add-state"
    >+ Add State</button>
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
<div class="wf-toolbar-group ml-auto">
<button
    class="btn btn-success btn-sm"
    data-action="save"${
    trusted(saveDisabled)
    }>Save</button>
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
        const deleteBtn = isSpecial
            ? html``
            : html`<button
class="btn btn-destructive btn-sm mt-4"
data-action="delete-node"
>Delete State</button>`;
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
${deleteBtn}
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

    async #persistWorkflow(): Promise<void> {
        await putWorkflow(
            this.#state.workflowId,
            {
                name:
                    this.#state.workflowName,
                description:
                    this.#state
                        .workflowDescription,
            },
        );
        for (
            const node of this.#state.nodes
        ) {
            await putNode(node.id, {
                name: node.name,
                description:
                    node.description,
                position_x: node.positionX,
                position_y: node.positionY,
            });
        }
        for (
            const edge of this.#state.edges
        ) {
            await putWfEdge(edge.id, {
                name: edge.name,
                description:
                    edge.description,
            });
        }
    }
}
