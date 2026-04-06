import {
    $,
    attr,
    populateIcons,
    initToggleGroup,
} from '../app/dom';
import {
    setHtml,
    html,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconLayoutGrid,
    iconBarChart,
    iconFolderKanban,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    type ProjectStatus,
    isProjectStatus,
} from '../../api/types';
import { getProjects } from '../app/adapters';
import {
    ProjectListPresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const listContainer =
        $('#projects-list', document);
    if (!listContainer) return;

    const result = await withLoadingState(
        listContainer,
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
                href:
                    '../ideas/index.html',
            },
        },
    );
    if (!result) return;
    const presenter =
        new ProjectListPresenter(result);

    populateIcons([
        [
            '#priority-view-icon',
            iconLayoutGrid(16, ''),
        ],
        [
            '#performance-view-icon',
            iconBarChart(16, ''),
        ],
    ]);

    const badgesEl = $(
        '#status-badges', document,
    );
    if (badgesEl) {
        setHtml(
            badgesEl,
            presenter.renderStatusBadges(),
        );
        badgesEl.addEventListener(
            'click',
            (e) => {
                if (
                    !(e.target
                        instanceof
                        HTMLElement)
                ) return;
                const badge =
                    e.target.closest<
                        HTMLElement
                    >('[data-status]');
                if (!badge) return;
                const s = attr(
                    badge,
                    'data-status',
                );
                if (!isProjectStatus(s))
                    return;
                presenter.toggleFilter(
                    s as ProjectStatus,
                );
                updateBadgeStyles(
                    badgesEl,
                    presenter
                        .activeFilter(),
                );
                renderList();
            },
        );
    }

    function updateBadgeStyles(
        container: Element,
        active: ProjectStatus | null,
    ): void {
        container
            .querySelectorAll(
                '[data-status]',
            )
            .forEach(el => {
                if (
                    el instanceof
                    HTMLElement
                ) {
                    el.style.opacity =
                        active
                        && attr(
                            el,
                            'data-status',
                        ) !== active
                            ? '0.4'
                            : '1';
                }
            });
    }

    function renderList(): void {
        const container =
            $('#projects-list', document);
        if (container) {
            setHtml(
                container,
                presenter.renderList(),
            );
        }
        const info =
            $('#projects-info', document);
        if (info) {
            info.textContent =
                presenter.countLabel();
        }
    }

    listContainer.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            const card =
                e.target
                    .closest<HTMLElement>(
                        '[data-project-card]',
                    );
            if (card)
                navigateTo(
                    'project-detail',
                    {
                        projectId: attr(
                            card,
                            'data-project'
                            + '-card',
                        ),
                    },
                );
        },
    );

    initToggleGroup(
        '.view-toggle-btn',
        'data-view',
        (view) => {
            presenter.setView(
                view as
                    | 'priority'
                    | 'performance',
            );
            renderList();
        },
    );

    renderList();
}
