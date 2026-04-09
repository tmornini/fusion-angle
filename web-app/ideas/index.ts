import {
    $,
    attr,
    populateIcons,
} from '../app/dom';
import {
    html,
    setHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconPlus,
    iconWand,
    iconLightbulb,
} from '../app/icons';
import {
    navigateTo,
} from '../app/core';
import {
    getIdeas,
    putIdea,
} from '../app/adapters';
import {
    type IdeaStatus,
    isIdeaStatus,
} from '../../api/types';
import {
    IdeaListPresenter,
} from '../app/presenters';
import {
    initDragReorder,
} from '../app/drag-reorder';

export async function init(): Promise<void> {
    const listContainer =
        $('#ideas-list', document);
    if (!listContainer) return;

    const result = await withLoadingState(
        listContainer,
        buildSkeleton('card-list', 4),
        getIdeas,
        init,
        {
            icon: iconLightbulb(24, ''),
            title: 'No Ideas Yet',
            description:
                'Start innovating by'
                + ' creating'
                + ' your first idea.',
            action: {
                label: html`${iconPlus(16, '')}
                    Create Your First Idea
                    ${iconWand(16, '')}`,
                href:
                    'create.html',
            },
            onEmpty: () => {
                $(
                    '#create-idea-btn', document,
                )?.remove();
            },
        },
    );
    if (!result) return;
    const presenter =
        new IdeaListPresenter(result);

    populateIcons([
        [
            '#create-btn-icon',
            iconPlus(16, ''),
        ],
        [
            '#create-btn-accent',
            iconWand(16, ''),
        ],
    ]);

    $('#create-idea-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-create',
            ),
        );

    const badgesEl = $(
        '#status-badges', document,
    );
    if (badgesEl) {
        setHtml(
            badgesEl,
            presenter
                .renderStatusBadges(),
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
                if (!isIdeaStatus(s))
                    return;
                presenter.toggleFilter(
                    s,
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
        active: IdeaStatus | null,
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
        const list = $(
            '#ideas-list', document,
        );
        if (list)
            setHtml(
                list,
                presenter.renderList(),
            );
    }

    $('#ideas-list', document)
        ?.addEventListener(
            'click',
            (e) => {
                if (
                    !(e.target
                        instanceof Element)
                ) return;
                const actionButton =
                    e.target
                        .closest<HTMLElement>(
                        '[data-idea-review],'
                        + ' [data-idea-convert]',
                    );
                if (actionButton) {
                    if (
                        actionButton
                            .hasAttribute(
                            'data-idea-review',
                        )
                    )
                        navigateTo(
                            'idea-detail',
                            {
                                ideaId: attr(
                                    actionButton,
                                    'data-idea'
                                    + '-review',
                                ),
                            },
                        );
                    else if (
                        actionButton
                            .hasAttribute(
                            'data-idea-convert',
                        )
                    )
                        navigateTo(
                            'idea-convert',
                            {
                                ideaId: attr(
                                    actionButton,
                                    'data-idea'
                                    + '-convert',
                                ),
                            },
                        );
                    return;
                }
                const card =
                    e.target
                        .closest<HTMLElement>(
                            '[data-idea-card]',
                        );
                if (card)
                    navigateTo(
                        'idea-detail',
                        {
                            ideaId: attr(
                                card,
                                'data-idea'
                                + '-card',
                            ),
                        },
                    );
            },
        );

    renderList();

    initDragReorder(
        listContainer,
        '[data-idea-card]',
        'data-idea-card',
        async (id, newPosition) => {
            await putIdea(
                id,
                { position: newPosition },
            );
            const updated =
                await getIdeas();
            presenter.update(updated);
            renderList();
        },
    );
}
