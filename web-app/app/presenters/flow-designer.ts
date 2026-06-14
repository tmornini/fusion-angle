import {
    html, setHtml,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import { $required } from '../dom.ts';
import { showToast } from '../toast.ts';
import {
    sessionContext,
    putFlowOps,
    postFlowVersionOps,
    notifyFlowChange,
    HumanMember,
    AIMember,
} from '../adapters/index.ts';
import type {
    RequestContext,
} from '../adapters/shared.ts';
import { reportFault } from '../error-helpers.ts';
import type {
    GraphNode,
    GraphEdge,
    FlowGraph,
    FlowSaveShape,
} from '../adapters/flows.ts';
import type {
    MemberId,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
    type RecordAttribute,
} from '../adapters/index.ts';
import {
    buildGraphSvg,
    buildConnectPreview,
} from '../flow-graph.ts';
import {
    NODE_WIDTH,
    NODE_HEIGHT,
} from '../flow-layout.ts';
import {
    buildInteractionState,
    zoomIn as zoomInState,
    zoomOut as zoomOutState,
    fitBoxToCanvas,
    nodeBoundsBox,
    marqueeDrawRect,
} from '../flow-interactions.ts';
import type {
    InteractionState,
    FlowGestureContext,
    FitBox,
} from '../flow-interactions.ts';
import {
    canUndoFlowEdits,
    canRedoFlowEdits,
    recordFlowMutation,
} from '../flow-history.ts';
import type {
    FlowHistorySnapshot,
} from '../flow-history.ts';
import {
    applyMoveNodes,
    applyDragPreview,
    applyToggleLock,
    applyUpdateFlowName,
    applyUpdateNode,
    applyUpdateEdge,
    applyAutoLayout,
    applyPanToRevealSelected,
    applyPanelTransition,
} from '../flow-designer-actions.ts';
import type {
    Waypoint,
    SavedViewBox,
} from '../flow-designer-actions.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconBarChart,
} from '../icons.ts';
import {
    buildToolbar,
    buildNodePanel,
    buildEdgePanel,
    buildFlowNameHeader,
} from './flow-designer-view.ts';

interface DesignerState {
    flowId: string;
    flowName: string;
    isLocked: boolean;
    isAutoLayout: boolean;
    isAutoFit: boolean;
    lockTimeout: number;
    isEditingName: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
    edgeWaypoints: Map<string, Waypoint[]>;
    isPanelOpen: boolean;
    interaction: InteractionState;
    savedViewBox: SavedViewBox;
    humanMembers: HumanMember[];
    aiMembers: AIMember[];
    recordAttributes: RecordAttribute[];
}

export type FlowSnapshot = Readonly<DesignerState>;

function emptyWaypoints(
): Map<string, Waypoint[]> {
    return new Map<string, Waypoint[]>();
}

export function buildInitialFlowSnapshot(
    graph: FlowGraph,
    canvasW: number,
    canvasH: number,
    humanMembers: HumanMember[],
    aiMembers: AIMember[],
    recordAttributes:
        RecordAttribute[],
): FlowSnapshot {
    const interaction = buildInteractionState(
        canvasW, canvasH,
    );
    return {
        flowId: graph.id,
        flowName: graph.name,
        isLocked: graph.isLocked,
        isAutoLayout: graph.isAutoLayout,
        isAutoFit: graph.isAutoFit,
        lockTimeout: graph.lockTimeout,
        isEditingName: false,
        nodes: graph.nodes,
        edges: graph.edges,
        edgeWaypoints: emptyWaypoints(),
        isPanelOpen: false,
        interaction,
        savedViewBox: { kind: 'none' },
        humanMembers,
        aiMembers,
        recordAttributes,
    };
}

// Must match .flow-props-panel width in pages-flow-detail.css
// (18rem = 288px at 16px root).
const PANEL_WIDTH_PX = 288;

export class FlowDesignerPresenter {
    readonly #snapshot: FlowSnapshot;
    #canvasW: number;
    #canvasH: number;
    #needsFit: boolean;
    #history: FlowHistorySnapshot;

    constructor(
        snap: FlowSnapshot,
        canvasW: number,
        canvasH: number,
        history: FlowHistorySnapshot,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        this.#needsFit = true;
        this.#history = history;
        this.#snapshot =
            this.#computeMigrateToCenter(snap);
    }

    history(): FlowHistorySnapshot {
        return this.#history;
    }

