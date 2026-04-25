import { $, attr } from '../app/dom';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import { iconFolderKanban } from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getProjects,
    getProjectEntity,
    putProject,
    isProjectStatus,
    type ProjectStatus,
} from '../app/adapters';
import {
    ProjectListPresenter,
} from '../app/presenters';
import {
    initDragReorder,
} from '../app/drag-reorder';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

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

    const presenter =
        new ProjectListPresenter(projects);

    const badgesEl = $(
        '#status-badges', document,
    );
    if (badgesEl) {
        presenter.renderBadges(badgesEl);
        badgesEl.addEventListener(
            'click',
            e => onBadgeClick(
                e, badgesEl, presenter,
            ),
            { signal },
        );
    }

    presenter.renderList(listEl);
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
            presenter.update(updated);
            presenter.renderList(listEl);
        },
    );
}

function onBadgeClick(
    e: MouseEvent,
    badgesEl: HTMLElement,
    p: ProjectListPresenter,
): void {
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const badge = e.target.closest<HTMLElement>(
        '[data-status]',
    );
    if (!badge) return;
    const s = attr(badge, 'data-status');
    if (!isProjectStatus(s)) return;
    p.toggleFilter(s as ProjectStatus);
    p.renderBadges(badgesEl);
    const listEl = $(
        '#projects-list', document,
    );
    if (listEl) p.renderList(listEl);
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
        projectId: attr(
            card, 'data-project-card',
        ),
    });
}
