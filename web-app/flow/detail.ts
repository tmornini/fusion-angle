import {
    $, $input, $select,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    navigateTo,
    openDialog,
    closeDialog,
} from '../app/core';
import {
    getFlowGraph,
} from '../app/adapters';
import {
    bindInteractions,
} from '../app/flow-interactions';
import {
    FlowDesignerPresenter,
} from '../app/presenters';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const SAVE_DELAY_MS = 800;

let saveTimer: ReturnType<
    typeof setTimeout
> | null = null;
let pendingSave: (() => void) | null =
    null;

function debounceSave(
    fn: () => void,
): void {
    if (saveTimer !== null) {
        clearTimeout(saveTimer);
    }
    pendingSave = fn;
    saveTimer = setTimeout(() => {
        fn();
        saveTimer = null;
        pendingSave = null;
    }, SAVE_DELAY_MS);
}

function flushPendingSave(): void {
    if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (pendingSave !== null) {
        pendingSave();
        pendingSave = null;
    }
}

function renderAndBind(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    flushPendingSave();
    presenter.render(container);
    bindBackButton();
    bindSvgInteractions(
        container, presenter,
    );
    bindToolbarActions(
        container, presenter,
    );
    bindPanelActions(
        container, presenter,
    );
    bindAddStateDialog(
        container, presenter,
    );
}

function bindBackButton(): void {
    $('#flow-back-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('flows'),
        );
}

function bindSvgInteractions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
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
        (nodeId, x, y) => {
            presenter.moveNode(
                nodeId, x, y,
            );
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
        (id) =>
            presenter.getNodePosition(id),
    );
    if (
        (state.isDragging
            || state.isConnecting
            || state.isPanning)
        && state.activePointerId > 0
    ) {
        try {
            svg.setPointerCapture(
                state.activePointerId,
            );
        } catch {
            state.isDragging = false;
            state.isConnecting = false;
            state.isPanning = false;
            state.dragNodeId = null;
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
                () => void presenter
                    .performUndo()
                    .then(() => renderAndBind(
                        container, presenter,
                    )),
            );
        }
        if (action === 'redo') {
            btn.addEventListener(
                'click',
                () => void presenter
                    .performRedo()
                    .then(() => renderAndBind(
                        container, presenter,
                    )),
            );
        }
        if (action === 'add-state') {
            btn.addEventListener(
                'click',
                () => openDialog(
                    'add-state',
                ),
            );
        }
        if (action === 're-layout') {
            btn.addEventListener(
                'click',
                () => {
                    presenter.relayout();
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
        if (action === 'fit') {
            btn.addEventListener(
                'click',
                () => {
                    presenter.zoomToFit();
                    renderAndBind(
                        container, presenter,
                    );
                },
            );
        }
    }
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
    bindDeleteActions(
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
            debounceSave(
                () => presenter
                    .updateNodeName(val),
            );
        },
    );

    descInput.addEventListener(
        'input',
        () => {
            const val = descInput.value;
            debounceSave(
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
            debounceSave(
                () => presenter
                    .updateEdgeName(val),
            );
        },
    );

    descInput.addEventListener(
        'input',
        () => {
            const val = descInput.value;
            debounceSave(
                () => presenter
                    .updateEdgeDescription(
                        val,
                    ),
            );
        },
    );
}

function bindDeleteActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const delNodeBtn = container
        .querySelector(
            '[data-action="delete-node"]',
        );
    if (delNodeBtn) {
        delNodeBtn.addEventListener(
            'click',
            () => void presenter
                .deleteSelectedNode()
                .then(() => renderAndBind(
                    container, presenter,
                )),
        );
    }

    const delEdgeBtn = container
        .querySelector(
            '[data-action="delete-edge"]',
        );
    if (delEdgeBtn) {
        delEdgeBtn.addEventListener(
            'click',
            () => void presenter
                .deleteSelectedEdge()
                .then(() => renderAndBind(
                    container, presenter,
                )),
        );
    }
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
    if (!flowId) {
        navigateTo('flow');
        return;
    }
    const container = $(
        '#flow-designer', document,
    );
    if (!container) return;

    const graph = await withLoadingState(
        container,
        buildSkeleton('detail', 1),
        () => getFlowGraph(flowId),
    );
    if (!graph) return;

    const presenter =
        new FlowDesignerPresenter(
            graph, CANVAS_W, CANVAS_H,
        );
    renderAndBind(container, presenter);
    bindKeyboardShortcuts(
        container, presenter,
    );
}

function bindAddStateDialog(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    const cancelBtn = $(
        '#add-state-cancel', document,
    );
    const submitBtn = $(
        '#add-state-submit', document,
    );
    const backdrop = $(
        '#add-state-backdrop', document,
    );

    cancelBtn?.addEventListener(
        'click',
        () => closeDialog('add-state'),
    );
    backdrop?.addEventListener(
        'click',
        (e) => {
            if (
                e.target === e.currentTarget
            ) {
                closeDialog('add-state');
            }
        },
    );

    const dirBtns =
        document.querySelectorAll(
            '[data-direction]',
        );
    for (const btn of dirBtns) {
        btn.addEventListener(
            'click',
            () => {
                for (const b of dirBtns) {
                    b.classList.remove(
                        'active',
                    );
                }
                btn.classList.add('active');
            },
        );
    }

    submitBtn?.addEventListener(
        'click',
        () => void handleAddState(
            container, presenter,
        ),
    );
}

async function handleAddState(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): Promise<void> {
    const nameEl = $input(
        '#add-state-name', document,
    );
    const transEl = $input(
        '#add-state-transition', document,
    );
    const name = nameEl?.value.trim() ?? '';
    const transition =
        transEl?.value.trim() ?? '';
    if (name.length === 0) {
        showToast(
            'State name is required',
            'error',
        );
        return;
    }
    if (transition.length === 0) {
        showToast(
            'Transition name is required',
            'error',
        );
        return;
    }
    const activeDir =
        document.querySelector(
            '[data-direction].active',
        );
    const direction =
        activeDir?.getAttribute(
            'data-direction',
        ) ?? 'right';

    const ok =
        await presenter.addNodeWithEdge(
            name, transition, direction,
        );
    if (ok) {
        closeDialog('add-state');
        renderAndBind(
            container, presenter,
        );
    }
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
            const mod =
                e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (
                e.key === 'z'
                && !e.shiftKey
            ) {
                e.preventDefault();
                void presenter
                    .performUndo()
                    .then(
                        () => renderAndBind(
                            container,
                            presenter,
                        ),
                    );
            }
            if (
                e.key === 'z'
                && e.shiftKey
            ) {
                e.preventDefault();
                void presenter
                    .performRedo()
                    .then(
                        () => renderAndBind(
                            container,
                            presenter,
                        ),
                    );
            }
        },
    );
}
