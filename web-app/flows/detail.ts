import {
    $, $input, $select,
    bindEnterToClick,
} from '../app/dom';
import { log } from '../app/logger';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    navigateTo,
} from '../app/core';
import {
    getFlowGraph,
    getFlowMermaid,
    getFlowZip,
    getFlowVersions,
} from '../app/adapters';
import {
    bindInteractions,
} from '../app/flow-interactions';
import {
    FlowDesignerPresenter,
} from '../app/presenters';

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

class PageState {
    #projectId: string | undefined;
    #interaction = new AbortController();

    projectId(): string | undefined {
        return this.#projectId;
    }

    setProjectId(id: string): void {
        this.#projectId = id;
    }

    signal(): AbortSignal {
        return this.#interaction.signal;
    }

    resetInteraction(): void {
        this.#interaction.abort();
        this.#interaction =
            new AbortController();
    }
}

const pageState = new PageState();

function renderAndBind(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    pageState.resetInteraction();
    const signal = pageState.signal();
    saveDebouncer.flush();
    presenter.render(container);
    bindBackButton();
    bindSvgInteractions(
        container, presenter, signal,
    );
    bindToolbarActions(
        container, presenter,
    );
    bindPanelActions(
        container, presenter,
    );
    bindFlowNameEdit(
        container, presenter,
    );
    bindSwitches(
        container, presenter,
    );
}

function bindFlowNameEdit(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    $('#flow-name-edit-btn', document)
        ?.addEventListener(
            'click',
            () => {
                presenter
                    .startEditingName();
                renderAndBind(
                    container, presenter,
                );
                const input = $input(
                    '#flow-name-input',
                    document,
                );
                if (input) {
                    input.focus();
                    input.select();
                }
            },
        );
    $('#flow-name-save-btn', document)
        ?.addEventListener(
            'click',
            () => {
                const name = $input(
                    '#flow-name-input',
                    document,
                )?.value.trim() ?? '';
                if (
                    name.length === 0
                ) {
                    showToast(
                        'Flow name is'
                        + ' required',
                        'error',
                    );
                    return;
                }
                presenter
                    .updateFlowName(name);
                renderAndBind(
                    container, presenter,
                );
            },
        );
    $('#flow-name-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => {
                presenter
                    .cancelEditingName();
                renderAndBind(
                    container, presenter,
                );
            },
        );
    $input(
        '#flow-name-input', document,
    )?.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                $(
                    '#flow-name-save-btn',
                    document,
                )?.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                $(
                    '#flow-name-cancel-btn',
                    document,
                )?.click();
            }
        },
    );
}

function bindSwitches(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    $(
        '#flow-lock-switch', document,
    )?.addEventListener(
        'click',
        () => {
            presenter.toggleLocked();
            renderAndBind(
                container, presenter,
            );
        },
    );
    $(
        '#flow-manual-layout-switch',
        document,
    )?.addEventListener(
        'click',
        () => {
            presenter
                .toggleManualLayout();
            renderAndBind(
                container, presenter,
            );
        },
    );
}

function bindBackButton(): void {
    $('#flow-back-btn', document)
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
        );
}

function bindSvgInteractions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
    signal: AbortSignal,
): void {
    const svg = container.querySelector(
        'svg.wf-canvas',
    ) as SVGSVGElement | null;
    if (!svg) return;
    const state =
        presenter.interactionState();
    bindInteractions(
        svg,
        state,
        () => renderAndBind(
            container, presenter,
        ),
        (updates) => {
            presenter.moveNodes(updates);
            renderAndBind(
                container, presenter,
            );
        },
        (fromId, toId) => {
            void presenter
                .addEdge(fromId, toId)
                .then(() => renderAndBind(
                    container, presenter,
                ));
        },
        (fromId, x, y) => {
            void presenter
                .addNodeAtPosition(
                    fromId, x, y,
                )
                .then(() => renderAndBind(
                    container, presenter,
                ));
        },
        (id) =>
            presenter.getNodePosition(id),
        () => presenter.getAllNodes(),
        signal,
    );
    if (
        (state.drag.kind === 'dragging'
            || state.connect.kind
                === 'connecting'
            || state.pan.kind
                === 'panning')
        && state.activePointerId > 0
    ) {
        try {
            svg.setPointerCapture(
                state.activePointerId,
            );
        } catch (err) {
            log.warn(
                'setPointerCapture failed',
                'flow-detail',
                err,
            );
            state.drag = { kind: 'idle' };
            state.connect =
                { kind: 'idle' };
            state.pan = { kind: 'idle' };
        }
    }
}

function bindToolbarActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const btns = container.querySelectorAll(
        '[data-action]',
    );
    for (const btn of btns) {
        const action = btn.getAttribute(
            'data-action',
        );
        if (!action) continue;
        if (action === 'undo') {
            btn.addEventListener(
                'click',
                async () => {
                    await presenter
                        .performUndo();
                    renderAndBind(
                        container,
                        presenter,
                    );
                },
            );
        }
        if (action === 'redo') {
            btn.addEventListener(
                'click',
                async () => {
                    await presenter
                        .performRedo();
                    renderAndBind(
                        container,
                        presenter,
                    );
                },
            );
        }
        if (action === 'auto-layout') {
            btn.addEventListener(
                'click',
                () => {
                    presenter.autoLayout();
                    renderAndBind(
                        container, presenter,
                    );
                },
            );
        }
        if (action === 'zoom-in') {
            btn.addEventListener(
                'click',
                () => {
                    presenter.zoomIn();
                    renderAndBind(
                        container, presenter,
                    );
                },
            );
        }
        if (action === 'zoom-out') {
            btn.addEventListener(
                'click',
                () => {
                    presenter.zoomOut();
                    renderAndBind(
                        container, presenter,
                    );
                },
            );
        }
        if (action === 'auto-fit') {
            btn.addEventListener(
                'click',
                () => {
                    presenter
                        .enableAutoFit();
                    renderAndBind(
                        container, presenter,
                    );
                },
            );
        }
        if (action === 'copy-mermaid') {
            btn.addEventListener(
                'click',
                () => void handleCopyMermaid(
                    presenter,
                ),
            );
        }
        if (action === 'export-zip') {
            btn.addEventListener(
                'click',
                () => void handleExportZip(
                    presenter,
                ),
            );
        }
        if (action === 'delete-selected') {
            btn.addEventListener(
                'click',
                () => {
                    void presenter
                        .deleteSelected()
                        .then(
                            () => renderAndBind(
                                container,
                                presenter,
                            ),
                        );
                },
            );
        }
    }
}

async function handleCopyMermaid(
    presenter: FlowDesignerPresenter,
): Promise<void> {
    const flowId = presenter.flowId();
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
        await navigator.clipboard
            .writeText(text);
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
    presenter: FlowDesignerPresenter,
): Promise<void> {
    const flowId = presenter.flowId();
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
    const url =
        URL.createObjectURL(blob);
    const a =
        document.createElement('a');
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
        'Flow exported',
        'success',
    );
}

function bindPanelActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    bindClosePanelAction(
        container, presenter,
    );
    bindNodePanelInputs(
        container, presenter,
    );
    bindEdgePanelInputs(
        container, presenter,
    );
    bindFieldActions(
        container, presenter,
    );
}

function bindClosePanelAction(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const btn = container.querySelector(
        '[data-action="close-panel"]',
    );
    if (!btn) return;
    btn.addEventListener(
        'click',
        () => {
            presenter.interactionState()
                .isPanelOpen = false;
            renderAndBind(
                container, presenter,
            );
        },
    );
}

function bindNodePanelInputs(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const nameInput = $input(
        '#prop-node-name', container,
    );
    const descInput = $input(
        '#prop-node-desc', container,
    );
    if (!nameInput || !descInput) return;
    if (
        presenter.selectedNodeId() === null
    ) return;

    nameInput.addEventListener(
        'input',
        () => {
            const val = nameInput.value;
            saveDebouncer.schedule(
                () => presenter
                    .updateNodeName(val),
            );
        },
    );

    descInput.addEventListener(
        'input',
        () => {
            const val = descInput.value;
            saveDebouncer.schedule(
                () => presenter
                    .updateNodeDescription(
                        val,
                    ),
            );
        },
    );
}

