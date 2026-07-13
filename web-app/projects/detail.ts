import {
    $, $$, $button, $input,
    $inputRequired, $required,
    isFormField,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import {
    createPageAbort,
    bindPageListeners,
} from '../app/page-lifecycle.ts';
import {
    extractErrorMessage,
    reportFault,
} from '../app/error-helpers.ts';
import {
    makeFieldKeyValidator,
} from '../app/field-key-validator.ts';
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
    handleDialogClick,
} from '../app/core.ts';
import {
    Project,
    getProject,
    getProjectEntity,
    projectStateDetailFromRow,
    ProjectView,
    putProjectFields,
    postProjectStateChange,
    getFlowsByProject,
    postFlowCreation,
    subscribeProjectChanges,
    generateCryptoSafeBase62,
    sessionContext,
    type RequestContext,
    getProjectScoring,
    postProjectBaselineScoring,
    postProjectActualMeasurement,
    subscribeProjectScoreChanges,
    getActiveObjectives,
    getObjectives,
    getCurrentObjectiveDefinitions,
    getObjectiveRevisionsByObjective,
    getObjectiveArchivalEvents,
    subscribeObjectiveChanges,
    postProjectApproval,
    postProjectArchival,
    validateProjectForApproval,
    validateProjectForArchival,
} from '../app/adapters/index.ts';
import type {
    FlowListItem,
    ProjectEntity,
    ProjectStateDetail,
} from '../app/adapters/index.ts';
import {
    getMemberMap,
    memberName,
} from '../app/adapters/members-union.ts';
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
    ProjectScoreHistoryPresenter,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

type PageState =
    | {
        kind: 'reading';
        view: ProjectView;
        entity: ProjectEntity;
        detail: ProjectStateDetail;
        flows: FlowListItem[];
    }
    | {
        kind: 'editing';
        view: ProjectView;
        entity: ProjectEntity;
        detail: ProjectStateDetail;
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
        'new-flow-name',
    ]);

const isFieldKey = makeFieldKeyValidator(FIELDS);

// DATA-CORRUPTION TRAP: ProjectView's own accessors
// (progressPercent, costActualK) are display-transformed and
// have no position accessor at all — composing a wire body
// from the view would corrupt progress/actual_cost and fail
// to compile on position. So the loader retains the RAW
// entity + state detail beside the view. Lifecycle trio is
// stamped on the ProjectEntity GET row — map via
// projectStateDetailFromRow; no second states hop.
async function loadProjectView(
    projectId: string,
    ctx: RequestContext,
): Promise<{
    view: ProjectView;
    entity: ProjectEntity;
    detail: ProjectStateDetail;
}> {
    const [
        entity,
        objectives,
        scoring,
    ] = await Promise.all([
        getProjectEntity(ctx, projectId),
        getObjectives(ctx),
        getProjectScoring(ctx, projectId),
    ]);
    const detail = projectStateDetailFromRow(entity);
    const view = new ProjectView(
        new Project(entity, detail),
        objectives,
        scoring.baseline,
        scoring.actual,
    );
    return { view, entity, detail };
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
    reconcileActionBarVisibility();
}

