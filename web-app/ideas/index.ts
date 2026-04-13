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
    iconLightbulb,
} from '../app/icons';
import {
    navigateTo,
} from '../app/core';
import {
    getIdeas,
    putIdea,
    ideaChanged,
    type IdeaStatus,
    isIdeaStatus,
} from '../app/adapters';
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
                    Create Your First Idea`,
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
                const convertBtn =
                    e.target
                        .closest<HTMLElement>(
                        '[data-idea-convert]',
                    );
                if (convertBtn) {
                    navigateTo(
                        'idea-convert',
                        {
                            ideaId: attr(
                                convertBtn,
                                'data-idea'
                                + '-convert',
                            ),
                            from: 'list',
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

    ideaChanged.subscribe(async () => {
        const updated =
            await getIdeas();
        presenter.update(updated);
        renderList();
    });

    initDragReorder(
        listContainer,
        '[data-idea-card]',
        'data-idea-card',
        async (id, newPosition) => {
            await putIdea(
                id,
                { position: newPosition },
            );
        },
    );
}
