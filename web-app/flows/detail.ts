import {
    $, $input, $inputRequired, $select,
    $textarea,
} from '../app/dom.ts';
import { log } from '../app/logger.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    navigateTo,
} from '../app/core.ts';
import {
    createRequestContext,
    getFlowGraph,
    getFlowMermaid,
    getFlowZip,
    getFlowVersions,
    getHumanWorkers,
    getAIWorkers,
    postClipboardCopy,
    subscribeResize,
} from '../app/adapters/index.ts';
import { getDbAdapter } from '../app/adapters/init.ts';
import type { WorkerId } from '../../api/types.ts';
import {
    downloadBlob,
} from '../app/adapters/blob-download.ts';
import {
    bindInteractions,
    type FlowGestureContext,
} from '../app/flow-interactions.ts';
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
    performAddField,
    performDeleteField,
    performUndo,
    performRedo,
} from '../app/flow-operations.ts';
import {
    applyAddField,
    applyDeleteField,
} from '../app/flow-designer-actions.ts';

const FALLBACK_W = 800;
const FALLBACK_H = 600;
const SAVE_DELAY_MS = 800;

// Unit 6a instrumentation: capture per-burst stats so
// the debouncer can be measured against frame budget and
// removed/lowered if it isn't earning its keep.
class Debouncer {
    #timer: ReturnType<
        typeof setTimeout
    > | undefined = undefined;
    #pending:
        | (() => void)
        | undefined = undefined;
    readonly #delayMs: number;
    #scheduleCount: number = 0;
    #burstStart: number = 0;

    constructor(delayMs: number) {
        this.#delayMs = delayMs;
    }

    schedule(fn: () => void): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
        } else {
            this.#scheduleCount = 0;
            this.#burstStart =
                performance.now();
        }
        this.#scheduleCount += 1;
        this.#pending = fn;
        const startedAt = this.#burstStart;
        const count = this.#scheduleCount;
        this.#timer = setTimeout(
            () => {
                this.#timer = undefined;
                this.#pending = undefined;
                const burstDurMs =
                    performance.now() - startedAt;
                const ratePerSec =
                    burstDurMs > 0
                        ? count / (burstDurMs / 1000)
                        : 0;
                const callStart =
                    performance.now();
                fn();
                const callDurMs =
                    performance.now() - callStart;
                log.info(
                    'flow save debouncer fire',
                    'debouncer',
                    {
                        delayMs: this.#delayMs,
                        burstSchedules: count,
                        burstDurMs:
                            Math.round(burstDurMs),
                        keystrokesPerSec:
                            Math.round(
                                ratePerSec * 10,
                            ) / 10,
                        callDurMs:
                            Math.round(
                                callDurMs * 100,
                            ) / 100,
                    },
                );
            },
            this.#delayMs,
        );
    }

    flush(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
        }
        const pending = this.#pending;
        this.#pending = undefined;
        if (pending !== undefined) {
            const callStart =
                performance.now();
            pending();
            const callDurMs =
                performance.now() - callStart;
            log.info(
                'flow save debouncer flush',
                'debouncer',
                {
                    callDurMs:
                        Math.round(
                            callDurMs * 100,
                        ) / 100,
                },
            );
        }
    }
}

type PanelStateRef = { open: boolean };

class PageState {
    #projectId: string | undefined;
    readonly #interaction =
        new AbortController();
    readonly #saveDebouncer =
        new Debouncer(SAVE_DELAY_MS);
    #pushGestureContext:
        | ((next: FlowGestureContext) => void)
        | null = null;
    #presenter: FlowDesignerPresenter | null = null;

