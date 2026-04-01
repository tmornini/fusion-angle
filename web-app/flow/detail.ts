import {
    $, $input, $select,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import { navigateTo } from '../app/core';
import {
    getWorkflowGraph,
} from '../app/adapters';
import {
    bindInteractions,
} from '../app/workflow-interactions';
import {
    FlowDesignerPresenter,
} from '../app/presenters';

const CANVAS_W = 1200;
const CANVAS_H = 800;

function renderAndBind(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
    presenter.render(container);
    bindSvgInteractions(
        container, presenter,
    );
    bindToolbarActions(
        container, presenter,
    );
    bindPanelActions(
        container, presenter,
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
    presenter.initDragPositions();
    bindInteractions(
        svg,
        presenter.interactionState(),
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
    );
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
        if (action === 'add-state') {
            btn.addEventListener(
                'click',
                () => void presenter
                    .addNode()
                    .then(() => renderAndBind(
                        container, presenter,
                    )),
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
        if (action === 'save') {
            btn.addEventListener(
                'click',
                () => void presenter
                    .persist()
                    .then(() => renderAndBind(
                        container, presenter,
                    )),
            );
        }
    }
}

function bindPanelActions(
    container: HTMLElement,
    presenter: FlowDesignerPresenter,
): void {
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
        'change',
        () => presenter.updateNodeName(
            nameInput.value,
        ),
    );

    descInput.addEventListener(
        'change',
        () => presenter
            .updateNodeDescription(
                descInput.value,
            ),
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
        'change',
        () => presenter.updateEdgeName(
            nameInput.value,
        ),
    );

    descInput.addEventListener(
        'change',
        () => presenter
            .updateEdgeDescription(
                descInput.value,
            ),
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
    const workflowId =
        params?.workflowId;
    if (!workflowId) {
        navigateTo('flow');
        return;
    }
    const container = $(
        '#workflow-designer', document,
    );
    if (!container) return;

    const graph = await withLoadingState(
        container,
        buildSkeleton('detail', 1),
        () => getWorkflowGraph(workflowId),
    );
    if (!graph) return;

    const presenter =
        new FlowDesignerPresenter(
            graph, CANVAS_W, CANVAS_H,
        );
    renderAndBind(container, presenter);
}
