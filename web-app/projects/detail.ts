import {
    $, $inputRequired, isFormField,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import { setHtml } from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import {
    navigateTo,
    trimStrings,
    openDialog,
    closeDialog,
} from '../app/core.ts';
import {
    getProjectRow,
    Project,
    ProjectView,
    putProject,
    getFlowsByProject,
    postFlowCreation,
    subscribeProjectChanges,
    generateCryptoSafeBase62,
    createRequestContext,
    type RequestContext,
    type ProjectEntity,
} from '../app/adapters/index.ts';
import type {
    FlowListItem,
} from '../app/adapters/index.ts';
import {
    ProjectDetailPresenter,
    ProjectDetailEditPresenter,
    projectDraftFromView,
    projectPatchFromDraft,
    type ProjectFieldKey,
    type ProjectDraftFields,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        view: ProjectView;
        entity: ProjectEntity;
        flows: FlowListItem[];
    }
    | {
        kind: 'editing';
        view: ProjectView;
        entity: ProjectEntity;
        flows: FlowListItem[];
        draft: ProjectDraftFields;
    };

let state: PageState | null = null;
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

async function loadProjectView(
    projectId: string,
    ctx: RequestContext,
): Promise<{
    view: ProjectView;
    entity: ProjectEntity;
}> {
    const entity = await getProjectRow(
        ctx, projectId,
    );
    const view = new ProjectView(
        new Project(entity),
    );
    return { view, entity };
}

function buildPresenter():
    | ProjectDetailPresenter
    | ProjectDetailEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new ProjectDetailPresenter(
            state.view, state.flows,
        )
        : new ProjectDetailEditPresenter(
            state.view, state.flows, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
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
    bindStableListeners(container);
    setHtml(
        container, buildSkeleton('detail', 4),
    );

    let project: {
        view: ProjectView;
        entity: ProjectEntity;
    };
    let flows: FlowListItem[];
    try {
        const ctx = createRequestContext();
        [project, flows] = await Promise.all([
            loadProjectView(projectId, ctx),
            getFlowsByProject(ctx, projectId),
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

    state = {
        kind: 'reading',
        view: project.view,
        entity: project.entity,
        flows,
    };
    buildPresenter().renderShell(container);

    subscribeProjectChanges(async () => {
        if (!state || !pageContainer) {
            return;
        }
        const ctx = createRequestContext();
        const [upd, updFlows] =
            await Promise.all([
                loadProjectView(projectId, ctx),
                getFlowsByProject(ctx, projectId),
            ]);
        state = {
            kind: 'reading',
            view: upd.view,
            entity: upd.entity,
            flows: updFlows,
        };
        rerender();
    });
}

function bindStableListeners(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click', e => onClick(e),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e),
        { signal },
    );
    container.addEventListener(
        'change', e => onInput(e),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e),
        { signal },
    );
}

function onClick(
    e: MouseEvent,
): void {
    const target = e.target as Element | null;
    if (!target) return;

    if (handleDialogClicks(target)) return;
    if (handleFlowCardClick(e, target)) {
        return;
    }
    handleProjectActions(target);
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
): boolean {
    if (!state) return false;
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
        projectId: state.view.idForLink(),
    });
    return true;
}

function handleProjectActions(
    target: Element,
): void {
    if (!state) return;
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
            if (state.kind !== 'reading') {
                return;
            }
            state = {
                kind: 'editing',
                view: state.view,
                entity: state.entity,
                flows: state.flows,
                draft: projectDraftFromView(
                    state.view,
                ),
            };
            rerender();
            return;
        case 'cancel':
            if (state.kind !== 'editing') {
                return;
            }
            state = {
                kind: 'reading',
                view: state.view,
                entity: state.entity,
                flows: state.flows,
            };
            rerender();
            return;
        case 'save':
            void handleSave();
            return;
        case 'new-flow-submit':
            void handleNewFlowSubmit(
                state.view.idForLink(),
            );
            return;
    }
}

function onInput(
    e: Event,
): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target;
    if (!isFormField(target)) return;
    const field = target.getAttribute(
        'data-project-field',
    );
    if (!isFieldKey(field)) return;
    state = {
        ...state,
        draft: {
            ...state.draft,
            [field]: target.value,
        },
    };
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
        if (!state) return;
        void handleNewFlowSubmit(
            state.view.idForLink(),
        );
        return;
    }
    void handleSave();
}

function onDocumentKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Escape') return;
    if (!state || state.kind !== 'editing') {
        return;
    }
    e.preventDefault();
    state = {
        kind: 'reading',
        view: state.view,
        entity: state.entity,
        flows: state.flows,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const projectId = state.view.idForLink();
    const entity = state.entity;
    const patch = trimStrings(
        projectPatchFromDraft(
            state.view,
            state.draft,
        ),
    );
    const ctx = createRequestContext();
    try {
        await putProject(ctx, projectId, {
            ...entity, ...patch,
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
    const name = $inputRequired(
        '#new-flow-name', document,
    ).value.trim();
    if (name.length === 0) {
        showToast(
            'Flow name is required', 'error',
        );
        return;
    }
    const flowId = generateCryptoSafeBase62();
    const linkId = generateCryptoSafeBase62();
    try {
        await postFlowCreation(
            createRequestContext(),
            {
                flowId,
                linkId,
                projectId,
                name,
                description: '',
            },
        );
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
