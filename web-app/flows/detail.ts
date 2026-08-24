import {
    $, $$, $input, $inputRequired, $required,
    $select,
} from '../app/dom.ts';
import { log } from '../app/logger.ts';
import { reportFault } from '../app/error-helpers.ts';
import { setHtml, html } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    navigateTo,
} from '../app/navigation.ts';
import {
    sessionContext,
    getFlowGraph,
    getFlowMermaid,
    getFlowZip,
    getHumanMembers,
    getAIMembers,
    getRecordEntities,
    getRecordForFlow,
    getRecordAttributesByRecord,
    postFlowRecordBinding,
    deleteFlowRecordForFlow,
    postClipboardCopy,
    subscribeResize,
    subscribeFlowChanges,
    type RequestContext,
} from '../app/adapters/index.ts';
import type {
    GraphEdge,
    GraphNode,
    MemberId,
    RecordAttributeId,
    RecordEntity,
    RecordId,
} from '../../api/types.ts';
import {
    postBlobDownload,
} from '../app/adapters/blob-download.ts';
import {
    bindInteractions,
    withCanvasFocusRestore,
    type FlowGestureContext,
    type InteractionState,
    type Selection,
} from '../app/flow-interactions.ts';
import {
    isGestureActive,
} from '../app/flow-fsm-reduce.ts';
import {
    renderGestureFrame,
} from '../app/flow-gesture-render.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from '../app/presenters/index.ts';
import {
    buildFlowHistorySnapshot,
    recordFlowMutation,
} from '../app/flow-history.ts';
import type {
    FlowHistorySnapshot,
} from '../app/flow-history.ts';
import {
    performAddEdge,
    performAddNodeAtPosition,
    performDeleteSelectedNodes,
    performDeleteSelectedEdge,
    performAddAttributeRef,
    performRemoveAttributeRef,
    performUpdateAttributeMode,
    performUpdateAttributeRequired,
    performUndo,
    performRedo,
} from '../app/flow-operations.ts';
import {
    applyAddAttributeRef,
    applyRemoveAttributeRef,
    applyUpdateAttributeMode,
    applyUpdateAttributeRequired,
} from '../app/flow-designer-actions.ts';
import { Debouncer } from '../app/debouncer.ts';

const FALLBACK_W = 800;
const FALLBACK_H = 600;
const SAVE_DELAY_MS = 800;

type PanelStateRef = { open: boolean };

class PageState {
    #projectId: string | undefined;
    readonly #interaction =
        new AbortController();
    readonly #saveDebouncer =
        new Debouncer(SAVE_DELAY_MS);
    readonly #panelStateRef: PanelStateRef =
        { open: false };
    #pushGestureContext:
        | ((next: FlowGestureContext) => void)
        | null = null;
    #presenter: FlowDesignerPresenter | null = null;

    saveDebouncer(): Debouncer {
        return this.#saveDebouncer;
    }

    panelStateRef(): PanelStateRef {
        return this.#panelStateRef;
    }

    projectId(): string | undefined {
        return this.#projectId;
    }

    setProjectId(id: string): void {
        this.#projectId = id;
    }

    signal(): AbortSignal {
        return this.#interaction.signal;
    }

    setPushGestureContext(
        fn: (next: FlowGestureContext) => void,
    ): void {
        this.#pushGestureContext = fn;
    }

    pushGestureContext(
        next: FlowGestureContext,
    ): void {
        if (this.#pushGestureContext) {
            this.#pushGestureContext(next);
        }
    }

    presenter(): FlowDesignerPresenter {
        if (!this.#presenter) {
            throw new Error(
                'pageState.presenter() called'
                + ' before setPresenter()',
            );
        }
        return this.#presenter;
    }

    setPresenter(
        p: FlowDesignerPresenter,
    ): void {
        this.#presenter = p;
    }

    #container: HTMLElement | null = null;
    #canvasW: number = FALLBACK_W;
    #canvasH: number = FALLBACK_H;
    #history: FlowHistorySnapshot =
        buildFlowHistorySnapshot(false);
    #gestureRaf: number | null = null;
    #pendingGestureState:
        InteractionState | null = null;

    gestureRaf(): number | null {
        return this.#gestureRaf;
    }

    setGestureRaf(
        handle: number | null,
    ): void {
        this.#gestureRaf = handle;
    }

    pendingGestureState(
    ): InteractionState | null {
        return this.#pendingGestureState;
    }

    setPendingGestureState(
        state: InteractionState | null,
    ): void {
        this.#pendingGestureState = state;
    }

    container(): HTMLElement {
        if (!this.#container) {
            throw new Error(
                'pageState.container() called'
                + ' before setContainer()',
            );
        }
        return this.#container;
    }

    setContainer(c: HTMLElement): void {
        this.#container = c;
    }

    canvasW(): number {
        return this.#canvasW;
    }

    canvasH(): number {
        return this.#canvasH;
    }

    setCanvasSize(w: number, h: number): void {
        this.#canvasW = w;
        this.#canvasH = h;
    }

    history(): FlowHistorySnapshot {
        return this.#history;
    }

    setHistory(h: FlowHistorySnapshot): void {
        this.#history = h;
    }
}

