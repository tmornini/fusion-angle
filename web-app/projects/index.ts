import { $, getRequiredAttribute } from '../app/dom.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import { iconFolderKanban } from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    createRequestContext,
    getProjectRows,
    getProjects,
    getProjectsScoreColumn,
    putProject,
    isProjectState,
    subscribeProjectChanges,
    subscribeProjectScoreChanges,
    subscribeObjectiveChanges,
    type ProjectEntity,
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

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type ScoreRow = Awaited<
    ReturnType<typeof getProjectsScoreColumn>
>[number];

let projectState: ProjectListState | null = null;
let projectEntities:
    Map<string, ProjectEntity> = new Map();
let scoreMap: Map<string, ScoreRow> = new Map();
let projectListEl: HTMLElement | null = null;
let projectBadgesEl: HTMLElement | null = null;
let projectSortControlsEl: HTMLElement | null = null;

async function loadProjectsAndEntities(
    ctx: ReturnType<typeof createRequestContext>,
): Promise<{
    projects: Awaited<
        ReturnType<typeof getProjects>
    >;
    entities: Map<string, ProjectEntity>;
    scores: Map<string, ScoreRow>;
}> {
    const [rows, projects, scoreColumn] =
        await Promise.all([
            getProjectRows(ctx),
            getProjects(ctx),
            getProjectsScoreColumn(ctx),
        ]);
    return {
        projects,
        entities: new Map(
            rows.map(r => [r.id, r]),
        ),
        scores: new Map(
            scoreColumn.map(
                s => [s.projectId, s],
            ),
        ),
    };
}

export async function init(): Promise<void> {
    const listEl = $(
        '#projects-list', document,
    );
    if (!listEl) return;

    const ctx = createRequestContext();
    const loaded = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        () => loadProjectsAndEntities(ctx),
        init,
        {
            icon: iconFolderKanban(24, ''),
            title: 'No Projects Yet',
            description:
                'Convert approved ideas'
                + ' into projects to start'
                + ' tracking progress.',
            action: {
                label: 'View Ideas',
                href: '../ideas/index.html',
            },
        },
    );
    if (!loaded) return;

    projectState =
        buildInitialProjectListState(
            loaded.projects,
        );
    projectEntities = loaded.entities;
    scoreMap = loaded.scores;
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
        if (!projectState || !projectListEl) {
            return;
        }
        const refreshed =
            await loadProjectsAndEntities(
                createRequestContext(),
            );
        projectState = applyProjectListUpdate(
            projectState, refreshed.projects,
        );
        projectEntities = refreshed.entities;
        scoreMap = refreshed.scores;
        rerenderProjects();
    });

    subscribeProjectScoreChanges(async () => {
        if (!projectListEl) return;
        const col = await getProjectsScoreColumn(
            createRequestContext(),
        );
        scoreMap = new Map(
            col.map(s => [s.projectId, s]),
        );
        rerenderProjects();
    });

    subscribeObjectiveChanges(async () => {
        if (!projectListEl) return;
        const col = await getProjectsScoreColumn(
            createRequestContext(),
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
            const entity =
                projectEntities.get(id);
            if (!entity) return;
            await putProject(
                createRequestContext(), id,
                {
                    ...entity,
                    position: newPosition,
                },
            );
        },
    );
}

function rerenderProjects(): void {
    if (!projectState || !projectListEl) return;
    const presenter = new ProjectListPresenter(
        projectState, scoreMap,
    );
    if (projectBadgesEl) {
        presenter.renderBadges(projectBadgesEl);
    }
    if (projectSortControlsEl) {
        presenter.renderSortControls(
            projectSortControlsEl,
        );
    }
    presenter.renderList(projectListEl);
}

function onSortClick(e: MouseEvent): void {
    if (!projectState) return;
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const toggle = e.target.closest<HTMLElement>(
        '[data-sort-toggle]',
    );
    if (!toggle) return;
    projectState = applyProjectSortToggle(
        projectState,
    );
    rerenderProjects();
}

function onBadgeClick(e: MouseEvent): void {
    if (
        !projectState || !projectBadgesEl
        || !projectListEl
    ) return;
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
        projectState, s,
    );
    rerenderProjects();
}

function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
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
