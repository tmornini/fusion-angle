import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { ICON_SIZE, iconFolderKanban } from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    createRequestContext,
    sessionContext,
    getProjects,
    getProjectsScoreColumn,
    putProjectPosition,
    isProjectState,
    subscribeProjectChanges,
    subscribeProjectScoreChanges,
    subscribeObjectiveChanges,
    type Project,
} from '../app/adapters/index.ts';
import {
    ProjectListPresenter,
    buildInitialProjectListState,
    applyProjectListUpdate,
    applyProjectFilterToggle,
    applyProjectSortToggle,
    type ProjectListState,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const { signal } = createPageAbort();

type ScoreRow = Awaited<
    ReturnType<typeof getProjectsScoreColumn>
>[number];

let projectState: ProjectListState | null = null;
let scoreMap: Map<string, ScoreRow> = new Map();
let projectListEl: HTMLElement | null = null;
let projectBadgesEl: HTMLElement | null = null;
let projectSortControlsEl: HTMLElement | null = null;

async function loadScoreMap(
    ctx: ReturnType<typeof createRequestContext>,
): Promise<Map<string, ScoreRow>> {
    const scoreColumn =
        await getProjectsScoreColumn(ctx);
    return new Map(
        scoreColumn.map(
            s => [s.projectId, s],
        ),
    );
}

export async function init(): Promise<void> {
    const listEl = $required(
        '#projects-list', document,
    );

    const ctx = sessionContext();
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        // Match the refresh idiom: projects + scores in
        // one wave. Return Project[] so the empty-state
        // arc still sees an empty list as empty.
        fetch: async () => {
            const [projects, scores] =
                await Promise.all([
                    getProjects(ctx),
                    loadScoreMap(ctx),
                ]);
            scoreMap = scores;
            return projects;
        },
        retry: init,
        emptyState: {
            icon: iconFolderKanban(ICON_SIZE['2xl'], ''),
            title: 'No Projects Yet',
            description:
                'Ideas, when promoted, become a project.',
            action: {
                label: 'Create Idea',
                href: '../ideas/create.html',
            },
        },
        onData: projects => onProjectsLoaded(
            projects, listEl, ctx,
        ),
    });
}

async function onProjectsLoaded(
    projects: Project[],
    listEl: HTMLElement,
    ctx: ReturnType<typeof createRequestContext>,
): Promise<void> {
    // scoreMap already filled by the boot fetch wave.
    // ctx is retained for the drag-reorder / subscriber
    // wiring below that still needs a live context.
    void ctx;

    projectState =
        buildInitialProjectListState(projects);
    projectListEl = listEl;
    projectBadgesEl = $(
        '#status-badges', document,
    );
    projectSortControlsEl = $(
        '#sort-controls', document,
    );

    rerenderProjects();
    if (projectBadgesEl) {
        projectBadgesEl.addEventListener(
            'click', onBadgeClick,
            { signal },
        );
    }
    if (projectSortControlsEl) {
        projectSortControlsEl.addEventListener(
            'click', onSortClick,
            { signal },
        );
    }
    listEl.addEventListener(
        'click',
        e => onCardClick(e),
        { signal },
    );

    subscribeProjectChanges(async () => {
        const refreshCtx = sessionContext();
        const [refreshedProjects, scores] =
            await Promise.all([
                getProjects(refreshCtx),
                loadScoreMap(refreshCtx),
            ]);
        projectState = applyProjectListUpdate(
            projectState!, refreshedProjects,
        );
        scoreMap = scores;
        rerenderProjects();
    });

    subscribeProjectScoreChanges(async () => {
        const col = await getProjectsScoreColumn(
            sessionContext(),
        );
        scoreMap = new Map(
            col.map(s => [s.projectId, s]),
        );
        rerenderProjects();
    });

    subscribeObjectiveChanges(async () => {
        const col = await getProjectsScoreColumn(
            sessionContext(),
        );
        scoreMap = new Map(
            col.map(s => [s.projectId, s]),
        );
        rerenderProjects();
    });

    initDragReorder(
        listEl,
        '[data-project-card]',
        'data-project-card',
        async (id, newPosition) => {
            if (!projectState) return;
            const project = projectState.projects
                .find(p => p.idForLink() === id);
            if (!project) return;
            await putProjectPosition(
                sessionContext(), id,
                newPosition,
                {
                    state: project.stateValue(),
                },
            );
        },
    );
}

function rerenderProjects(): void {
    const presenter = new ProjectListPresenter(
        projectState!, scoreMap,
    );
    if (projectBadgesEl) {
        presenter.renderBadges(projectBadgesEl);
    }
    if (projectSortControlsEl) {
        presenter.renderSortControls(
            projectSortControlsEl,
        );
    }
    presenter.renderList(projectListEl!);
}

function onSortClick(e: MouseEvent): void {
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const toggle = e.target.closest<HTMLElement>(
        '[data-sort-toggle]',
    );
    if (!toggle) return;
    projectState = applyProjectSortToggle(
        projectState!,
    );
    rerenderProjects();
}

function onBadgeClick(e: MouseEvent): void {
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const badge = e.target.closest<HTMLElement>(
        '[data-state]',
    );
    if (!badge) return;
    const s = getRequiredAttribute(badge, 'data-state');
    if (!isProjectState(s)) return;
    projectState = applyProjectFilterToggle(
        projectState!, s,
    );
    rerenderProjects();
}

function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    // Real links navigate themselves, and
    // the reorder handle is not navigation.
    if (e.target.closest(
        'a[href], .drag-handle',
    )) return;
    const card = e.target
        .closest<HTMLElement>(
            '[data-project-card]',
        );
    if (!card) return;
    navigateTo('project-detail', {
        projectId: getRequiredAttribute(
            card, 'data-project-card',
        ),
    });
}