const pageState = new PageState();

function commit(
    next: FlowSnapshot,
    opts?: { advanceHistory?: boolean },
): void {
    if (opts?.advanceHistory) {
        pageState.setHistory(recordFlowMutation());
    }
    const presenter = new FlowDesignerPresenter(
        next,
        pageState.canvasW(),
        pageState.canvasH(),
        pageState.history(),
    );
    pageState.setPresenter(presenter);
    update(pageState.container());
}

async function handleAddEdge(
    fromId: string,
    toId: string,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performAddEdge(
        ctx, snap, fromId, toId,
    );
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current =
        pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        edges: [...current.edges, op.edge],
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function reportOpFailure(
    ctx: RequestContext,
    toast: string,
    toastVariant:
        | 'success' | 'error' | 'warning' | 'info',
    flowId: string,
): Promise<void> {
    showToast(toast, toastVariant);
    const g = await getFlowGraph(ctx, flowId);
    const current = pageState.presenter().snapshot();
    commit({
        ...current,
        flowName: g.name,
        isLocked: g.isLocked,
        lockTimeout: g.lockTimeout,
        nodes: g.nodes,
        edges: g.edges,
    });
}

// Fix wave (Phase 14 Task 8, post-Task-11-browser-regression):
// undo/redo no longer follow their own commit with a SAVE-
// TRIGGERING commitAndFit(...withLayoutReconciled()) — op.freshSnap
// already carries server-reconciled positions (performUndo/
// performRedo build it from getFlowGraph, whose
// withRenderableLayout ALWAYS recomputes fresh positions for an
// auto-layout flow, purely client-side, no write). A further
// reconcile-and-save was therefore redundant for display AND
// actively harmful for undo-as-replay: it landed its OWN
// document message pair immediately after every undo/redo, which the
// cursor (api/derive-flows.ts's resolveFlowUndoTarget) treats as
// a full, indistinguishable history step — so the NEXT undo
// click reverted that reconcile-only noise instead of reaching
// the user's actual prior edit (the Task 11 browser report's
// "Undo flips the toolbar but the canvas never visibly
// changes"). reconcileFitFromDom() alone still adjusts the
// VIEWPORT (zoom/pan) — a read-only, non-saving operation.
async function handleUndo(): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performUndo(
        sessionContext(), snap, pageState.history(),
    );
    if (op.kind === 'fail') {
        showToast(op.toast, op.toastVariant);
        return;
    }
    pageState.setHistory(op.newHistory);
    commit(op.freshSnap);
    reconcileFitFromDom();
}

async function handleRedo(): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performRedo(
        sessionContext(), snap, pageState.history(),
    );
    if (op.kind === 'fail') {
        showToast(op.toast, op.toastVariant);
        return;
    }
    pageState.setHistory(op.newHistory);
    commit(op.freshSnap);
    reconcileFitFromDom();
}

async function handleDeleteSelected(): Promise<void> {
    const sel = pageState.presenter()
        .snapshot().interaction.selection;
    if (sel.kind === 'nodes') {
        await handleDeleteSelectedNodes();
    } else if (sel.kind === 'edge') {
        await handleDeleteSelectedEdge();
    }
}