function bindEdgePanelInputs(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const nameInput = $input(
        '#prop-edge-name', container,
    );
    const descInput = $input(
        '#prop-edge-desc', container,
    );
    if (!nameInput || !descInput) return;
    if (
        presenter.selectedEdgeId() === null
    ) return;

    nameInput.addEventListener(
        'input',
        () => {
            const val = nameInput.value;
            saveDebouncer.schedule(
                () => presenter
                    .updateEdgeName(val),
            );
        },
    );

    descInput.addEventListener(
        'input',
        () => {
            const val = descInput.value;
            saveDebouncer.schedule(
                () => presenter
                    .updateEdgeDescription(
                        val,
                    ),
            );
        },
    );
}

function bindFieldActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const addFieldBtn = container
        .querySelector(
            '[data-action="add-field"]',
        );
    if (addFieldBtn) {
        addFieldBtn.addEventListener(
            'click',
            () => showFieldEditor(
                container, presenter,
            ),
        );
    }

    const delFieldBtns = container
        .querySelectorAll(
            '[data-action="delete-field"]',
        );
    for (const btn of delFieldBtns) {
        const fieldId = btn.getAttribute(
            'data-field-id',
        );
        if (!fieldId) continue;
        btn.addEventListener(
            'click',
            () => void presenter
                .deleteField(fieldId)
                .then(() => renderAndBind(
                    container, presenter,
                )),
        );
    }
}

function showFieldEditor(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    if (
        presenter.selectedNodeId() === null
    ) return;
    const slot = $(
        '#field-editor-slot', container,
    );
    if (!slot) return;
    setHtml(
        slot,
        presenter.buildFieldEditor(),
    );
    const saveBtn = slot.querySelector(
        '[data-action="save-field"]',
    );
    if (saveBtn) {
        saveBtn.addEventListener(
            'click',
            () => void handleSaveField(
                container, presenter,
            ),
        );
        bindEnterToClick(
            '#new-field-name',
            '[data-action='
            + '"save-field"]',
            slot,
        );
    }
}

async function handleSaveField(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): Promise<void> {
    if (
        presenter.selectedNodeId() === null
    ) return;
    const nameEl = $input(
        '#new-field-name', container,
    );
    const typeEl = $select(
        '#new-field-type', container,
    );
    const reqEl = $input(
        '#new-field-required', container,
    );
    const optEl = container
        .querySelector<HTMLTextAreaElement>(
            '#new-field-options',
        );
    if (!nameEl || !typeEl) return;
    const fieldName = nameEl.value.trim();
    if (fieldName.length === 0) {
        showToast(
            'Field name is required',
            'error',
        );
        return;
    }
    const fieldType = typeEl.value;
    const isRequired =
        reqEl?.checked ?? false;
    const optionsText =
        optEl?.value.trim() ?? '';
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
    renderAndBind(container, presenter);
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
    renderAndBind(container, presenter);
    const initialWrap = container.querySelector(
        '.wf-canvas-wrap',
    );
    if (initialWrap instanceof HTMLElement) {
        const w = initialWrap.clientWidth;
        const h = initialWrap.clientHeight;
        if (w > 0 && h > 0) {
            presenter.updateCanvasSize(w, h);
        }
    }
    const ro = new ResizeObserver(() => {
        const liveWrap = container.querySelector(
            '.wf-canvas-wrap',
        );
        if (!(liveWrap instanceof HTMLElement)) {
            return;
        }
        const w = liveWrap.clientWidth;
        const h = liveWrap.clientHeight;
        if (w > 0 && h > 0) {
            presenter.updateCanvasSize(w, h);
            renderAndBind(container, presenter);
        }
    });
    ro.observe(container);
    bindKeyboardShortcuts(
        container, presenter,
    );
}

function bindKeyboardShortcuts(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (
                e.key === 'Escape'
                && presenter
                    .interactionState()
                    .isPanelOpen
            ) {
                e.preventDefault();
                presenter
                    .interactionState()
                    .isPanelOpen = false;
                renderAndBind(
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
                    .then(
                        () => renderAndBind(
                            container,
                            presenter,
                        ),
                    );
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
                    renderAndBind(
                        container,
                        presenter,
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
                    renderAndBind(
                        container,
                        presenter,
                    );
                })();
            }
        },
    );
}
