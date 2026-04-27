import {
    $, $input, $inputRequired, $select,
    $textarea,
} from '../app/dom.ts';
import { log } from '../app/logger.ts';
import { mutateHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    navigateTo,
} from '../app/core.ts';
import {
    getFlowGraph,
    getFlowMermaid,
    getFlowZip,
    getFlowVersions,
    postClipboardCopy,
    subscribeResize,
} from '../app/adapters/index.ts';
import {
    downloadBlob,
} from '../app/adapters/blob-download.ts';
import {
    bindInteractions,
    type FlowGestureContext,
} from '../app/flow-interactions.ts';
import {
    FlowDesignerPresenter,
} from '../app/presenters/index.ts';

const FALLBACK_W = 800;
const FALLBACK_H = 600;
const SAVE_DELAY_MS = 800;

class Debouncer {
    #timer: ReturnType<
        typeof setTimeout
    > | undefined = undefined;
    #pending:
        | (() => void)
        | undefined = undefined;
    readonly #delayMs: number;

    constructor(delayMs: number) {
        this.#delayMs = delayMs;
    }

    schedule(fn: () => void): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
        }
        this.#pending = fn;
        this.#timer = setTimeout(
            () => {
                fn();
                this.#timer = undefined;
                this.#pending =
                    undefined;
            },
            this.#delayMs,
        );
    }

    flush(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
        }
        if (
            this.#pending !== undefined
        ) {
            this.#pending();
            this.#pending = undefined;
        }
    }
}

const saveDebouncer =
    new Debouncer(SAVE_DELAY_MS);

type PanelStateRef = { open: boolean };

class PageState {
    #projectId: string | undefined;
    readonly #interaction =
        new AbortController();
    #pushGestureContext:
        | ((next: FlowGestureContext) => void)
        | null = null;

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
}

const pageState = new PageState();

function update(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    saveDebouncer.flush();
    presenter.renderUpdate(container);
    pageState.pushGestureContext({
        isAutoFit: presenter.isAutoFit(),
        isLocked: presenter.isLocked(),
    });
}