function reconcileActionBarVisibility(): void {
    const editing = state?.kind === 'editing';
    for (const sel of [
        '#project-review-actions',
        '#project-lifecycle-actions',
    ]) {
        const el = $(sel, document);
        if (el) el.classList.toggle('hidden', editing);
    }
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

    const container = $required(
        '#project-detail-content', document,
    );
    pageContainer = container;
    bindStableListeners(container);
    setHtml(
        container, buildSkeleton('detail', 4),
    );

    let project: {
        view: ProjectView;
        entity: ProjectEntity;
        detail: ProjectStateDetail;
    };
    let flows: FlowListItem[];
    try {
        const ctx = sessionContext();
        [project, flows] = await Promise.all([
            loadProjectView(projectId, ctx),
            getFlowsByProject(ctx, projectId),
        ]);
    } catch (err) {
        log.error(
            'project detail load failed',
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
        $('[data-retry-btn]', container)
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
        detail: project.detail,
        flows,
    };
    buildPresenter().renderShell(container);

    subscribeProjectChanges(async () => {
        if (!state || !pageContainer) {
            return;
        }
        const ctx = sessionContext();
        const [upd, updFlows] =
            await Promise.all([
                loadProjectView(projectId, ctx),
                getFlowsByProject(ctx, projectId),
            ]);
        state = {
            kind: 'reading',
            view: upd.view,
            entity: upd.entity,
            detail: upd.detail,
            flows: updFlows,
        };
        rerender();
        void renderActionBarAndObjectives();
    });

    subscribeProjectScoreChanges(async () => {
        if (!state || !pageContainer) return;
        const ctx = sessionContext();
        const [upd, updFlows] =
            await Promise.all([
                loadProjectView(projectId, ctx),
                getFlowsByProject(ctx, projectId),
            ]);
        state = {
            kind: 'reading',
            view: upd.view,
            entity: upd.entity,
            detail: upd.detail,
            flows: updFlows,
        };
        rerender();
        void renderActionBarAndObjectives();
    });
    subscribeObjectiveChanges(async () => {
        if (!state || !pageContainer) return;
        const ctx = sessionContext();
        const [upd, updFlows] =
            await Promise.all([
                loadProjectView(projectId, ctx),
                getFlowsByProject(ctx, projectId),
            ]);
        state = {
            kind: 'reading',
            view: upd.view,
            entity: upd.entity,
            detail: upd.detail,
            flows: updFlows,
        };
        rerender();
        void renderActionBarAndObjectives();
    });

    await renderActionBarAndObjectives();

    const onActionClick = async (
        e: Event,
    ): Promise<void> => {
        const action =
            (e.target as HTMLElement)
                .closest('[data-action]')
                ?.getAttribute('data-action');
        const ctx = sessionContext();
        if (action === 'approve') {
            openApproveConfirmation();
        } else if (action === 'archive') {
            openArchiveConfirmation();
        } else if (
            action === 'view-history'
        ) {
            await openHistoryModal(
                ctx, projectId,
            );
        }
    };
    $('#project-review-actions', document)!
        .addEventListener(
            'click', onActionClick, { signal },
        );
    $('#project-lifecycle-actions', document)!
        .addEventListener(
            'click', onActionClick, { signal },
        );

    $('#approve-dialog', document)!.addEventListener(
        'click',
        async (e) => {
            const target = e.target as Element;
            if (handleDialogClick(target, e)) return;
            const action = target
                .closest('[data-action]')
                ?.getAttribute('data-action');
            if (action === 'confirm-approve') {
                const ctx = sessionContext();
                try {
                    await postProjectApproval(
                        ctx, projectId,
                    );
                    closeDialog('approve');
                } catch (err) {
                    const message = extractErrorMessage(err);
                    showToast(message, 'error');
                    closeDialog('approve');
                    throw err;
                }
            }
        },
        { signal },
    );

    $('#archive-dialog', document)!
        .addEventListener(
        'click',
        async (e) => {
            const target = e.target as Element;
            if (handleDialogClick(target, e)) return;
            const action = target
                .closest('[data-action]')
                ?.getAttribute('data-action');
            if (action === 'confirm-archive') {
                const ctx = sessionContext();
                try {
                    await postProjectArchival(
                        ctx, projectId,
                    );
                    closeDialog('archive');
                } catch (err) {
                    const message = extractErrorMessage(err);
                    showToast(message, 'error');
                    closeDialog('archive');
                    throw err;
                }
            }
        },
        { signal },
    );

    $('#history-dialog', document)!.addEventListener(
        'click',
        (e) => {
            const target = e.target;
            if (target instanceof Element) {
                handleDialogClick(target, e);
            }
        },
        { signal },
    );

    $('#project-objectives-section', document)!
        .addEventListener(
        'click',
        async (e) => {
            const action =
                (e.target as HTMLElement)
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
            if (action === 'save-objectives') {
                await handleSaveObjectives(
                    projectId,
                );
            }
        },
        { signal },
    );

    $('#project-objectives-section', document)!
        .addEventListener(
        'input',
        (e) => {
            const target = e.target as HTMLElement;
            if (!target.matches(
                'input[type="range"]',
            )) return;
            const row = target.closest(
                '.project-objective-row',
            );
            if (!row) return;
            const sliderContainer = target.closest(
                '.project-objective-slider',
            );
            const valueEl = sliderContainer
                ? $('.slider-value', sliderContainer)
                : null;
            if (valueEl) {
                const v = Number(
                    (target as HTMLInputElement)
                        .value,
                );
                const sign = v > 0 ? '+' : '';
                valueEl.textContent = sign
                    + String(v);
            }
            const section = $(
                '#project-objectives-section',
                document,
            );
            if (!section) return;
            const sliders = $$(
                'input[type="range"]', section,
            );
            let dirty = false;
            sliders.forEach(s => {
                const inp =
                    s as HTMLInputElement;
                if (inp.disabled) return;
                const initial = Number(
                    inp.dataset['initialValue'],
                );
                const value = Number(inp.value);
                if (value !== initial) {
                    dirty = true;
                }
            });
            const saveBtn = $button(
                '[data-action="save-objectives"]',
                section,
            );
            if (saveBtn) {
                saveBtn.disabled = !dirty;
            }
        },
        { signal },
    );
}

function bindStableListeners(
    container: HTMLElement,
): void {
    bindPageListeners(container, {
        click: e => onClick(e),
        input: e => onInput(e),
        change: e => onInput(e),
        keydown: e => onContainerKeydown(e),
    }, signal);
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

    if (handleDialogClick(target, e)) {
        return;
    }
    if (handleFlowCardClick(e, target)) {
        return;
    }
    handleProjectActions(target);
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
                detail: state.detail,
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
                detail: state.detail,
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
        detail: state.detail,
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
    const detail = state.detail;
    const ctx = sessionContext();
    // Inside the first try: a draft with an empty/invalid
    // cost throws here and surfaces as the toast. The put
    // and the lifecycle hop are separate tries — put
    // success + post failure must not share one catch.
    let fields;
    let nextState;
    let stateChanged;
    try {
        const patch = projectPatchFromDraft(
            state.view,
            state.draft,
        );
        fields = trimStrings(patch.fields);
        nextState = patch.state;
        stateChanged =
            patch.state !== state.view.stateValue();
        await putProjectFields(
            ctx, projectId, fields, detail,
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to save project', err,
        );
        return;
    }
    // Fields are now patched. If the lifecycle hop
    // fails, the entity carries new fields with a
    // stale state — name the half-state explicitly.
    if (stateChanged) {
        // DATA-CORRUPTION TRAP: the eight fields come
        // from the RETAINED RAW entity (progress,
        // actual_cost, position never touched by this
        // form) plus the patch's five edited fields —
        // never from ProjectView's display-transformed
        // accessors.
        try {
            const {
                id: _id,
                organization_id: _org,
                state: _priorState,
                state_at: _priorAt,
                state_event_id: _priorEventId,
                ...entityFields
            } = entity;
            void _priorState;
            void _priorAt;
            void _priorEventId;
            await postProjectStateChange(
                ctx, projectId,
                {
                    ...entityFields,
                    title: fields.title,
                    description: fields.description,
                    start_date: fields.startDate,
                    target_end_date:
                        fields.targetEndDate,
                    estimated_cost:
                        fields.estimatedCost,
                },
                nextState,
            );
        } catch (err) {
            reportFault(
                ctx,
                'Project fields saved, but state'
                + ' change failed',
                err,
            );
            return;
        }
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
            sessionContext(),
            {
                flowId,
                linkId,
                projectId,
                name,
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
    const ctx = sessionContext();
    const [project, active, scoring] =
        await Promise.all([
            getProject(ctx, pid),
            getActiveObjectives(ctx),
            getProjectScoring(ctx, pid),
        ]);
    const defs =
        await getCurrentObjectiveDefinitions(
            ctx, active.map(o => o.id),
        );
    const latestBaselines = latestPerPair(
        scoring.baseline,
    );
    const latestActuals = latestPerPair(
        scoring.actual,
    );

    const approvalCheck = validateProjectForApproval(
        active, latestBaselines,
    );
    const archivalCheck =
        validateProjectForArchival(
            latestBaselines, latestActuals,
        );

    const objectiveNames = new Map(
        Array.from(defs.entries())
            .map(([id, def]) => [id, def.name]),
    );
    const actionBar = new ProjectActionBarPresenter(
        pid, project.stateValue(),
        approvalCheck, archivalCheck,
        objectiveNames,
    );
    const reviewEl =
        $('#project-review-actions', document);
    if (reviewEl) {
        setHtml(
            reviewEl,
            actionBar.buildReviewActions(),
        );
    }
    const lifecycleEl =
        $('#project-lifecycle-actions', document);
    if (lifecycleEl) {
        setHtml(
            lifecycleEl,
            actionBar.buildLifecycleActions(),
        );
    }

    const objSection = new ProjectObjectivesPresenter(
        active, defs, latestBaselines, latestActuals,
        project.stateValue(),
    );
    const objEl =
        $('#project-objectives-section', document);
    if (objEl) {
        setHtml(objEl, objSection.buildSection());
    }
}

async function handleSaveObjectives(
    projectId: string,
): Promise<void> {
    const section = $(
        '#project-objectives-section', document,
    );
    if (!section) return;
    const rows = $$(
        '.project-objective-row', section,
    );
    const baselineMoves: {
        objectiveId: string;
        score: number;
    }[] = [];
    const actualMoves: {
        objectiveId: string;
        score: number;
    }[] = [];
    rows.forEach(row => {
        const objectiveId = row.getAttribute(
            'data-objective-id',
        );
        if (!objectiveId) return;
        const baseSlider = $input(
            'input.baseline-slider', row,
        );
        const actSlider = $input(
            'input.actual-slider', row,
        );
        if (baseSlider && !baseSlider.disabled) {
            const initial = Number(
                baseSlider.dataset['initialValue'],
            );
            const value = Number(baseSlider.value);
            if (value !== initial) {
                baselineMoves.push({
                    objectiveId, score: value,
                });
            }
        }
        if (actSlider && !actSlider.disabled) {
            const initial = Number(
                actSlider.dataset['initialValue'],
            );
            const value = Number(actSlider.value);
            if (value !== initial) {
                actualMoves.push({
                    objectiveId, score: value,
                });
            }
        }
    });
    const ctx = sessionContext();
    if (baselineMoves.length > 0) {
        await postProjectBaselineScoring(
            ctx, projectId, baselineMoves,
        );
    }
    if (actualMoves.length > 0) {
        await postProjectActualMeasurement(
            ctx, projectId, actualMoves,
        );
    }
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

function openArchiveConfirmation(): void {
    const msgEl =
        $('#archive-message', document);
    if (msgEl) {
        msgEl.textContent =
            'Archive this project? '
            + 'Every baseline-scored objective '
            + 'must have at least one actual '
            + 'measurement.';
    }
    openDialog('archive');
}

async function openHistoryModal(
    ctx: RequestContext,
    projectId: string,
): Promise<void> {
    const scoring = await getProjectScoring(
        ctx, projectId,
    );
    const baselineObjIds = new Set(
        scoring.baseline.map(b => b.objectiveId),
    );
    for (const a of scoring.actual) {
        baselineObjIds.add(a.objectiveId);
    }
    const allArchivals =
        await getObjectiveArchivalEvents(ctx);
    const archivals = allArchivals.filter(
        d => baselineObjIds.has(d.objectiveId),
    );
    const revsByObj =
        await getObjectiveRevisionsByObjective(
            ctx, Array.from(baselineObjIds),
        );
    const revisions = Array.from(
        baselineObjIds,
    ).flatMap(id => revsByObj.get(id) ?? []);
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
    const memberMap = await getMemberMap(ctx);
    const presenter =
        new ProjectScoreHistoryPresenter(
            scoring.baseline, scoring.actual,
            revisions, archivals, resolver,
            memberId => memberName(memberMap, memberId),
        );
    const bodyEl =
        $('#history-modal-body', document);
    if (bodyEl) {
        setHtml(bodyEl, presenter.buildBody());
    }
    openDialog('history');
}