async function handleDeleteSelectedNodes(
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performDeleteSelectedNodes(
        ctx, snap,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: op.nodes,
        edges: op.edges,
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function handleDeleteSelectedEdge(
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performDeleteSelectedEdge(
        ctx, snap,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        edges: current.edges.filter(
            e => e.id !== op.edgeId,
        ),
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function handleAddAttributeRef(
    attributeId: RecordAttributeId,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performAddAttributeRef(
        ctx, snap, attributeId,
        'editable', false,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyAddAttributeRef(
            current.nodes, op.nodeId, op.ref,
        ),
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
}

async function handleRemoveAttributeRef(
    attributeId: RecordAttributeId,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performRemoveAttributeRef(
        ctx, snap, attributeId,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyRemoveAttributeRef(
            current.nodes, op.nodeId,
            op.attributeId,
        ),
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
}

async function handleUpdateAttributeMode(
    attributeId: RecordAttributeId,
    mode: 'editable' | 'readonly',
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performUpdateAttributeMode(
        ctx, snap, attributeId, mode,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyUpdateAttributeMode(
            current.nodes, op.nodeId,
            op.attributeId, op.mode,
        ),
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
}

async function handleUpdateAttributeRequired(
    attributeId: RecordAttributeId,
    isRequired: boolean,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performUpdateAttributeRequired(
        ctx, snap, attributeId,
        isRequired,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyUpdateAttributeRequired(
            current.nodes, op.nodeId,
            op.attributeId, op.isRequired,
        ),
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
}

async function handleAddNodeAtPosition(
    fromId: string,
    x: number,
    y: number,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const ctx = sessionContext();
    const op = await performAddNodeAtPosition(
        ctx, snap, fromId, x, y,
    );
    if (op.kind === 'fail') {
        await reportOpFailure(
            ctx, op.toast, op.toastVariant,
            snap.flowId,
        );
        return;
    }
    const current =
        pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: [...current.nodes, op.node],
        edges: [...current.edges, op.edge],
        isPanelOpen: false,
        interaction: {
            ...current.interaction,
            selection: {
                kind: 'nodes',
                nodeIds: new Set([op.selectId]),
            },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
        pageState.presenter().withLayoutReconciled(),
    );
}

export type CanvasFocus = {
    readonly kind: 'node' | 'edge';
    readonly id: string;
};

// The previously focused CANVAS item, if any. Null
// unless the active element sits inside the wrap and
// an ancestor carries data-node-id / data-edge-id —
// the panel, the name input, a <dialog>, and <body>
// all yield null, so nothing is stolen from them.
export function canvasFocusOf(
    active: Element | null,
    wrap: Element,
): CanvasFocus | null {
    if (
        active === null
        || active === wrap
        || !wrap.contains(active)
    ) {
        return null;
    }
    let current: Element | null = active;
    while (current && current !== wrap) {
        const nodeId =
            current.getAttribute('data-node-id');
        if (nodeId !== null) {
            return { kind: 'node', id: nodeId };
        }
        const edgeId =
            current.getAttribute('data-edge-id');
        if (edgeId !== null) {
            return { kind: 'edge', id: edgeId };
        }
        current = current.parentElement;
    }
    return null;
}

// Re-focus the same id in the rebuilt canvas — the
// previously FOCUSED id, never aria-current. A deleted
// id finds nothing and focus stays on <body>. The wrap
// is overflow: hidden, so a bare focus() would scroll
// the wrap against the viewBox camera — preventScroll
// is load-bearing. Call it only inside
// withCanvasFocusRestore — the focusin it fires would
// otherwise revert the selection the user just made.
export function restoreCanvasFocus(
    focus: CanvasFocus | null,
    wrap: Element,
): void {
    if (focus === null) return;
    const attrName = focus.kind === 'node'
        ? 'data-node-id'
        : 'data-edge-id';
    const els = wrap.querySelectorAll(
        '[' + attrName + ']',
    );
    for (const el of els) {
        if (
            el.getAttribute(attrName) !== focus.id
        ) {
            continue;
        }
        if (el instanceof SVGElement) {
            el.focus({ preventScroll: true });
        }
        return;
    }
}

function update(container: HTMLElement): void {
    pageState.saveDebouncer().flush();
    const presenter = pageState.presenter();
    const wrap = $(
        '.flow-canvas-wrap', container,
    );
    const focus = wrap === null
        ? null
        : canvasFocusOf(
            document.activeElement, wrap,
        );
    presenter.renderUpdate(container);
    if (wrap !== null) {
        withCanvasFocusRestore(wrap, () => {
            restoreCanvasFocus(focus, wrap);
        });
    }
    // Re-read: the restore can re-enter commit(), and
    // the pre-nested presenter installed here would
    // silently overwrite what the nested commit left.
    const settled = pageState.presenter();
    pageState.pushGestureContext(
        settled.buildGestureContext(),
    );
    pageState.setHistory(settled.history());
}

// One narrow paint per animation frame while a gesture
// is in flight: the latest FSM state wins, and the full
// rebuild at a gesture boundary cancels anything still
// pending, so a stale frame can never stomp the fresh
// canvas. The presenter snapshot deliberately stays at
// the gesture-start state; pointer-up lands the final
// state through commit() and a full rebuild.
function scheduleGestureFrame(
    state: InteractionState,
): void {
    pageState.setPendingGestureState(state);
    if (pageState.gestureRaf() !== null) {
        return;
    }
    pageState.setGestureRaf(
        requestAnimationFrame(
            paintGestureFrame,
        ),
    );
}

function paintGestureFrame(): void {
    pageState.setGestureRaf(null);
    const state =
        pageState.pendingGestureState();
    pageState.setPendingGestureState(null);
    if (!state) return;
    const svg = pageState.container()
        .querySelector('svg.flow-canvas');
    if (!(svg instanceof SVGSVGElement)) {
        return;
    }
    const snap =
        pageState.presenter().snapshot();
    renderGestureFrame(svg, state, {
        nodes: snap.nodes,
        edges: snap.edges,
        edgeWaypoints: snap.edgeWaypoints,
    });
}

function cancelGestureFrame(): void {
    const handle = pageState.gestureRaf();
    if (handle !== null) {
        cancelAnimationFrame(handle);
    }
    pageState.setGestureRaf(null);
    pageState.setPendingGestureState(null);
}

// Re-fit the camera to the geometry actually
// rendered — curves, waypoints, labels, markers —
// not merely the node rectangles. getBBox reports
// the content group's extent in content
// coordinates (independent of the current viewBox),
// so the provisional node-bounds fit that already
// painted is corrected to include everything that
// bows past the nodes. No-op unless Auto-Fit is on.
function reconcileFitFromDom(): void {
    const snap = pageState.presenter().snapshot();
    if (!snap.isAutoFit) return;
    const content = pageState.container()
        .querySelector('.flow-content');
    if (
        !(content instanceof SVGGraphicsElement)
    ) {
        return;
    }
    const bbox = content.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) {
        return;
    }
    commit(
        pageState.presenter().withFitToBox({
            minX: bbox.x,
            minY: bbox.y,
            maxX: bbox.x + bbox.width,
            maxY: bbox.y + bbox.height,
        }),
    );
}

// Commit a change that can alter the drawn graph,
// then re-fit the camera to the measured render —
// the correction the provisional node-fit cannot
// make. The re-fit no-ops when Auto Fit is off.
function commitAndFit(
    next: FlowSnapshot,
    opts?: { advanceHistory?: boolean },
): void {
    commit(next, opts);
    reconcileFitFromDom();
}

function bindFlowNameEdit(
    container: HTMLElement,
    signal: AbortSignal,
): void {
    const slot = $(
        '.flow-name-header-slot',
        container,
    );
    if (!slot) return;
    slot.addEventListener(
        'click',
        (e) => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const btn = target.closest(
                'button',
            );
            if (!btn) return;
            if (
                btn.id
                    === 'flow-name-edit-btn'
            ) {
                commit(
                    pageState.presenter()
                        .withNameEditing(true),
                );
                const input = $input(
                    '#flow-name-input',
                    container,
                );
                if (input) {
                    input.focus();
                    input.select();
                }
            } else if (
                btn.id
                    === 'flow-name-save-btn'
            ) {
                const name = $inputRequired(
                    '#flow-name-input',
                    container,
                ).value.trim();
                if (name.length === 0) {
                    showToast(
                        'Flow name is'
                        + ' required',
                        'error',
                    );
                    return;
                }
                commit(
                    pageState.presenter()
                        .withFlowName(name),
                    { advanceHistory: true },
                );
            } else if (
                btn.id
                    === 'flow-name-cancel-btn'
            ) {
                commit(
                    pageState.presenter()
                        .withNameEditing(false),
                );
            }
        },
        { signal },
    );
    slot.addEventListener(
        'keydown',
        (e) => {
            const target = e.target;
            if (
                !(
                    target instanceof
                    HTMLInputElement
                )
            ) return;
            if (
                target.id
                    !== 'flow-name-input'
            ) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                $(
                    '#flow-name-save-btn',
                    container,
                )?.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                $(
                    '#flow-name-cancel-btn',
                    container,
                )?.click();
            }
        },
        { signal },
    );
}

function bindSwitches(
    container: HTMLElement,
    signal: AbortSignal,
): void {
    $required(
        '#flow-lock-switch', container,
    ).addEventListener(
        'click',
        () => {
            commit(
                pageState.presenter()
                    .withLockToggled(),
            );
        },
        { signal },
    );
    $required(
        '#flow-auto-layout-switch',
        container,
    ).addEventListener(
        'click',
        () => {
            commit(
                pageState.presenter()
                    .withAutoLayoutToggled(),
            );
        },
        { signal },
    );
    $required(
        '#flow-auto-fit-switch',
        container,
    ).addEventListener(
        'click',
        () => {
            commitAndFit(
                pageState.presenter()
                    .withAutoFitToggled(),
            );
        },
        { signal },
    );
}

function bindBackButton(
    container: HTMLElement,
    signal: AbortSignal,
): void {
    $required('#flow-back-btn', container)
        .addEventListener(
            'click',
            () => {
                const pid =
                    pageState.projectId();
                if (pid) {
                    navigateTo(
                        'project-detail',
                        { projectId: pid },
                    );
                } else {
                    navigateTo('flows');
                }
            },
            { signal },
        );
}

// Navigate to the stats page for the current
// flow, preserving projectId if present.
function bindStatsButton(
    container: HTMLElement,
    flowId: string,
    signal: AbortSignal,
): void {
    const pid = pageState.projectId();
    $required('#flow-stats-btn', container)
        .addEventListener(
            'click',
            () => {
                navigateTo(
                    'flow-stats',
                    {
                        flowId,
                        ...(pid
                            ? { projectId: pid }
                            : {}),
                    },
                );
            },
            { signal },
        );
}

function bindCanvasInteractions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
    panelStateRef: PanelStateRef,
    signal: AbortSignal,
): void {
    const wrap = $(
        '.flow-canvas-wrap', container,
    );
    if (!(wrap instanceof HTMLElement)) {
        return;
    }
    const push = bindInteractions(
        wrap,
        (next) => {
            // Mid-gesture updates paint narrowly under
            // rAF; gesture boundaries (and everything
            // else) take the full commit path.
            if (
                isGestureActive(
                    pageState.presenter()
                        .interactionState(),
                )
                && isGestureActive(next)
            ) {
                scheduleGestureFrame(next);
                return;
            }
            cancelGestureFrame();
            const prevSelected = pageState
                .presenter().selectedNodeId();
            commit(
                pageState.presenter()
                    .withInteractionState(next),
            );
            reconcileFitFromDom();
            const nowSelected = pageState
                .presenter().selectedNodeId();
            const isPanelOpen = pageState
                .presenter().snapshot()
                .isPanelOpen;
            if (
                prevSelected !== nowSelected
                && nowSelected !== null
                && isPanelOpen
            ) {
                commit(
                    pageState.presenter()
                        .withSelectionCentered(),
                );
            }
        },
        (open) => {
            panelStateRef.open = open;
            commit(
                pageState.presenter()
                    .withPanelOpen(open),
            );
            reconcileFitFromDom();
        },
        (updates) => {
            commitAndFit(
                pageState.presenter()
                    .withNodesMoved(updates),
                { advanceHistory: true },
            );
        },
        (fromId, toId) => {
            void handleAddEdge(fromId, toId);
        },
        (fromId, x, y) => {
            void handleAddNodeAtPosition(
                fromId, x, y,
            );
        },
        (id) => pageState.presenter()
            .getNodePosition(id),
        () => pageState.presenter()
            .getAllNodes(),
        presenter.buildGestureContext(),
        signal,
    );
    pageState.setPushGestureContext(push);
}

function bindToolbarActions(
    container: HTMLElement,
    flowId: string,
    signal: AbortSignal,
): void {
    const slot = $(
        '.flow-toolbar-slot', container,
    );
    if (!slot) return;
    slot.addEventListener(
        'click',
        (e) => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const btn = target.closest(
                '[data-action]',
            );
            if (!btn) return;
            const action = btn.getAttribute(
                'data-action',
            );
            if (!action) return;
            if (action === 'undo') {
                void handleUndo();
            } else if (action === 'redo') {
                void handleRedo();
            } else if (action === 'zoom-in') {
                commit(
                    pageState.presenter()
                        .withZoomedIn(),
                );
            } else if (
                action === 'zoom-out'
            ) {
                commit(
                    pageState.presenter()
                        .withZoomedOut(),
                );
            } else if (
                action === 'copy-mermaid'
            ) {
                void handleCopyMermaid(flowId);
            } else if (
                action === 'export-zip'
            ) {
                void handleExportZip(flowId);
            } else if (
                action === 'delete-selected'
            ) {
                void handleDeleteSelected();
            }
        },
        { signal },
    );
}

async function handleCopyMermaid(
    flowId: string,
): Promise<void> {
    let text: string;
    try {
        text =
            await getFlowMermaid(
                sessionContext(), flowId,
            );
    } catch (err) {
        log.error(
            'getFlowMermaid failed',
            'flow-detail',
            err,
        );
        showToast(
            'Failed to export Mermaid',
            'error',
        );
        return;
    }
    try {
        await postClipboardCopy(text);
    } catch (err) {
        log.error(
            'clipboard write failed',
            'flow-detail',
            err,
        );
        showToast(
            'Failed to copy to clipboard',
            'error',
        );
        return;
    }
    showToast(
        'Mermaid copied to clipboard',
        'success',
    );
}

async function handleExportZip(
    flowId: string,
): Promise<void> {
    let result: {
        data: Uint8Array;
        name: string;
    };
    try {
        result =
            await getFlowZip(
                sessionContext(), flowId,
            );
    } catch (err) {
        log.error(
            'getFlowZip failed',
            'flow-detail',
            err,
        );
        showToast(
            'Failed to export flow',
            'error',
        );
        return;
    }
    const blob = new Blob(
        [result.data as
            unknown as ArrayBuffer],
        { type: 'application/zip' },
    );
    postBlobDownload(blob, result.name);
    showToast(
        'Flow exported',
        'success',
    );
}

function parseMemberIdsFromPanel(
    panelEl: HTMLElement,
): MemberId[] {
    const inputs = $$(
        'input[type="checkbox"][data-member-id]',
        panelEl,
    );
    const ids: MemberId[] = [];
    for (const input of inputs) {
        if (
            !(input instanceof
                HTMLInputElement)
        ) continue;
        if (!input.checked) continue;
        const id = input.getAttribute(
            'data-member-id',
        );
        if (id) ids.push(id);
    }
    return ids;
}

function bindPanelActions(
    container: HTMLElement,
    panelStateRef: PanelStateRef,
    signal: AbortSignal,
): void {
    const slot = $(
        '.flow-props-slot', container,
    );
    if (!slot) return;
    slot.addEventListener(
        'change',
        (e) => {
            const target = e.target;
            if (
                target instanceof
                    HTMLInputElement
                && target.type === 'checkbox'
                && target.hasAttribute(
                    'data-member-id',
                )
            ) {
                const panel = target.closest(
                    '#prop-node-members',
                );
                if (
                    !(panel instanceof HTMLElement)
                ) return;
                const memberIds =
                    parseMemberIdsFromPanel(
                        panel,
                    );
                commit(
                    pageState.presenter()
                        .withNodeMemberIds(
                            memberIds,
                        ),
                    { advanceHistory: true },
                );
                return;
            }
            if (
                target instanceof
                    HTMLSelectElement
                && target.id
                    === 'prop-node-attribute-picker'
            ) {
                const attributeId =
                    target.value;
                if (!attributeId) return;
                target.value = '';
                void handleAddAttributeRef(
                    attributeId,
                );
                return;
            }
            if (
                target instanceof
                    HTMLSelectElement
                && target.getAttribute(
                    'data-action',
                ) === 'update-attribute-mode'
            ) {
                const attributeId =
                    target.getAttribute(
                        'data-attribute-id',
                    );
                if (!attributeId) return;
                const mode =
                    target.value === 'readonly'
                        ? 'readonly' : 'editable';
                void handleUpdateAttributeMode(
                    attributeId, mode,
                );
                return;
            }
            if (
                target instanceof
                    HTMLInputElement
                && target.type === 'checkbox'
                && target.getAttribute(
                    'data-action',
                ) === 'update-attribute-required'
            ) {
                const attributeId =
                    target.getAttribute(
                        'data-attribute-id',
                    );
                if (!attributeId) return;
                void handleUpdateAttributeRequired(
                    attributeId,
                    target.checked,
                );
            }
        },
        { signal },
    );
    slot.addEventListener(
        'click',
        (e) => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const btn = target.closest(
                '[data-action]',
            );
            if (!btn) return;
            const action = btn.getAttribute(
                'data-action',
            );
            if (action === 'close-panel') {
                panelStateRef.open = false;
                commit(
                    pageState.presenter()
                        .withPanelOpen(false),
                );
                reconcileFitFromDom();
            } else if (
                action === 'remove-attribute-ref'
            ) {
                const attributeId =
                    btn.getAttribute(
                        'data-attribute-id',
                    );
                if (!attributeId) return;
                void handleRemoveAttributeRef(
                    attributeId,
                );
            }
        },
        { signal },
    );
    slot.addEventListener(
        'input',
        (e) => {
            const target = e.target;
            if (
                !(
                    target instanceof
                    HTMLInputElement
                )
                && !(
                    target instanceof
                    HTMLTextAreaElement
                )
            ) return;
            const id = target.id;
            const value = target.value;
            if (id === 'prop-node-name') {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeNamed(
                                nodeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-node-instructions'
            ) {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeTaskInstructions(
                                nodeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-edge-name'
            ) {
                const edgeId = pageState
                    .presenter().selectedEdgeId();
                if (edgeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withEdgeNamed(
                                edgeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            }
        },
        { signal },
    );
}

function renderBindingSlot(
    container: HTMLElement,
    records: readonly RecordEntity[],
    boundRecordId: RecordId | null,
): void {
    const slot = $(
        '.flow-binding-slot', container,
    );
    if (!slot) return;
    const sorted = [...records].toSorted(
        (a, b) => a.name.localeCompare(b.name),
    );
    setHtml(
        slot,
        html`<label
class="flow-binding-label text-sm">
<span class="text-muted">Record:</span>
<select
    class="input input-sm"
    id="flow-binding-select">
<option value=""${
    boundRecordId === null
        ? ' selected' : ''
}>(none)</option>
${sorted.map(r => html`<option
    value="${r.id}"${
    r.id === boundRecordId
        ? ' selected' : ''
}>${r.name}</option>`)}
</select>
</label>`,
    );
}

function bindBindingDropdown(
    container: HTMLElement,
    flowId: string,
    signal: AbortSignal,
): void {
    const select = $select(
        '#flow-binding-select', container,
    );
    if (!select) return;
    select.addEventListener(
        'change',
        () => {
            void handleBindRecord(
                flowId,
                select.value === ''
                    ? null : select.value,
            );
        },
        { signal },
    );
}

async function handleBindRecord(
    flowId: string,
    recordId: RecordId | null,
): Promise<void> {
    const ctx = sessionContext();
    // Four covenants — get, delete, bind, reload —
    // each owns its own try so a failure names the
    // step that broke (and any half-state left behind).
    let existing: RecordId | null;
    try {
        existing = await getRecordForFlow(
            ctx, flowId,
        );
    } catch (err) {
        reportFault(
            ctx,
            'Failed to read Record binding',
            err,
        );
        return;
    }
    if (existing === recordId) return;
    if (existing !== null) {
        try {
            await deleteFlowRecordForFlow(
                ctx, flowId,
            );
        } catch (err) {
            reportFault(
                ctx,
                'Failed to clear Record binding',
                err,
            );
            return;
        }
    }
    if (recordId !== null) {
        try {
            await postFlowRecordBinding(
                ctx, flowId, recordId,
            );
        } catch (err) {
            // Delete may already have cleared a prior
            // binding — name that half-state explicitly.
            reportFault(
                ctx,
                existing !== null
                    ? 'Prior Record binding cleared,'
                        + ' but new binding failed'
                    : 'Failed to bind Record',
                err,
            );
            return;
        }
    }
    let attributes: Awaited<
        ReturnType<
            typeof getRecordAttributesByRecord
        >
    >;
    if (recordId === null) {
        attributes = [];
    } else {
        try {
            attributes =
                await getRecordAttributesByRecord(
                    ctx, recordId,
                );
        } catch (err) {
            // Binding is already written; only the
            // attribute panel is stale.
            reportFault(
                ctx,
                'Record binding updated, but'
                + ' attributes failed to load',
                err,
            );
            return;
        }
    }
    commit(
        pageState.presenter()
            .withRecordAttributes(attributes),
    );
    showToast(
        'Record binding updated',
        'success',
    );
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const flowId =
        params?.flowId;
    if (params?.projectId) {
        pageState.setProjectId(
            params.projectId,
        );
    }
    if (!flowId) {
        navigateTo('flows');
        return;
    }
    const container = $required(
        '#flow-designer', document,
    );
    pageState.setContainer(container);

    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 1),
        fetch: () => loadFlowDesignerBundle(
            flowId,
        ),
        onData: loaded => onFlowLoaded(
            loaded, container, flowId,
        ),
    });
}

// Undo-as-replay (Phase 14 Task 8): no longer fetches
// getFlowVersions to seed hasUndoHistory — flow_versions stops
// being written on the live path entirely (Step 0), so that
// list would always be empty. getFlowGraph's own response now
// carries hasUndoHistory verbatim (FlowGraph.hasUndoHistory,
// api/derive-flows.ts's cheap document-message-pair-count
// approximation) — one fewer round-trip at load, not one more.
async function loadFlowDesignerBundle(
    flowId: string,
) {
    const ctx = sessionContext();
    const [
        graph,
        humanMembers, aiMembers,
        records, boundRecordId,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getHumanMembers(ctx),
        getAIMembers(ctx),
        getRecordEntities(ctx),
        getRecordForFlow(ctx, flowId),
    ]);
    const recordAttributes =
        boundRecordId
            ? await getRecordAttributesByRecord(
                ctx, boundRecordId,
            )
            : [];
    return {
        graph,
        humanMembers, aiMembers,
        records, boundRecordId,
        recordAttributes,
    };
}

function onFlowLoaded(
    loaded: Awaited<ReturnType<
        typeof loadFlowDesignerBundle
    >>,
    container: HTMLElement,
    flowId: string,
): void {
    pageState.setCanvasSize(FALLBACK_W, FALLBACK_H);
    pageState.setHistory(
        buildFlowHistorySnapshot(
            loaded.graph.hasUndoHistory,
        ),
    );

    const initialSnap =
        buildInitialFlowSnapshot(
            loaded.graph,
            FALLBACK_W,
            FALLBACK_H,
            loaded.humanMembers,
            loaded.aiMembers,
            loaded.recordAttributes,
        );
    // migrateToCenter=true ONLY here — this is the one
    // per-load construction, never the commit()-driven
    // per-render path (flow-designer.ts's constructor comment
    // has the full fix-wave-2 root cause).
    const presenter =
        new FlowDesignerPresenter(
            initialSnap,
            FALLBACK_W,
            FALLBACK_H,
            pageState.history(),
            true,
        );
    pageState.setPresenter(presenter);
    const panelStateRef =
        pageState.panelStateRef();
    panelStateRef.open = false;
    const signal = pageState.signal();
    presenter.renderShell(container);
    renderBindingSlot(
        container,
        loaded.records,
        loaded.boundRecordId,
    );
    bindBindingDropdown(
        container, flowId, signal,
    );
    bindBackButton(container, signal);
    bindStatsButton(container, flowId, signal);
    bindCanvasInteractions(
        container, presenter,
        panelStateRef, signal,
    );
    bindToolbarActions(
        container, flowId, signal,
    );
    bindPanelActions(
        container, panelStateRef, signal,
    );
    bindFlowNameEdit(
        container, signal,
    );
    bindSwitches(
        container, signal,
    );
    bindKeyboardShortcuts(
        panelStateRef, signal,
    );
    bindFlushOnLeave(signal);
    const initialWrap = $(
        '.flow-canvas-wrap', container,
    );
    if (initialWrap instanceof HTMLElement) {
        const w = initialWrap.clientWidth;
        const h = initialWrap.clientHeight;
        if (w > 0 && h > 0) {
            pageState.setCanvasSize(w, h);
            pageState.presenter()
                .withCanvasSize(w, h);
            commit(
                pageState.presenter()
                    .withLayoutReconciled(),
            );
            reconcileFitFromDom();
        }
    }
    subscribeResize(container, () => {
        const liveWrap = $(
            '.flow-canvas-wrap', container,
        );
        if (!(liveWrap instanceof HTMLElement)) {
            return;
        }
        const w = liveWrap.clientWidth;
        const h = liveWrap.clientHeight;
        if (w > 0 && h > 0) {
            pageState.setCanvasSize(w, h);
            pageState.presenter()
                .withCanvasSize(w, h);
            update(container);
            reconcileFitFromDom();
        }
    });

    // Cross-tab / external graph edits ring the same
    // flowChanges bell the list page already trusts.
    // Own putFlow notifies too — early-return when the
    // server graph already matches kills the echo. Full
    // <a href> navigation is the teardown seam.
    subscribeFlowChanges(() => {
        void refreshFlowFromServer(flowId);
    });
}

// True when the server graph + flags already match the
// live snapshot — own putFlow echo, or a no-op notify.
function serverGraphMatchesLive(
    graph: Awaited<
        ReturnType<typeof getFlowGraph>
    >,
    live: FlowSnapshot,
): boolean {
    return graph.name === live.flowName
        && graph.isLocked === live.isLocked
        && graph.isAutoLayout
            === live.isAutoLayout
        && graph.isAutoFit === live.isAutoFit
        && graph.lockTimeout
            === live.lockTimeout
        && JSON.stringify(graph.nodes)
            === JSON.stringify(live.nodes)
        && JSON.stringify(graph.edges)
            === JSON.stringify(live.edges);
}

// Drop selection only when the selected node/edge is
// gone; keep multi-select survivors that still exist.
function selectionStillPresent(
    selection: Selection,
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
): Selection {
    if (selection.kind === 'none') {
        return selection;
    }
    if (selection.kind === 'edge') {
        const exists = edges.some(
            e => e.id === selection.edgeId,
        );
        return exists
            ? selection
            : { kind: 'none' };
    }
    const alive = new Set(
        nodes.map(n => n.id),
    );
    const kept = new Set<string>();
    for (const id of selection.nodeIds) {
        if (alive.has(id)) {
            kept.add(id);
        }
    }
    if (kept.size === 0) {
        return { kind: 'none' };
    }
    return { kind: 'nodes', nodeIds: kept };
}

// Re-apply the server graph onto the live snapshot.
// Skips mid-gesture and pending property edits so a
// notify cannot stomp a drag or an unflushed input.
// Preserves selection/panel when entities still exist.
async function refreshFlowFromServer(
    flowId: string,
): Promise<void> {
    if (
        isGestureActive(
            pageState.presenter()
                .interactionState(),
        )
    ) {
        return;
    }
    // A debounced prop edit is still only in the DOM;
    // re-render would wipe it. The flush that follows
    // putFlow will ring this bell again with the save.
    if (pageState.saveDebouncer().isPending()) {
        return;
    }
    const ctx = sessionContext();
    let graph: Awaited<
        ReturnType<typeof getFlowGraph>
    >;
    try {
        graph = await getFlowGraph(ctx, flowId);
    } catch (err) {
        log.error(
            'flow detail refresh failed',
            'flow-detail',
            err,
        );
        return;
    }
    // Await yielded — re-check live hazards.
    if (
        isGestureActive(
            pageState.presenter()
                .interactionState(),
        )
    ) {
        return;
    }
    if (pageState.saveDebouncer().isPending()) {
        return;
    }
    const current =
        pageState.presenter().snapshot();
    if (serverGraphMatchesLive(graph, current)) {
        return;
    }
    const nextSelection = selectionStillPresent(
        current.interaction.selection,
        graph.nodes,
        graph.edges,
    );
    // Panel only meaningful while something is still
    // selected; drop it when the selection vanished.
    const isPanelOpen =
        current.isPanelOpen
        && nextSelection.kind !== 'none';
    pageState.panelStateRef().open = isPanelOpen;
    pageState.setHistory(
        buildFlowHistorySnapshot(
            graph.hasUndoHistory,
        ),
    );
    commit({
        ...current,
        flowName: graph.name,
        isLocked: graph.isLocked,
        isAutoLayout: graph.isAutoLayout,
        isAutoFit: graph.isAutoFit,
        lockTimeout: graph.lockTimeout,
        nodes: graph.nodes,
        edges: graph.edges,
        isPanelOpen,
        interaction: {
            ...current.interaction,
            selection: nextSelection,
        },
    });
}

// Every page leave is a full <a href> navigation, so a
// debounced property edit still inside its SAVE_DELAY_MS
// window would silently die with the document. Flush the
// pending save the moment the page hides.
function bindFlushOnLeave(
    signal: AbortSignal,
): void {
    window.addEventListener(
        'pagehide',
        () => pageState.saveDebouncer().flush(),
        { signal },
    );
    document.addEventListener(
        'visibilitychange',
        () => {
            if (
                document.visibilityState
                    === 'hidden'
            ) {
                pageState.saveDebouncer().flush();
            }
        },
        { signal },
    );
}

export type DesignerShortcut =
    | 'escape'
    | 'delete'
    | 'undo'
    | 'redo';

export interface DesignerShortcutInput {
    readonly key: string;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;
    readonly isEditableFocused: boolean;
    readonly isPanelOpen: boolean;
}

export function reduceDesignerShortcut(
    input: DesignerShortcutInput,
): DesignerShortcut | null {
    if (input.key === 'Escape') {
        return input.isPanelOpen ? 'escape' : null;
    }
    if (
        input.key === 'Delete'
        || input.key === 'Backspace'
    ) {
        return input.isEditableFocused
            ? null : 'delete';
    }
    if (!input.metaKey && !input.ctrlKey) return null;
    if (input.key !== 'z' && input.key !== 'Z') {
        return null;
    }
    if (input.isEditableFocused) return null;
    return input.shiftKey ? 'redo' : 'undo';
}

function bindKeyboardShortcuts(
    panelStateRef: PanelStateRef,
    signal: AbortSignal,
): void {
    document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            const active = document.activeElement;
            const shortcut = reduceDesignerShortcut({
                key: e.key,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                isEditableFocused:
                    active instanceof HTMLInputElement
                    || active instanceof
                        HTMLTextAreaElement
                    || active instanceof
                        HTMLSelectElement,
                isPanelOpen: panelStateRef.open,
            });
            if (shortcut === null) return;
            e.preventDefault();
            if (shortcut === 'escape') {
                panelStateRef.open = false;
                commit(
                    pageState.presenter()
                        .withPanelOpen(false),
                );
                reconcileFitFromDom();
            } else if (shortcut === 'delete') {
                void handleDeleteSelected();
            } else if (shortcut === 'undo') {
                void handleUndo();
            } else {
                void handleRedo();
            }
        },
        { signal },
    );
}
