import {
    $, $input, $select, attr,
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
    iconClock,
    iconTrendingUp,
    iconCheckCircle2,
    iconSearch,
    iconClipboardCheck,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getReviewQueue,
} from '../app/adapters';
import {
    ReviewQueuePresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const root = $(
        '#review-queue-content', document,
    );
    if (!root) return;

    const result = await withLoadingState(
        root,
        html`${buildSkeleton('stats-row', 4)}${
            buildSkeleton('card-list', 4)
        }`,
        getReviewQueue,
        init,
        {
            icon: iconClipboardCheck(24, ''),
            title: 'Review Queue Empty',
            description:
                'All ideas have been reviewed.'
                + ' Check back later for'
                + ' new submissions.',
        },
    );
    if (!result) return;
    const presenter =
        new ReviewQueuePresenter(result);
    const stats = presenter.stats();

    setHtml(root, html`
    <div class="${
        'flex items-center'
        + ' justify-between gap-4 mb-6'
    }">
        <div>
            <h1 class="page-title">${
                'Review Queue'
            }</h1>
            <p class="text-muted">${
                'Review and approve'
                + ' submitted ideas'
            }</p>
        </div>
    </div>

    <div class="stats-grid mb-8">
        <div class="card p-4">
            <div class="${
                'flex items-center gap-3'
            }">
                <div class="p-2 rounded-lg"
                    style="${
                        'background:hsl('
                        + 'var(--primary)'
                        + '/0.1)'
                    }">${
                    iconClock(
                        20, 'text-primary',
                    )
                }</div>
                <div>
                    <p class="${
                        'text-2xl font-bold'
                    }">${
                        stats.total}</p>
                    <p class="${
                        'text-sm text-muted'
                    }">Pending Review</p>
                </div>
            </div>
        </div>
        <div class="card p-4">
            <div class="${
                'flex items-center gap-3'
            }">
                <div class="p-2 rounded-lg"
                    style="${
                        'background:hsl('
                        + 'var(--success-soft))'
                    }">${
                    iconCheckCircle2(
                        20, 'text-success',
                    )
                }</div>
                <div>
                    <p class="${
                        'text-2xl font-bold'
                    }">${
                        stats.ready}</p>
                    <p class="${
                        'text-sm text-muted'
                    }">Ready to Decide</p>
                </div>
            </div>
        </div>
        <div class="card p-4">
            <div class="${
                'flex items-center gap-3'
            }">
                <div class="p-2 rounded-lg"
                    style="${
                        'background:hsl('
                        + 'var(--warning-soft))'
                    }">${
                    iconTrendingUp(
                        20, 'text-warning',
                    )
                }</div>
                <div>
                    <p class="${
                        'text-2xl font-bold'
                    }">${
                        stats.avgWait}d</p>
                    <p class="${
                        'text-sm text-muted'
                    }">Avg. Wait Time</p>
                </div>
            </div>
        </div>
    </div>

    <div class="flex gap-4 mb-6">
        <div class="search-wrapper"
            style="flex:1">
            <span class="search-icon">${
                iconSearch(16, '')
            }</span>
            <input class="input search-input"
                placeholder="${
                    'Search ideas or'
                    + ' submitters...'
                }"
                id="review-queue-search"
                aria-label="${
                    'Search ideas or'
                    + ' submitters'
                }"
            />
        </div>
        <select class="input"
            style="width:10rem"
            id="${
                'review-queue-'
                + 'readiness-filter'
            }"
            aria-label="${
                'Filter by readiness'
            }">
            <option value="all">${
                'All Status'
            }</option>
            <option value="ready">${
                'Ready'
            }</option>
            <option value="needs-info">${
                'Needs Info'
            }</option>
            <option value="incomplete">${
                'Incomplete'
            }</option>
        </select>
    </div>

    <div id="review-queue-list"
        style="${
            'display:flex;'
            + 'flex-direction:column;'
            + 'gap:0.75rem'
        }">
    </div>
    <div id="review-queue-empty"
        class="text-center"
        style="${
            'display:none;padding:3rem 0'
        }">
        ${iconClock(48, 'text-muted')}
        <h3 class="${
            'text-lg font-semibold'
            + ' mt-4 mb-2'
        }">${'No ideas match your'
            + ' filters'}</h3>
        <p class="text-muted">${
            'Try adjusting your search'
            + ' or filter criteria'
        }</p>
    </div>`);

    function renderList(): void {
        const list = $(
            '#review-queue-list', document,
        );
        const empty = $(
            '#review-queue-empty', document,
        );
        const hasResults =
            presenter.hasFilteredResults();
        if (list)
            setHtml(
                list,
                presenter.renderList(),
            );
        if (list)
            list.style.display =
                hasResults ? '' : 'none';
        if (empty)
            empty.style.display =
                hasResults
                    ? 'none' : '';
    }

    $('#review-queue-list', document)
        ?.addEventListener(
            'click',
            (e) => {
                if (
                    !(e.target
                        instanceof Element)
                ) return;
                const card =
                    e.target
                        .closest<HTMLElement>(
                            '[data-review-card]',
                        );
                if (card)
                    navigateTo(
                        'approval-detail',
                        {
                            id: attr(
                                card,
                                'data-review'
                                + '-card',
                            ),
                        },
                    );
            },
        );

    $('#review-queue-search', document)
        ?.addEventListener(
            'input',
            () => {
                presenter.setSearch(
                    $input(
                        '#review-queue'
                        + '-search',
                        document,
                    )!.value,
                );
                renderList();
            },
        );
    $(
        '#review-queue-readiness-filter',
        document,
    )?.addEventListener(
        'change',
        () => {
            presenter.setReadinessFilter(
                $select(
                    '#review-queue'
                    + '-readiness-filter',
                    document,
                )!.value,
            );
            renderList();
        },
    );
    renderList();
}
