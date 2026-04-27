import { $, getRequiredAttribute } from '../app/dom.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import { iconFolderKanban } from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    getProjects,
    getProjectEntity,
    putProject,
    isProjectStatus,
    type ProjectStatus,
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
let projectListEl: HTMLElement | null = null;
let projectBadgesEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const listEl = $(
        '#projects-list', document,
    );
    if (!listEl) return;

    const projects = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        getProjects,
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
    if (!projects) return;

    projectState =
        buildInitialProjectListState(projects);
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

    initDragReorder(
        listEl,
        '[data-project-card]',
        'data-project-card',
        async (id, newPosition) => {
            const entity =
                await getProjectEntity(id);
            await putProject(id, {
                ...entity,
                position: newPosition,
            });
            const updated =
                await getProjects();
            if (!projectState) return;
            projectState = applyProjectListUpdate(
                projectState, updated,
            );
            rerenderProjects();
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
