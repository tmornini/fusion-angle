import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { iconFolderKanban } from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    createRequestContext,
    sessionContext,
    getProjectEntities,
    getProjects,
    getProjectsScoreColumn,
    putProject,
    isProjectState,
    subscribeProjectChanges,
    subscribeProjectScoreChanges,
    subscribeObjectiveChanges,
    type Project,
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

const { signal } = createPageAbort();

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

async function loadProjectMaps(
    ctx: ReturnType<typeof createRequestContext>,
): Promise<{
    entities: Map<string, ProjectEntity>;
    scores: Map<string, ScoreRow>;
}> {
    const [rows, scoreColumn] =
        await Promise.all([
            getProjectEntities(ctx),
            getProjectsScoreColumn(ctx),
        ]);
    return {
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
    const listEl = $required(
        '#projects-list', document,
    );

    const ctx = sessionContext();
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => getProjects(ctx),
        retry: init,
        emptyState: {
            icon: iconFolderKanban(24, ''),
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
    const maps = await loadProjectMaps(ctx);

    projectState =
        buildInitialProjectListState(projects);
    projectEntities = maps.entities;
    scoreMap = maps.scores;
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
        const [refreshedProjects, maps] =
            await Promise.all([
                getProjects(refreshCtx),
                loadProjectMaps(refreshCtx),
            ]);
        projectState = applyProjectListUpdate(
            projectState!, refreshedProjects,
        );
        projectEntities = maps.entities;
        scoreMap = maps.scores;
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
            const entity =
                projectEntities.get(id);
            if (!entity) return;
            const {
                organization_id: _org,
                ...fields
            } = entity;
            await putProject(
                sessionContext(), id,
                {
                    ...fields,
                    position: newPosition,
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