function bindFlowNameEdit(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
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
                presenter
                    .startEditingName();
                update(
                    container, presenter,
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
                presenter
                    .updateFlowName(name);
                update(
                    container, presenter,
                );
            } else if (
                btn.id
                    === 'flow-name-cancel-btn'
            ) {
                presenter
                    .cancelEditingName();
                update(
                    container, presenter,
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
    presenter: FlowDesignerPresenter,
    signal: AbortSignal,
): void {
    $(
        '#flow-lock-switch', container,
    )?.addEventListener(
        'click',
        () => {
            presenter.toggleLocked();
            update(container, presenter);
        },
        { signal },
    );
    $(
        '#flow-auto-layout-switch',
        container,
    )?.addEventListener(
        'click',
        () => {
            presenter.toggleAutoLayout();
            update(container, presenter);
        },
        { signal },
    );
    $(
        '#flow-auto-fit-switch',
        container,
    )?.addEventListener(
        'click',
        () => {
            presenter.toggleAutoFit();
            update(container, presenter);
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
        () => update(container, presenter),
        (open) => {
            panelStateRef.open = open;
            presenter.setPanelOpen(open);
        },
        (updates) => {
            presenter.moveNodes(updates);
            update(container, presenter);
        },
        (fromId, toId) => {
            void presenter
                .addEdge(fromId, toId)
                .then(() => update(
                    container, presenter,
                ));
        },
        (fromId, x, y) => {
            void presenter
                .addNodeAtPosition(
                    fromId, x, y,
                )
                .then(() => update(
                    container, presenter,
                ));
        },
        (id) =>
            presenter.getNodePosition(id),
        () => presenter.getAllNodes(),
        {
            isAutoFit: presenter.isAutoFit(),
            isLocked: presenter.isLocked(),
        },
        signal,
    );
    pageState.setPushGestureContext(push);
}

function bindToolbarActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
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
                void (async () => {
                    await presenter
                        .performUndo();
                    update(
                        container, presenter,
                    );
                })();
            } else if (action === 'redo') {
                void (async () => {
                    await presenter
                        .performRedo();
                    update(
                        container, presenter,
                    );
                })();
            } else if (action === 'zoom-in') {
                presenter.zoomIn();
                update(container, presenter);
            } else if (
                action === 'zoom-out'
            ) {
                presenter.zoomOut();
                update(container, presenter);
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
                void presenter
                    .deleteSelected()
                    .then(() => update(
                        container, presenter,
                    ));
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
            await getFlowMermaid(flowId);
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
            await getFlowZip(flowId);
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

function bindPanelActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
    panelStateRef: PanelStateRef,
    signal: AbortSignal,
): void {
    const slot = $(
        '.flow-props-slot', container,
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
            if (action === 'close-panel') {
                panelStateRef.open = false;
                presenter.setPanelOpen(false);
                update(
                    container, presenter,
                );
            } else if (
                action === 'add-field'
            ) {
                showFieldEditor(
                    container, presenter,
                );
            } else if (
                action === 'delete-field'
            ) {
                const fieldId = btn
                    .getAttribute(
                        'data-field-id',
                    );
                if (!fieldId) return;
                void presenter
                    .deleteField(fieldId)
                    .then(() => update(
                        container, presenter,
                    ));
            } else if (
                action === 'save-field'
            ) {
                void handleSaveField(
                    container, presenter,
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
                saveDebouncer.schedule(
                    () => presenter
                        .updateNodeName(
                            value,
                        ),
                );
            } else if (
                id === 'prop-node-desc'
            ) {
                saveDebouncer.schedule(
                    () => presenter
                        .updateNodeDescription(
                            value,
                        ),
                );
            } else if (
                id === 'prop-edge-name'
            ) {
                saveDebouncer.schedule(
                    () => presenter
                        .updateEdgeName(
                            value,
                        ),
                );
            } else if (
                id === 'prop-edge-desc'
            ) {
                saveDebouncer.schedule(
                    () => presenter
                        .updateEdgeDescription(
                            value,
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
    presenter: FlowDesignerPresenter,
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
    await presenter.addField(
        fieldName, fieldType,
        isRequired, options,
    );
    update(container, presenter);
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

    const loaded = await withLoadingState(
        container,
        buildSkeleton('detail', 1),
        async () => {
            const [graph, versions] =
                await Promise.all([
                    getFlowGraph(flowId),
                    getFlowVersions(flowId),
                ]);
            return { graph, versions };
        },
    );
    if (!loaded) return;

    const presenter =
        new FlowDesignerPresenter(
            loaded.graph,
            FALLBACK_W,
            FALLBACK_H,
            loaded.versions.length > 0,
        );
    const panelStateRef: PanelStateRef =
        { open: false };
    const signal = pageState.signal();
    presenter.renderShell(container);
    bindBackButton(container, signal);
    bindCanvasInteractions(
        container, presenter,
        panelStateRef, signal,
    );
    bindToolbarActions(
        container, presenter, flowId, signal,
    );
    bindPanelActions(
        container, presenter,
        panelStateRef, signal,
    );
    bindFlowNameEdit(
        container, presenter, signal,
    );
    bindSwitches(
        container, presenter, signal,
    );
    bindKeyboardShortcuts(
        container, presenter,
        panelStateRef, signal,
    );
    const initialWrap = container.querySelector(
        '.flow-canvas-wrap',
    );
    if (initialWrap instanceof HTMLElement) {
        const w = initialWrap.clientWidth;
        const h = initialWrap.clientHeight;
        if (w > 0 && h > 0) {
            presenter.updateCanvasSize(w, h);
            presenter.reconcileLayout();
            update(container, presenter);
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
            presenter.updateCanvasSize(w, h);
            update(container, presenter);
        }
    });
}

function bindKeyboardShortcuts(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
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
                presenter.setPanelOpen(false);
                update(
                    container, presenter,
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
                void presenter
                    .deleteSelected()
                    .then(() => update(
                        container, presenter,
                    ));
            }
            const mod =
                e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (
                e.key === 'z'
                && !e.shiftKey
            ) {
                e.preventDefault();
                void (async () => {
                    await presenter
                        .performUndo();
                    update(
                        container, presenter,
                    );
                })();
            }
            if (
                e.key === 'z'
                && e.shiftKey
            ) {
                e.preventDefault();
                void (async () => {
                    await presenter
                        .performRedo();
                    update(
                        container, presenter,
                    );
                })();
            }
        },
        { signal },
    );
}
