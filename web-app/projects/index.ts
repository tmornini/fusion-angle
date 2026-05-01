import { $, getRequiredAttribute } from '../app/dom.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import { iconFolderKanban } from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    createFetchContext,
    getProjects,
    putProject,
    isProjectStatus,
    subscribeProjectChanges,
    type ProjectStatus,
    type ProjectEntity,
} from '../app/adapters/index.ts';
import {
    ProjectListPresenter,
    buildInitialProjectListState,
    applyProjectListUpdate,
    applyProjectFilterToggle,
    type ProjectListState,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let projectState: ProjectListState | null = null;
let projectEntities:
    Map<string, ProjectEntity> = new Map();
let projectListEl: HTMLElement | null = null;
let projectBadgesEl: HTMLElement | null = null;

async function loadProjectsAndEntities(
    ctx: ReturnType<typeof createFetchContext>,
): Promise<{
    projects: Awaited<ReturnType<typeof getProjects>>;
    entities: Map<string, ProjectEntity>;
}> {
    const [rows, projects] = await Promise.all([
        ctx.getProjectRows(),
        getProjects(ctx),
    ]);
    return {
        projects,
        entities: new Map(
            rows.map(r => [r.id, r]),
        ),
    };
}

export async function init(): Promise<void> {
    const listEl = $(
        '#projects-list', document,
    );
    if (!listEl) return;

    const ctx = createFetchContext();
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
    projectListEl = listEl;
    projectBadgesEl = $(
        '#status-badges', document,
    );

    rerenderProjects();
    if (projectBadgesEl) {
        projectBadgesEl.addEventListener(
            'click', onBadgeClick,
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
                createFetchContext(),
            );
        projectState = applyProjectListUpdate(
            projectState, refreshed.projects,
        );
        projectEntities = refreshed.entities;
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
                createFetchContext(), id,
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
    const presenter =
        new ProjectListPresenter(projectState);
    if (projectBadgesEl) {
        presenter.renderBadges(projectBadgesEl);
    }
    presenter.renderList(projectListEl);
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
        '[data-status]',
    );
    if (!badge) return;
    const s = getRequiredAttribute(badge, 'data-status');
    if (!isProjectStatus(s)) return;
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
