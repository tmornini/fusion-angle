import { $, $input } from '../app/dom';
import { showToast } from '../app/toast';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import { setHtml } from '../app/safe-html';
import { log } from '../app/logger';
import {
    navigateTo,
    trimStrings,
    openDialog,
    closeDialog,
} from '../app/core';
import {
    getProject, getProjectEntity,
    putProject,
    getFlowsByProject,
    postFlowCreation,
    projectChanged,
    type ProjectView,
} from '../app/adapters';
import type {
    FlowListItem,
} from '../app/adapters';
import {
    ProjectDetailPresenter,
    type ProjectFieldKey,
} from '../app/presenters';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter:
    ProjectDetailPresenter | null = null;
let pageContainer:
    HTMLElement | null = null;

const FIELDS: ReadonlySet<ProjectFieldKey> =
    new Set([
        'title', 'description', 'status',
        'startDate', 'targetEndDate',
        'costBaseline', 'impactBaseline',
    ]);

function isFieldKey(
    s: string | null,
): s is ProjectFieldKey {
    return s !== null
        && FIELDS.has(s as ProjectFieldKey);
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const projectId = params?.projectId;
    if (!projectId) {
        navigateTo('projects');
        return;
    }

    const container = $(
        '#project-detail-content', document,
    );
    if (!container) return;
    pageContainer = container;
    setHtml(
        container, buildSkeleton('detail', 4),
    );

    let project: ProjectView;
    let flows: FlowListItem[];
    try {
        [project, flows] = await Promise.all([
            getProject(projectId),
            getFlowsByProject(projectId),
        ]);
    } catch (err) {
        log.error(
            'getProject failed',
            'projects', err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load project'
                + ' details. The project'
                + ' may not exist.',
                'Try Again',
            ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                'click',
                () => init(params),
                { signal },
            );
        return;
    }

    presenter = new ProjectDetailPresenter(
        project, flows,
    );
    presenter.renderShell(container);
    bindStableListeners(container, presenter);

    projectChanged.subscribe(async () => {
        if (!presenter || !pageContainer) {
            return;
        }
        const [upd, updFlows] =
            await Promise.all([
                getProject(projectId),
                getFlowsByProject(projectId),
            ]);
        presenter.update(upd, updFlows);
        presenter.renderUpdate(pageContainer);
    });
}

function bindStableListeners(
    container: HTMLElement,
    p: ProjectDetailPresenter,
): void {
    container.addEventListener(
        'click', e => onClick(e, container, p),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e, p),
        { signal },
    );
    container.addEventListener(
        'change', e => onInput(e, p),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e, container, p),
        { signal },
    );
}

function onClick(
    e: MouseEvent,
    container: HTMLElement,
    p: ProjectDetailPresenter,
): void {
    const target = e.target as Element | null;
    if (!target) return;

    if (handleDialogClicks(target)) return;
    if (handleFlowCardClick(e, target, p)) {
        return;
    }
    handleProjectActions(target, container, p);
}

function handleDialogClicks(
    target: Element,
): boolean {
    if (target.classList.contains(
        'dialog-backdrop',
    )) {
        const id = target.getAttribute(
            'data-dialog-id',
        );
        if (id) closeDialog(id);
        return true;
    }
    const openEl = target.closest(
        '[data-dialog-open]',
    );
    if (openEl) {
        const id = openEl.getAttribute(
            'data-dialog-open',
        );
        if (id) openDialog(id);
        return true;
    }
    const cancelEl = target.closest(
        '[data-dialog-cancel]',
    );
    if (cancelEl) {
        const id = cancelEl.getAttribute(
            'data-dialog-cancel',
        );
        if (id) closeDialog(id);
        return true;
    }
    return false;
}

function handleFlowCardClick(
    e: MouseEvent,
    target: Element,
    p: ProjectDetailPresenter,
): boolean {
    const card = target.closest(
        '[data-flow-id]',
    );
    if (!card) return false;
    e.preventDefault();
    const flowId = card.getAttribute(
        'data-flow-id',
    );
    if (!flowId) return true;
    navigateTo('flow-detail', {
        flowId,
        projectId: p.idForLink(),
    });
    return true;
}

function handleProjectActions(
    target: Element,
    container: HTMLElement,
    p: ProjectDetailPresenter,
): void {
    const actionEl = target.closest(
        '[data-project-action]',
    );
    const action = actionEl?.getAttribute(
        'data-project-action',
    );
    if (!action) return;
    switch (action) {
        case 'back':
            navigateTo('projects');
            return;
        case 'edit':
            p.beginEdit();
            p.renderUpdate(container);
            return;
        case 'cancel':
            p.cancelEdit();
            p.renderUpdate(container);
            return;
        case 'save':
            void handleSave();
            return;
        case 'new-flow-submit':
            void handleNewFlowSubmit(
                p.idForLink(),
            );
            return;
    }
}

function onInput(
    e: Event,
    p: ProjectDetailPresenter,
): void {
    const target = e.target as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-project-field',
    );
    if (!isFieldKey(field)) return;
    p.setDraftField(field, target.value);
}

function onContainerKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    if (target.id === 'new-flow-name') {
        const projectId =
            presenter?.idForLink();
        if (projectId) {
            void handleNewFlowSubmit(projectId);
        }
        return;
    }
    void handleSave();
}

function onDocumentKeydown(
    e: KeyboardEvent,
    container: HTMLElement,
    p: ProjectDetailPresenter,
): void {
    if (e.key !== 'Escape') return;
    if (!p.isEditing()) return;
    e.preventDefault();
    p.cancelEdit();
    p.renderUpdate(container);
}

async function handleSave(): Promise<void> {
    if (!presenter) return;
    if (!presenter.isEditing()) return;
    const patch = presenter.buildEntityPatch();
    const projectId = presenter.idForLink();
    try {
        const entity = await getProjectEntity(
            projectId,
        );
        await putProject(projectId, {
            ...entity,
            ...trimStrings(patch),
        });
    } catch (err) {
        log.error(
            'putProject failed',
            'projects', err,
        );
        showToast(
            'Failed to save project', 'error',
        );
        return;
    }
    showToast('Project saved', 'success');
}

async function handleNewFlowSubmit(
    projectId: string,
): Promise<void> {
    const nameEl = $input(
        '#new-flow-name', document,
    );
    const name = nameEl?.value.trim() ?? '';
    if (name.length === 0) {
        showToast(
            'Flow name is required', 'error',
        );
        return;
    }
    const flowId = crypto.randomUUID();
    try {
        await postFlowCreation({
            flowId,
            projectId,
            name,
            description: '',
        });
    } catch (err) {
        log.error(
            'postFlowCreation failed',
            'projects', err,
        );
        showToast(
            'Failed to create flow', 'error',
        );
        return;
    }
    closeDialog('new-flow');
    navigateTo('flow-detail', {
        flowId, projectId,
    });
}
