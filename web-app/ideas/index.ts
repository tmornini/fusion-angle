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
    iconClipboardCheck,
    iconChevronRight,
    iconLightbulb,
} from '../app/icons';
import {
    navigateTo,
} from '../app/core';
import { getIdeas } from '../app/adapters';
import {
    IdeaListPresenter,
} from '../app/presenters';

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

    const flowEl =
        $('#flow-indicator', document);
    if (flowEl) {
        setHtml(flowEl, html`
        ${iconLightbulb(16, 'text-primary')}
        <span class="text-sm text-muted"
            style="white-space:nowrap">
            <span class="font-medium"
                style="color:hsl(
                    var(--foreground))">
                Idea Flow:
            </span>
            Create &rarr;
            Review &rarr; Convert
        </span>
        ${iconChevronRight(
            16, 'text-muted',
        )}`);
    }

    const pendingReviewCount =
        presenter.pendingReviewCount();
    const reviewBtnEl = $(
        '#review-queue-btn', document,
    );
    if (reviewBtnEl
        && pendingReviewCount > 0) {
        setHtml(reviewBtnEl, html`
        <button
            class="btn btn-outline gap-2"
            style="border-color:hsl(
                var(--warning)/0.3);
                color:hsl(var(--warning))"
            id="review-queue-nav">
            ${iconClipboardCheck(16, '')}
            <span class="hidden-mobile">
                Review Queue
            </span> (${pendingReviewCount})
        </button>`);
        $('#review-queue-nav', document)
            ?.addEventListener(
                'click',
                () => navigateTo(
                    'idea-review-queue',
                ),
            );
    }

    $('#create-idea-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-create',
            ),
        );

    function renderList(): void {
        const list = $(
            '#ideas-list', document,
        );
        if (list)
            setHtml(
                list,
                presenter.renderList(),
            );

        const count =
            $('#ideas-count', document);
        if (count)
            count.textContent =
                presenter.countLabel();
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
                            'approval-detail',
                            {
                                id: attr(
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
}
