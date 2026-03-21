import { $, $input, $select, attr } from '../app/dom';
import {
    html,
    setHtml,
    SafeHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconArrowLeft,
    iconClock,
    iconTrendingUp,
    iconAlertCircle,
    iconCheckCircle2,
    iconMessageSquare,
    iconSearch,
    iconChevronRight,
    iconTarget,
    iconShield,
    iconClipboardCheck,
} from '../app/icons';
import {
    navigateTo,
    styleForScore,
    displayText,
} from '../app/core';
import {
    getReviewQueue,
    type Idea,
} from '../app/adapters';

const priorityConfig: Record<
    string,
    { label: string; className: string }
> = {
    high: {
        label: 'High Priority',
        className: 'badge-error',
    },
    medium: {
        label: 'Medium',
        className: 'badge-warning',
    },
    low: {
        label: 'Low',
        className: 'badge-default',
    },
};

const readinessIcon: Record<
    string,
    (size: number, cssClass: string) => SafeHtml
> = {
    ready: iconCheckCircle2,
    'needs-info': iconMessageSquare,
    incomplete: iconAlertCircle,
};

function buildReviewCard(
    idea: Idea,
): SafeHtml {
    const rIcon = (
        readinessIcon[idea.readiness]
        ?? iconAlertCircle
    );
    const priorityDisplay =
        priorityConfig[
            idea.priorityLevel()
        ]!;
    return html`
    <div class="card card-hover p-4"
        style="cursor:pointer"
        data-review-card="${idea.id}">
        <div class="flex items-start
            justify-between gap-4">
            <div style="flex:1;min-width:0">
                <div class="flex flex-wrap
                    items-center gap-2 mb-2">
                    <span class="badge
                        ${priorityDisplay
                            .className}
                        text-xs">${
                        priorityDisplay.label
                    }</span>
                    <span class="${
                        'flex items-center'
                        + ' gap-1 text-sm '
                        + idea
                            .readinessClassName()
                    }">${rIcon(16, '')
                    } ${idea
                        .readinessLabel()
                    }</span>
                    <span class="badge
                        ${idea
                            .edgeStatusClassName()}
                        text-xs">${
                        iconTarget(12, '')
                    } ${idea
                        .edgeStatusLabel()
                    }</span>
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${idea.title}</h3>
                <div class="${
                    'flex items-center'
                    + ' gap-4 text-sm'
                    + ' text-muted'
                }">
                    <span>by ${
                        displayText(
                            idea.submittedBy,
                        )
                    }</span>
                    <span>${
                        '\u2022'
                    }</span>
                    <span>${
                        idea.category
                    }</span>
                    <span>${
                        '\u2022'
                    }</span>
                    <span style="${
                        'color:hsl('
                        + 'var(--warning))'
                    }">${
                        idea.waitingDays
                    } days waiting</span>
                </div>
            </div>
            <div class="${
                'flex items-center gap-6'
            }">
                <div class="${
                    'text-right hidden-mobile'
                }">
                    <div class="${
                        'flex items-center'
                        + ' gap-4 text-sm'
                    }">
                        <div>
                            <p class="${
                                'text-muted'
                            }">Score</p>
                            <p class="${
                                'font-semibold'
                            }"
                                style="${
                                    idea
                                    .scoreColor()
                                }">${
                                idea.score
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-muted'
                            }">Impact</p>
                            <p class="${
                                'font-medium'
                            }">${
                                idea.impactLabel
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-muted'
                            }">Effort</p>
                            <p class="${
                                'font-medium'
                            }">${
                                idea.effortLabel
                            }</p>
                        </div>
                    </div>
                </div>
                ${iconChevronRight(
                    20, 'text-muted',
                )}
            </div>
        </div>
    </div>`;
}

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
    const allIdeas = result;

    const stats = {
        total: allIdeas.length,
        ready: allIdeas.filter(
            idea => idea.isReady(),
        ).length,
        highPriority: allIdeas.filter(
            idea =>
                idea.priorityLevel()
                    === 'high',
        ).length,
        avgWait: Math.round(
            allIdeas.reduce(
                (sum, idea) =>
                    sum + idea.waitingDays,
                0,
            ) / allIdeas.length,
        ),
    };

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
                        + 'var(--error-soft))'
                    }">${
                    iconAlertCircle(
                        20, 'text-error',
                    )
                }</div>
                <div>
                    <p class="${
                        'text-2xl font-bold'
                    }">${
                        stats.highPriority
                    }</p>
                    <p class="${
                        'text-sm text-muted'
                    }">High Priority</p>
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
                + 'priority-filter'
            }"
            aria-label="${
                'Filter by priority'
            }">
            <option value="all">${
                'All Priority'
            }</option>
            <option value="high">${
                'High'
            }</option>
            <option value="medium">${
                'Medium'
            }</option>
            <option value="low">${
                'Low'
            }</option>
        </select>
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
        ${allIdeas.map(buildReviewCard)}
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

    function mutateFilteredList() {
        const search = (
            $input(
                '#review-queue-search', document,
            )?.value ?? ''
        ).toLowerCase();
        const priority =
            $select(
                '#review-queue-priority-filter', document,
            )?.value ?? 'all';
        const readiness =
            $select(
                '#review-queue-readiness-filter', document,
            )?.value ?? 'all';

        const filtered = allIdeas.filter(
            idea => {
                const matchesSearch =
                    idea.title
                        .toLowerCase()
                        .includes(search)
                    || idea.submittedBy
                        .toLowerCase()
                        .includes(search);
                const matchesPriority =
                    priority === 'all'
                    || idea.priorityLevel()
                        === priority;
                const matchesReadiness =
                    readiness === 'all'
                    || idea.readiness
                        === readiness;
                return matchesSearch
                    && matchesPriority
                    && matchesReadiness;
            },
        );

        const list = $(
            '#review-queue-list', document,
        );
        const empty = $(
            '#review-queue-empty', document,
        );
        if (list)
            setHtml(
                list,
                html`${filtered.map(
                    buildReviewCard,
                )}`,
            );
        if (list)
            list.style.display =
                filtered.length ? '' : 'none';
        if (empty)
            empty.style.display =
                filtered.length
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
                                'data-review-card',
                            ),
                        },
                    );
            },
        );

    $('#review-queue-search', document)
        ?.addEventListener(
            'input',
            mutateFilteredList,
        );
    $(
        '#review-queue-priority-filter', document,
    )?.addEventListener(
        'change',
        mutateFilteredList,
    );
    $(
        '#review-queue-readiness-filter', document,
    )?.addEventListener(
        'change',
        mutateFilteredList,
    );
    mutateFilteredList();
}
