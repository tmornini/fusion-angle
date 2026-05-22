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
    getProject,
    getProjectRow,
    ProjectView,
    putProject,
    postProjectStateChange,
    getFlowsByProject,
    postFlowCreation,
    subscribeProjectChanges,
    generateCryptoSafeBase62,
    createRequestContext,
    type RequestContext,
    type ProjectEntity,
    getProjectScoring,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
    subscribeProjectScoreChanges,
    getActiveObjectives,
    getObjectives,
    getCurrentObjectiveDefinition,
    getObjectiveRevisions,
    getObjectiveDeprecationEvents,
    subscribeObjectiveChanges,
    postProjectApproval,
    postProjectCompletion,
    validateProjectForApproval,
    validateProjectForCompletion,
} from '../app/adapters/index.ts';
import type {
    FlowListItem,
} from '../app/adapters/index.ts';
import type {
    ObjectiveRevision,
} from '../../api/types.ts';
import { latestPerPair } from '../app/scoring-format.ts';
import {
    ProjectDetailPresenter,
    ProjectDetailEditPresenter,
    projectDraftFromView,
    projectPatchFromDraft,
    type ProjectFieldKey,
    type ProjectDraftFields,
    ProjectActionBarPresenter,
    ProjectObjectivesPresenter,
    ScoreModalPresenter,
    MeasurementModalPresenter,
    ProjectScoreHistoryPresenter,
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
let currentProjectId: string | null = null;

const FIELDS: ReadonlySet<ProjectFieldKey> =
    new Set([
        'title', 'description', 'state',
        'startDate', 'targetEndDate',
        'costBaseline',
    ]);

const SUBMIT_ON_ENTER_IDS:
    ReadonlySet<string> =
    new Set([
        'project-edit-title',
        'project-edit-cost-baseline',
        'project-edit-impact-baseline',
        'new-flow-name',
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
    const [
        project,
        entity,
        objectives,
        scoring,
    ] = await Promise.all([
        getProject(ctx, projectId),
        getProjectRow(ctx, projectId),
        getObjectives(ctx),
        getProjectScoring(ctx, projectId),
    ]);
    const view = new ProjectView(
        project,
        objectives,
        scoring.baseline,
        scoring.actual,
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
    currentProjectId = projectId;

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
        void renderActionBarAndObjectives();
    });

    subscribeProjectScoreChanges(
        () => void renderActionBarAndObjectives(),
    );
    subscribeObjectiveChanges(
        () => void renderActionBarAndObjectives(),
    );

    await renderActionBarAndObjectives();

    $('#project-action-bar', document)!
        .addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            const ctx = createRequestContext();
            if (action === 'score') {
                await openScoreModal(
                    ctx, projectId,
                );
            } else if (action === 'approve') {
                openApproveConfirmation();
            } else if (
                action === 'log-measurement'
            ) {
                await openMeasurementModal(
                    ctx, projectId,
                );
            } else if (action === 'complete') {
                openCompleteConfirmation();
            } else if (
                action === 'view-history'
            ) {
                await openHistoryModal(
                    ctx, projectId,
                );
            }
        },
        { signal },
    );

    $('#score-dialog', document)!.addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            if (action === 'cancel') {
                closeDialog('score');
            } else if (
                action === 'save-baselines'
            ) {
                const ctx = createRequestContext();
                const moved: {
                    objectiveId: string;
                    score: number;
                }[] = [];
                const rows =
                    document.querySelectorAll(
                        '#score-modal-body'
                        + ' .score-slider-row',
                    );
                rows.forEach(row => {
                    const initial = Number(
                        row.getAttribute(
                            'data-initial-value',
                        ),
                    );
                    const unset =
                        row.getAttribute(
                            'data-unset',
                        ) === 'true';
                    const objectiveId =
                        row.getAttribute(
                            'data-objective-id',
                        )!;
                    const slider =
                        row.querySelector(
                            'input[type="range"]',
                        ) as HTMLInputElement;
                    const value =
                        Number(slider.value);
                    const touched =
                        (slider as HTMLElement & {
                            dataset: DOMStringMap;
                        }).dataset.touched ===
                        'true';
                    if (
                        value !== initial
                        || (unset && touched)
                    ) {
                        moved.push({
                            objectiveId,
                            score: value,
                        });
                    }
                });
                if (moved.length > 0) {
                    await postProjectBaselineScoring(
                        ctx, projectId, moved,
                    );
                }
                closeDialog('score');
            }
        },
        { signal },
    );

    $('#measurement-dialog', document)!
        .addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            if (action === 'cancel') {
                closeDialog('measurement');
            } else if (
                action === 'save-measurement'
            ) {
                const ctx = createRequestContext();
                const moved: {
                    objectiveId: string;
                    score: number;
                }[] = [];
                const rows =
                    document.querySelectorAll(
                        '#measurement-modal-body'
                        + ' .measurement-slider-row',
                    );
                rows.forEach(row => {
                    const initial = Number(
                        row.getAttribute(
                            'data-initial-value',
                        ),
                    );
                    const objectiveId =
                        row.getAttribute(
                            'data-objective-id',
                        )!;
                    const slider =
                        row.querySelector(
                            'input[type="range"]',
                        ) as HTMLInputElement;
                    const value =
                        Number(slider.value);
                    if (value !== initial) {
                        moved.push({
                            objectiveId,
                            score: value,
                        });
                    }
                });
                if (moved.length > 0) {
                    await postProjectActualMeasurement(
                        ctx, projectId, moved,
                    );
                }
                closeDialog('measurement');
            }
        },
        { signal },
    );

    $('#approve-dialog', document)!.addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            if (action === 'cancel-approve') {
                closeDialog('approve');
            } else if (
                action === 'confirm-approve'
            ) {
                const ctx = createRequestContext();
                try {
                    await postProjectApproval(
                        ctx, projectId,
                    );
                    closeDialog('approve');
                } catch (err) {
                    const message =
                        err instanceof Error
                            ? err.message
                            : String(err);
                    showToast(message, 'error');
                    closeDialog('approve');
                    throw err;
                }
            }
        },
        { signal },
    );

    $('#complete-dialog', document)!
        .addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            if (action === 'cancel-complete') {
                closeDialog('complete');
            } else if (
                action === 'confirm-complete'
            ) {
                const ctx = createRequestContext();
                try {
                    await postProjectCompletion(
                        ctx, projectId,
                    );
                    closeDialog('complete');
                } catch (err) {
                    const message =
                        err instanceof Error
                            ? err.message
                            : String(err);
                    showToast(message, 'error');
                    closeDialog('complete');
                    throw err;
                }
            }
        },
        { signal },
    );

    $('#history-backdrop', document)!
        .addEventListener(
        'click',
        () => closeDialog('history'),
        { signal },
    );
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
    if (
        !SUBMIT_ON_ENTER_IDS.has(target.id)
    ) return;
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
    const patch = projectPatchFromDraft(
        state.view,
        state.draft,
    );
    const patchEntity = trimStrings(patch.entity);
    const ctx = createRequestContext();
    const next = { ...entity, ...patchEntity };
    const stateChanged =
        patch.state !== state.view.stateValue();
    try {
        if (stateChanged) {
            await postProjectStateChange(
                ctx, projectId, next, patch.state,
            );
        } else {
            await putProject(ctx, projectId, next);
        }
    } catch (err) {
        log.error(
            'project save failed',
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

async function renderActionBarAndObjectives(
): Promise<void> {
    const pid = currentProjectId;
    if (!pid) return;
    const ctx = createRequestContext();
    const [project, entity, active, scoring] =
        await Promise.all([
            getProject(ctx, pid),
            getProjectRow(ctx, pid),
            getActiveObjectives(ctx),
            getProjectScoring(ctx, pid),
        ]);
    const defs = new Map<string, {
        name: string; description: string;
    }>();
    for (const o of active) {
        defs.set(
            o.id,
            await getCurrentObjectiveDefinition(
                ctx, o.id,
            ),
        );
    }
    const latestBaselines = latestPerPair(
        scoring.baseline,
    );
    const latestActuals = latestPerPair(
        scoring.actual,
    );

    const approvalCheck = validateProjectForApproval(
        entity, active, latestBaselines,
    );
    const completionCheck =
        validateProjectForCompletion(
            entity, latestBaselines, latestActuals,
        );

    const objectiveNames = new Map(
        Array.from(defs.entries())
            .map(([id, def]) => [id, def.name]),
    );
    const actionBar = new ProjectActionBarPresenter(
        pid, project.stateValue(),
        approvalCheck, completionCheck,
        objectiveNames,
    );
    const actionBarEl =
        $('#project-action-bar', document);
    if (actionBarEl) {
        setHtml(actionBarEl, actionBar.buildBar());
    }

    const objSection = new ProjectObjectivesPresenter(
        active, defs, latestBaselines, latestActuals,
    );
    const objEl =
        $('#project-objectives-section', document);
    if (objEl) {
        setHtml(objEl, objSection.buildSection());
    }
}

async function openScoreModal(
    ctx: RequestContext,
    projectId: string,
): Promise<void> {
    const [project, active, scoring] =
        await Promise.all([
            ctx.GET<ProjectEntity>(
                `projects/${projectId}`,
            ),
            getActiveObjectives(ctx),
            getProjectScoring(ctx, projectId),
        ]);
    const defs = new Map<string, {
        name: string; description: string;
    }>();
    for (const o of active) {
        defs.set(
            o.id,
            await getCurrentObjectiveDefinition(
                ctx, o.id,
            ),
        );
    }
    const presenter = new ScoreModalPresenter(
        project, active, defs, scoring.baseline,
    );
    const bodyEl = $('#score-modal-body', document);
    if (bodyEl) {
        setHtml(bodyEl, presenter.buildBody());
    }

    const dialog = $('#score-dialog', document)!;
    const onInput = (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.matches('input[type="range"]')) {
            (t as HTMLElement & {
                dataset: DOMStringMap;
            }).dataset.touched = 'true';
        }
    };
    dialog.addEventListener('input', onInput);
    const cleanupOnClose = () =>
        dialog.removeEventListener(
            'input', onInput,
        );
    dialog.addEventListener(
        'close', cleanupOnClose, { once: true },
    );

    openDialog('score');
}

async function openMeasurementModal(
    ctx: RequestContext,
    projectId: string,
): Promise<void> {
    const [project, scoring] = await Promise.all([
        ctx.GET<ProjectEntity>(
            `projects/${projectId}`,
        ),
        getProjectScoring(ctx, projectId),
    ]);
    const defs = new Map<string, {
        name: string; description: string;
    }>();
    const baselineObjIds = new Set(
        latestPerPair(scoring.baseline)
            .map(b => b.objective_id),
    );
    for (const objId of baselineObjIds) {
        defs.set(
            objId,
            await getCurrentObjectiveDefinition(
                ctx, objId,
            ),
        );
    }
    const presenter = new MeasurementModalPresenter(
        project, defs,
        scoring.baseline, scoring.actual,
    );
    const bodyEl =
        $('#measurement-modal-body', document);
    if (bodyEl) {
        setHtml(bodyEl, presenter.buildBody());
    }
    openDialog('measurement');
}

function openApproveConfirmation(): void {
    const msgEl =
        $('#approve-message', document);
    if (msgEl) {
        msgEl.textContent =
            'Approve this project? This action '
            + 'records the baseline scores as '
            + 'final and marks the project as '
            + 'approved.';
    }
    openDialog('approve');
}

function openCompleteConfirmation(): void {
    const msgEl =
        $('#complete-message', document);
    if (msgEl) {
        msgEl.textContent =
            'Mark this project as completed? '
            + 'Every baseline-scored objective '
            + 'must have at least one actual '
            + 'measurement.';
    }
    openDialog('complete');
}

async function openHistoryModal(
    ctx: RequestContext,
    projectId: string,
): Promise<void> {
    const scoring = await getProjectScoring(
        ctx, projectId,
    );
    const baselineObjIds = new Set(
        scoring.baseline.map(b => b.objective_id),
    );
    for (const a of scoring.actual) {
        baselineObjIds.add(a.objective_id);
    }
    const revisions: ObjectiveRevision[] = [];
    const allDeprecations =
        await getObjectiveDeprecationEvents(ctx);
    const deprecations = allDeprecations.filter(
        d => baselineObjIds.has(d.objectiveId),
    );
    for (const objId of baselineObjIds) {
        const revs = await getObjectiveRevisions(
            ctx, objId,
        );
        revisions.push(...revs);
    }
    const revsByObj = new Map<
        string, ObjectiveRevision[]
    >();
    for (const r of revisions) {
        const arr =
            revsByObj.get(r.objective_id) ?? [];
        arr.push(r);
        revsByObj.set(r.objective_id, arr);
    }
    const resolver = (
        objId: string, atTime: string,
    ) => {
        const arr =
            revsByObj.get(objId) ?? [];
        const eligible = arr.filter(
            r => r.at <= atTime,
        );
        if (eligible.length === 0) {
            return undefined;
        }
        eligible.sort((a, b) =>
            b.at.localeCompare(
                a.at,
            ),
        );
        return {
            name: eligible[0]!.name,
            description: eligible[0]!.description,
        };
    };
    const presenter =
        new ProjectScoreHistoryPresenter(
            scoring.baseline, scoring.actual,
            revisions, deprecations, resolver,
        );
    const bodyEl =
        $('#history-modal-body', document);
    if (bodyEl) {
        setHtml(bodyEl, presenter.buildBody());
    }
    openDialog('history');
}