    saveDebouncer(): Debouncer {
        return this.#saveDebouncer;
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
    #needsFit: boolean = true;
    #history: FlowHistorySnapshot =
        buildFlowHistorySnapshot(false);

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

    needsFit(): boolean {
        return this.#needsFit;
    }

    setNeedsFit(value: boolean): void {
        this.#needsFit = value;
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
    update(pageState.container(), presenter);
}

async function handleAddEdge(
    fromId: string,
    toId: string,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performAddEdge(
        getDbAdapter(), snap, fromId, toId,
    );
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
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
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function reportOpFailure(
    toast: string,
    toastVariant:
        | 'success' | 'error' | 'warning' | 'info',
    flowId: string,
): Promise<void> {
    showToast(toast, toastVariant);
    const g = await getFlowGraph(
        createRequestContext(), flowId,
    );
    const current = pageState.presenter().snapshot();
    commit({
        ...current,
        flowName: g.name,
        flowDescription: g.description,
        isLocked: g.isLocked,
        lockTimeout: g.lockTimeout,
        createdAt: g.createdAt,
        nodes: g.nodes,
        edges: g.edges,
    });
}

async function handleUndo(): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performUndo(
        getDbAdapter(), snap, pageState.history(),
    );
    if (op.kind === 'fail') {
        showToast(op.toast, op.toastVariant);
        return;
    }
    pageState.setHistory(op.newHistory);
    commit(op.freshSnap);
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function handleRedo(): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performRedo(
        getDbAdapter(), snap, pageState.history(),
    );
    if (op.kind === 'fail') {
        showToast(op.toast, op.toastVariant);
        return;
    }
    pageState.setHistory(op.newHistory);
    commit(op.freshSnap);
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
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
    const op = await performDeleteSelectedNodes(
        getDbAdapter(), snap,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
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
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function handleDeleteSelectedEdge(
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performDeleteSelectedEdge(
        getDbAdapter(), snap,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
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
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
}

async function handleAddField(
    name: string,
    fieldType: string,
    isRequired: boolean,
    options: string[],
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performAddField(
        getDbAdapter(), snap, name, fieldType,
        isRequired, options,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyAddField(
            current.nodes, op.nodeId, op.field,
        ),
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
}

async function handleDeleteField(
    fieldId: string,
): Promise<void> {
    const snap = pageState.presenter().snapshot();
    const op = await performDeleteField(
        getDbAdapter(), snap, fieldId,
    );
    if (op.kind === 'noop') return;
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
        );
        return;
    }
    const current = pageState.presenter().snapshot();
    const next: FlowSnapshot = {
        ...current,
        nodes: applyDeleteField(
            current.nodes, op.nodeId, op.fieldId,
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
    const op = await performAddNodeAtPosition(
        getDbAdapter(), snap, fromId, x, y,
    );
    if (op.kind === 'fail') {
        await reportOpFailure(
            op.toast, op.toastVariant, snap.flowId,
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
    commit(
        pageState.presenter().withLayoutReconciled(),
    );
}

function update(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    pageState.saveDebouncer().flush();
    presenter.renderUpdate(container);
    pageState.pushGestureContext(
        presenter.buildGestureContext(),
    );
    pageState.setHistory(presenter.history());
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
    $(
        '#flow-lock-switch', container,
    )?.addEventListener(
        'click',
        () => {
            commit(
                pageState.presenter()
                    .withLockToggled(),
            );
        },
        { signal },
    );
    $(
        '#flow-auto-layout-switch',
        container,
    )?.addEventListener(
        'click',
        () => {
            commit(
                pageState.presenter()
                    .withAutoLayoutToggled(),
            );
        },
        { signal },
    );
    $(
        '#flow-auto-fit-switch',
        container,
    )?.addEventListener(
        'click',
        () => {
            commit(
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
    $('#flow-back-btn', container)
        ?.addEventListener(
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
    $('#flow-stats-btn', container)
        ?.addEventListener(
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
    const state =
        presenter.interactionState();
    const push = bindInteractions(
        wrap,
        state,
        (next) => {
            const prevSelected = pageState
                .presenter().selectedNodeId();
            commit(
                pageState.presenter()
                    .withInteractionState(next),
            );
            commit(
                pageState.presenter()
                    .withFitReconciled(),
            );
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
            commit(
                pageState.presenter()
                    .withFitReconciled(),
            );
        },
        (updates) => {
            commit(
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
                createRequestContext(), flowId,
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
                createRequestContext(), flowId,
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
    downloadBlob(blob, result.name);
    showToast(
        'Flow exported',
        'success',
    );
}

function parseWorkerIdsFromPanel(
    panelEl: HTMLElement,
): WorkerId[] {
    const inputs = panelEl.querySelectorAll(
        'input[type="checkbox"][data-worker-id]',
    );
    const ids: WorkerId[] = [];
    for (const input of inputs) {
        if (
            !(input instanceof
                HTMLInputElement)
        ) continue;
        if (!input.checked) continue;
        const id = input.getAttribute(
            'data-worker-id',
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
                !(target instanceof
                    HTMLInputElement)
            ) return;
            if (
                target.type !== 'checkbox'
            ) return;
            if (
                !target.hasAttribute(
                    'data-worker-id',
                )
            ) return;
            const panel = target.closest(
                '#prop-node-workers',
            );
            if (!(panel instanceof HTMLElement)) {
                return;
            }
            const workerIds =
                parseWorkerIdsFromPanel(panel);
            commit(
                pageState.presenter()
                    .withNodeWorkerIds(workerIds),
                { advanceHistory: true },
            );
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
                commit(
                    pageState.presenter()
                        .withFitReconciled(),
                );
            } else if (
                action === 'add-field'
            ) {
                showFieldEditor(
                    container,
                    pageState.presenter(),
                );
            } else if (
                action === 'delete-field'
            ) {
                const fieldId = btn
                    .getAttribute(
                        'data-field-id',
                    );
                if (!fieldId) return;
                void handleDeleteField(fieldId);
            } else if (
                action === 'save-field'
            ) {
                void handleSaveField(container);
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
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeNamed(value),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-node-desc'
            ) {
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeDescribed(
                                value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-edge-name'
            ) {
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withEdgeNamed(value),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-edge-desc'
            ) {
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withEdgeDescribed(
                                value,
                            ),
                        { advanceHistory: true },
                    ),
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
                target.id !== 'new-field-name'
            ) return;
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            slot.querySelector<
                HTMLElement
            >(
                '[data-action='
                + '"save-field"]',
            )?.click();
        },
        { signal },
    );
}

function showFieldEditor(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const result =
        presenter.tryShowFieldEditor(container);
    if (result === 'locked') {
        showToast('Flow is locked', 'error');
    }
}

async function handleSaveField(
    container: HTMLElement,
): Promise<void> {
    const nameEl = $inputRequired(
        '#new-field-name', container,
    );
    const typeEl = $select(
        '#new-field-type', container,
    );
    if (!typeEl) {
        throw new Error(
            'Required: #new-field-type',
        );
    }
    const reqEl = $inputRequired(
        '#new-field-required', container,
    );
    const optEl = $textarea(
        '#new-field-options', container,
    );
    if (!optEl) {
        throw new Error(
            'Required: #new-field-options',
        );
    }
    const fieldName = nameEl.value.trim();
    if (fieldName.length === 0) {
        showToast(
            'Field name is required',
            'error',
        );
        return;
    }
    const fieldType = typeEl.value;
    const isRequired = reqEl.checked;
    const optionsText = optEl.value.trim();
    const options =
        optionsText.length > 0
            ? optionsText
                .split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0)
            : [];
    await handleAddField(
        fieldName, fieldType,
        isRequired, options,
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
    const container = $(
        '#flow-designer', document,
    );
    if (!container) return;
    pageState.setContainer(container);

    const loaded = await withLoadingState(
        container,
        buildSkeleton('detail', 1),
        async () => {
            const ctx = createRequestContext();
            const [
                graph, versions,
                humanWorkers, aiWorkers,
            ] = await Promise.all([
                getFlowGraph(ctx, flowId),
                getFlowVersions(ctx, flowId),
                getHumanWorkers(ctx),
                getAIWorkers(ctx),
            ]);
            return {
                graph, versions,
                humanWorkers, aiWorkers,
            };
        },
    );
    if (!loaded) return;

    pageState.setCanvasSize(FALLBACK_W, FALLBACK_H);
    pageState.setNeedsFit(true);
    pageState.setHistory(
        buildFlowHistorySnapshot(
            loaded.versions.length > 0,
        ),
    );

    const initialSnap =
        buildInitialFlowSnapshot(
            loaded.graph,
            FALLBACK_W,
            FALLBACK_H,
            loaded.humanWorkers,
            loaded.aiWorkers,
        );
    const presenter =
        new FlowDesignerPresenter(
            initialSnap,
            FALLBACK_W,
            FALLBACK_H,
            pageState.history(),
        );
    pageState.setPresenter(presenter);
    const panelStateRef: PanelStateRef =
        { open: false };
    const signal = pageState.signal();
    presenter.renderShell(container);
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
        container, panelStateRef, signal,
    );
    const initialWrap = container.querySelector(
        '.flow-canvas-wrap',
    );
    if (initialWrap instanceof HTMLElement) {
        const w = initialWrap.clientWidth;
        const h = initialWrap.clientHeight;
        if (w > 0 && h > 0) {
            pageState.setCanvasSize(w, h);
            pageState.setNeedsFit(false);
            pageState.presenter()
                .withCanvasSize(w, h);
            commit(
                pageState.presenter()
                    .withLayoutReconciled(),
            );
        }
    }
    subscribeResize(container, () => {
        const liveWrap = container.querySelector(
            '.flow-canvas-wrap',
        );
        if (!(liveWrap instanceof HTMLElement)) {
            return;
        }
        const w = liveWrap.clientWidth;
        const h = liveWrap.clientHeight;
        if (w > 0 && h > 0) {
            pageState.setCanvasSize(w, h);
            pageState.setNeedsFit(true);
            pageState.presenter()
                .withCanvasSize(w, h);
            update(
                container, pageState.presenter(),
            );
        }
    });
}

function bindKeyboardShortcuts(
    container: HTMLElement,
    panelStateRef: PanelStateRef,
    signal: AbortSignal,
): void {
    document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (
                e.key === 'Escape'
                && panelStateRef.open
            ) {
                e.preventDefault();
                panelStateRef.open = false;
                commit(
                    pageState.presenter()
                        .withPanelOpen(false),
                );
                commit(
                    pageState.presenter()
                        .withFitReconciled(),
                );
                return;
            }
            if (
                (e.key === 'Delete'
                    || e.key === 'Backspace')
                && !(
                    document.activeElement
                    instanceof
                    HTMLInputElement
                    || document.activeElement
                    instanceof
                    HTMLTextAreaElement
                    || document.activeElement
                    instanceof
                    HTMLSelectElement
                )
            ) {
                e.preventDefault();
                void handleDeleteSelected();
            }
            const mod =
                e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (
                e.key === 'z'
                && !e.shiftKey
            ) {
                e.preventDefault();
                void handleUndo();
            }
            if (
                e.key === 'z'
                && e.shiftKey
            ) {
                e.preventDefault();
                void handleRedo();
            }
        },
        { signal },
    );
}