    #noteMutation(): void {
        this.#history = recordFlowMutation();
    }

    #buildSaveShape(
        snap: FlowSnapshot,
    ): FlowSaveShape {
        return {
            name: snap.flowName,
            isLocked: snap.isLocked,
            isAutoLayout: snap.isAutoLayout,
            isAutoFit: snap.isAutoFit,
            lockTimeout: snap.lockTimeout,
            nodes: snap.nodes,
            edges: snap.edges,
        };
    }

    #saveChain: Promise<void> = Promise.resolve();

    // Saves are SERIALIZED on one promise chain, so
    // concurrent gestures can never reorder against
    // each other; a failed save surfaces through
    // reportFault and the chain survives for the
    // saves queued behind it.
    #queueSave(
        versioned: boolean,
        snap: FlowSnapshot,
    ): void {
        this.#saveChain = this.#saveChain.then(
            async () => {
                const ctx = sessionContext();
                try {
                    await this.#persistFlow(
                        ctx, versioned, snap,
                    );
                } catch (err) {
                    reportFault(
                        ctx,
                        'Failed to save flow',
                        err,
                    );
                }
            },
        );
    }

    // The version snapshot and the flow write land
    // as ONE atomic commit batch — a fault applies
    // neither.
    async #persistFlow(
        ctx: RequestContext,
        versioned: boolean,
        snap: FlowSnapshot,
    ): Promise<void> {
        const ops = [
            ...versioned
                ? await postFlowVersionOps(
                    ctx,
                    generateCryptoSafeBase62(),
                    snap.flowId,
                )
                : [],
            ...await putFlowOps(
                ctx,
                snap.flowId,
                this.#buildSaveShape(snap),
            ),
        ];
        await ctx.commit({ ops });
        notifyFlowChange();
    }

    withNameEditing(
        editing: boolean,
    ): FlowSnapshot {
        if (editing && this.#guardLocked()) {
            return this.#snapshot;
        }
        return {
            ...this.#snapshot,
            isEditingName: editing,
        };
    }

    isLocked(): boolean {
        return this.#snapshot.isLocked;
    }

    withLockToggled(): FlowSnapshot {
        const result = applyToggleLock(
            this.#snapshot.isLocked,
            this.#snapshot.isEditingName,
        );
        const next = {
            ...this.#snapshot,
            isLocked: result.isLocked,
            isEditingName: result.isEditingName,
        };
        this.#queueSave(false, next);
        return next;
    }

    isAutoLayout(): boolean {
        return this.#snapshot.isAutoLayout;
    }

    withAutoLayoutToggled(): FlowSnapshot {
        const toggled =
            !this.#snapshot.isAutoLayout;
        let next: FlowSnapshot = {
            ...this.#snapshot,
            isAutoLayout: toggled,
        };
        this.#queueSave(false, next);
        if (toggled) {
            next = this.#applyLayoutReconcile(next);
        }
        return next;
    }

    isAutoFit(): boolean {
        return this.#snapshot.isAutoFit;
    }

    buildGestureContext(
    ): FlowGestureContext {
        return {
            isAutoFit:
                this.#snapshot.isAutoFit,
            isLocked:
                this.#snapshot.isLocked,
        };
    }

    withAutoFitToggled(): FlowSnapshot {
        const toggled = !this.#snapshot.isAutoFit;
        const next: FlowSnapshot = {
            ...this.#snapshot,
            isAutoFit: toggled,
        };
        this.#queueSave(false, next);
        if (toggled) {
            this.#applyZoomToFit(next);
        }
        return next;
    }

    #guardLocked(): boolean {
        if (!this.#snapshot.isLocked) {
            return false;
        }
        showToast(
            'Flow is locked', 'error',
        );
        return true;
    }

    #guardAutoFit(): boolean {
        if (!this.#snapshot.isAutoFit) {
            return false;
        }
        showToast(
            'Disable Auto-Fit to change the view',
            'error',
        );
        return true;
    }

    withFlowName(name: string): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const result = applyUpdateFlowName(name);
        const next: FlowSnapshot = {
            ...this.#snapshot,
            flowName: result.flowName,
            isEditingName: result.isEditingName,
        };
        this.#queueSave(true, next);
        this.#noteMutation();
        return next;
    }

    canUndo(): boolean {
        return canUndoFlowEdits(this.#history);
    }

    canRedo(): boolean {
        return canRedoFlowEdits(this.#history);
    }

    #computeMigrateToCenter(
        snap: FlowSnapshot,
    ): FlowSnapshot {
        const nodes = snap.nodes;
        if (nodes.length === 0) return snap;
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
        ) return snap;
        const next = {
            ...snap,
            nodes: nodes.map(n => ({
                ...n,
                positionX: n.positionX - centerX,
                positionY: n.positionY - centerY,
            })),
        };
        this.#queueSave(false, next);
        return next;
    }

    selectedNodeId(): string | null {
        return this
            .#singleSelectedNodeId();
    }

    selectedEdgeId(): string | null {
        const sel =
            this.#snapshot.interaction
                .selection;
        return sel.kind === 'edge'
            ? sel.edgeId
            : null;
    }

    #singleSelectedNodeId(
    ): string | null {
        const sel =
            this.#snapshot.interaction
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

    interactionState(): InteractionState {
        return this.#snapshot.interaction;
    }

    snapshot(): FlowSnapshot {
        return this.#snapshot;
    }

    withPanelOpen(open: boolean): FlowSnapshot {
        const next: FlowSnapshot = {
            ...this.#snapshot,
            isPanelOpen: open,
        };
        return this.#handlePanelTransition(next);
    }

    withInteractionState(
        state: InteractionState,
    ): FlowSnapshot {
        return {
            ...this.#snapshot,
            interaction: state,
        };
    }

    getNodePosition(id: string): {
        x: number;
        y: number;
        isDraggable: boolean;
    } {
        const node =
            this.#snapshot.nodes.find(
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
        return this.#snapshot.nodes.map(
            n => ({
                id: n.id,
                x: n.positionX,
                y: n.positionY,
            }),
        );
    }

    #panToRevealSelected(snap: FlowSnapshot): void {
        const sel = snap.interaction.selection;
        const edgeId =
            sel.kind === 'edge'
                ? sel.edgeId : null;
        const origin = applyPanToRevealSelected(
            snap.interaction.selection.kind
                === 'nodes'
                && snap.interaction.selection
                    .nodeIds.size === 1
                ? snap.interaction.selection
                    .nodeIds
                    .values().next().value
                    ?? null
                : null,
            edgeId,
            snap.nodes,
            snap.edges,
            snap.interaction.viewBox,
            this.#canvasW,
            PANEL_WIDTH_PX,
        );
        if (!origin) return;
        const vb = snap.interaction.viewBox;
        vb.x = origin.x;
        vb.y = origin.y;
    }

    #handlePanelTransition(
        snap: FlowSnapshot,
    ): FlowSnapshot {
        const result = applyPanelTransition(
            snap.isAutoFit,
            snap.isPanelOpen,
            snap.savedViewBox,
            snap.interaction.viewBox,
        );
        if (!result) return snap;
        const next: FlowSnapshot = {
            ...snap,
            savedViewBox: result.savedViewBox,
        };
        const vb = next.interaction.viewBox;
        vb.x = result.viewBox.x;
        vb.y = result.viewBox.y;
        vb.w = result.viewBox.w;
        vb.h = result.viewBox.h;
        if (result.shouldPanToReveal) {
            this.#panToRevealSelected(next);
        }
        return next;
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
    >${iconArrowLeft(ICON_SIZE.xl, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    id="flow-stats-btn"
    title="Stats"
    aria-label="Flow statistics"
    >${iconBarChart(ICON_SIZE.xl, '')}</button>
<div class="flex-1 flow-name-header-slot"
    ></div>
<div class="flow-binding-slot"></div>
<div class="flex flex-col gap-2">
<label class="${
    'flex items-center gap-2'
    + ' text-sm flow-lock-label'
}"><button class="switch"
    role="switch"
    aria-checked="false"
    aria-label="Locked"
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
    aria-label="Auto Layout"
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
    aria-label="Auto Fit"
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
            $required(id, container)
                .setAttribute(
                    'aria-checked',
                    String(value),
                );
        };
        set(
            '#flow-lock-switch',
            this.#snapshot.isLocked,
        );
        set(
            '#flow-auto-layout-switch',
            this.#snapshot.isAutoLayout,
        );
        set(
            '#flow-auto-fit-switch',
            this.#snapshot.isAutoFit,
        );
    }

    #updateNameHeader(
        container: HTMLElement,
    ): void {
        const nameHtml =
            buildFlowNameHeader(
                this.#snapshot.flowName,
                this.#snapshot.isEditingName,
            );
        setHtml(
            $required(
                '.flow-name-header-slot',
                container,
            ),
            nameHtml,
        );
    }

    #updateToolbar(
        container: HTMLElement,
    ): void {
        setHtml(
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
        setHtml(
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
        setHtml(
            $required(
                '.flow-canvas-host',
                container,
            ),
            this.#buildCanvas(),
        );
    }

    withNodesMoved(
        updates: Array<{
            nodeId: string;
            x: number;
            y: number;
        }>,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        if (updates.length === 0) {
            return this.#snapshot;
        }
        const moved: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyMoveNodes(
                this.#snapshot.nodes, updates,
            ),
        };
        this.#queueSave(true, moved);
        this.#noteMutation();
        return this.#applyLayoutReconcile(moved);
    }

    withLayoutReconciled(): FlowSnapshot {
        return this.#applyLayoutReconcile(
            this.#snapshot,
        );
    }

    withFitToBox(box: FitBox): FlowSnapshot {
        this.#applyFitToBox(this.#snapshot, box);
        return this.#snapshot;
    }

    withSelectionCentered(): FlowSnapshot {
        if (!this.#snapshot.isPanelOpen) {
            return this.#snapshot;
        }
        this.#panToRevealSelected(this.#snapshot);
        return this.#snapshot;
    }

    #applyLayoutReconcile(
        snap: FlowSnapshot,
    ): FlowSnapshot {
        let next = snap;
        if (
            next.isAutoLayout
            && !next.isLocked
        ) {
            next = this.#runAutoLayout(next);
        }
        if (next.isAutoFit) {
            this.#applyZoomToFit(next);
        }
        return next;
    }

    #runAutoLayout(
        snap: FlowSnapshot,
    ): FlowSnapshot {
        const result = applyAutoLayout(
            snap.nodes,
            snap.edges,
            this.#canvasW,
            this.#canvasH,
            snap.isPanelOpen,
            PANEL_WIDTH_PX,
        );
        const next: FlowSnapshot = {
            ...snap,
            nodes: result.nodes,
            edgeWaypoints: result.edgeWaypoints,
        };
        this.#queueSave(false, next);
        return next;
    }

    withNodeNamed(
        name: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return this.#snapshot;
        const next: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyUpdateNode(
                this.#snapshot.nodes,
                nodeId,
                { name: name.trim() },
            ),
        };
        this.#queueSave(true, next);
        this.#noteMutation();
        return next;
    }

    withNodeTaskInstructions(
        text: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return this.#snapshot;
        const next: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyUpdateNode(
                this.#snapshot.nodes,
                nodeId,
                { taskInstructions: text },
            ),
        };
        this.#queueSave(true, next);
        this.#noteMutation();
        return next;
    }

    withNodeMemberIds(
        memberIds: MemberId[],
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return this.#snapshot;
        const next: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyUpdateNode(
                this.#snapshot.nodes,
                nodeId,
                { memberIds },
            ),
        };
        this.#queueSave(true, next);
        this.#noteMutation();
        return next;
    }

    withEdgeNamed(
        name: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const sel =
            this.#snapshot.interaction
                .selection;
        if (sel.kind !== 'edge') {
            return this.#snapshot;
        }
        const next: FlowSnapshot = {
            ...this.#snapshot,
            edges: applyUpdateEdge(
                this.#snapshot.edges,
                sel.edgeId,
                { name: name.trim() },
            ),
        };
        this.#queueSave(true, next);
        this.#noteMutation();
        return next;
    }

    selectedNodeName(): string {
        const nodeId = this
            .#singleSelectedNodeId();
        if (!nodeId) return '';
        return this.#snapshot.nodes.find(
            n => n.id === nodeId,
        )!.name;
    }

    withZoomedIn(): FlowSnapshot {
        if (this.#guardAutoFit()) {
            return this.#snapshot;
        }
        const interaction = zoomInState(
            this.#snapshot.interaction,
            this.#selectedFocalPt(),
        );
        return {
            ...this.#snapshot,
            interaction,
        };
    }

    withZoomedOut(): FlowSnapshot {
        if (this.#guardAutoFit()) {
            return this.#snapshot;
        }
        const interaction = zoomOutState(
            this.#snapshot.interaction,
            this.#selectedFocalPt(),
        );
        return {
            ...this.#snapshot,
            interaction,
        };
    }

    #selectedFocalPt(): {
        x: number;
        y: number;
    } | null {
        const sel =
            this.#snapshot.interaction
                .selection;
        if (sel.kind === 'nodes') {
            const selectedNodes =
                this.#snapshot.nodes.filter(
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
                this.#snapshot.edges.find(
                    e => e.id
                        === sel.edgeId,
                )!;
            const from =
                this.#snapshot.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                )!;
            const to =
                this.#snapshot.nodes.find(
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

    withCanvasSize(
        w: number, h: number,
    ): FlowSnapshot {
        this.#canvasW = w;
        this.#canvasH = h;
        if (this.#needsFit) {
            this.#needsFit = false;
            this.#applyZoomToFit(this.#snapshot);
            return this.#snapshot;
        }
        const vb =
            this.#snapshot.interaction
                .viewBox;
        const centerX = vb.x + vb.w / 2;
        const centerY = vb.y + vb.h / 2;
        const z =
            this.#snapshot.interaction.zoom;
        vb.w = w / z;
        vb.h = h / z;
        vb.x = centerX - vb.w / 2;
        vb.y = centerY - vb.h / 2;
        return this.#snapshot;
    }

    #applyZoomToFit(snap: FlowSnapshot): void {
        const box = nodeBoundsBox(
            snap.nodes.map(n => ({
                x: n.positionX,
                y: n.positionY,
            })),
        );
        if (!box) return;
        this.#applyFitToBox(snap, box);
    }

    #applyFitToBox(
        snap: FlowSnapshot, box: FitBox,
    ): void {
        const panelOffset = snap.isPanelOpen
            ? PANEL_WIDTH_PX : 0;
        const result = fitBoxToCanvas(
            box,
            this.#canvasW,
            this.#canvasH,
            panelOffset,
        );
        snap.interaction.zoom = result.zoom;
        snap.interaction.viewBox =
            { ...result.viewBox };
    }

    #canDelete(): boolean {
        if (this.isLocked()) return false;
        const sel =
            this.#snapshot.interaction
                .selection;
        if (sel.kind === 'nodes') {
            for (const id of sel.nodeIds) {
                const n =
                    this.#snapshot.nodes.find(
                        nd => nd.id === id,
                    );
                if (
                    n
                    && !n.isCreate
                    && !n.isArchive
                ) {
                    return true;
                }
            }
            return false;
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

    withRecordAttributes(
        attributes:
            readonly RecordAttribute[],
    ): FlowSnapshot {
        return {
            ...this.#snapshot,
            recordAttributes: [...attributes],
        };
    }

    recordAttributes():
        readonly RecordAttribute[] {
        return this.#snapshot.recordAttributes;
    }

    #buildPropsPanel(): SafeHtml {
        if (!this.#snapshot.isPanelOpen) {
            return html``;
        }
        const sel =
            this.#snapshot.interaction.selection;

        const singleNodeId = this
            .#singleSelectedNodeId();
        if (singleNodeId) {
            const node =
                this.#snapshot.nodes.find(
                    n => n.id
                        === singleNodeId,
                )!;
            const outgoing =
                this.#snapshot.edges.filter(
                    e => e.fromNodeId
                        === singleNodeId,
                );
            return buildNodePanel(
                node, outgoing,
                this.#snapshot.isLocked,
                this.#snapshot.humanMembers,
                this.#snapshot.aiMembers,
                this.#snapshot.recordAttributes,
            );
        }

        if (sel.kind === 'edge') {
            const edge =
                this.#snapshot.edges.find(
                    e => e.id
                        === sel.edgeId,
                )!;
            const fromNode =
                this.#snapshot.nodes.find(
                    n => n.id
                        === edge.fromNodeId,
                )!;
            const toNode =
                this.#snapshot.nodes.find(
                    n => n.id
                        === edge.toNodeId,
                )!;
            return buildEdgePanel(
                edge, fromNode, toNode,
                this.#snapshot.isLocked,
            );
        }

        return html``;
    }

    #nodesForRender(): GraphNode[] {
        return applyDragPreview(
            this.#snapshot.nodes,
            this.#snapshot.interaction.drag,
        );
    }

    #buildCanvas(): SafeHtml {
        const nodes = this.#nodesForRender();
        const vb =
            this.#snapshot.interaction.viewBox;
        const isConn =
            this.#snapshot.interaction
                .connect.kind
                === 'connecting';
        const marqueeRect = marqueeDrawRect(
            this.#snapshot.interaction.marquee,
        );
        return buildGraphSvg(
            nodes,
            this.#snapshot.edges,
            vb.x,
            vb.y,
            vb.w,
            vb.h,
            this.#snapshot.interaction
                .selection,
            this.#snapshot.isLocked,
            isConn,
            marqueeRect,
            this.#snapshot.edgeWaypoints,
            buildConnectPreview(
                this.#snapshot.interaction
                    .connect,
                this.#snapshot.nodes,
                this.#snapshot.edges,
            ),
        );
    }

}
