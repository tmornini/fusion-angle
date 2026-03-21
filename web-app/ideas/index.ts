import {
    $,
    attr,
    populateIcons,
    initToggleGroup,
} from '../app/dom';
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
    iconPlus,
    iconWand,
    iconGripVertical,
    iconTrendingUp,
    iconClock,
    iconDollarSign,
    iconStar,
    iconLayoutGrid,
    iconBarChart,
    iconEye,
    iconClipboardCheck,
    iconChevronRight,
    iconArrowRight,
    iconLightbulb,
    iconTarget,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getIdeas,
    type Idea,
} from '../app/adapters';

function buildIdeaCard(
    idea: Idea,
    view: string,
): SafeHtml {
    return html`
    <div class="card card-hover p-5"
        style="cursor:pointer"
        data-idea-card="${idea.id}">
        <div class="flex items-start gap-4">
            <div class="hidden-mobile"
                style="color:hsl(
                    var(--muted-foreground)
                    /0.5);
                    margin-top:0.25rem;
                    cursor:grab">
                ${iconGripVertical(20)}
            </div>
            <div style="flex:1;min-width:0">
                <div class="flex items-start
                    justify-between gap-4 mb-3">
                    <div style="${
                        'flex:1;min-width:0'
                    }">
                        <div class="${
                            'flex flex-wrap'
                            + ' items-center'
                            + ' gap-2 mb-1'
                        }">
                            <h3 class="${
                                'font-display'
                                + ' font-semibold'
                                + ' truncate'
                            }">
                                ${idea.title}
                            </h3>
                            <span class="${
                                'badge '
                                + idea
                                    .statusClassName()
                                + ' text-xs'
                            }">
                                ${idea
                                    .statusLabel()}
                            </span>
                            <span class="${
                                'badge '
                                + idea
                                    .edgeStatusClassName()
                                + ' text-xs'
                            }">
                                ${iconTarget(12)}
                                ${idea
                                    .edgeStatusLabel()}
                            </span>
                        </div>
                        <div class="${
                            'flex items-center'
                            + ' gap-2 text-xs'
                            + ' text-muted'
                        }">
                            ${view === 'priority'
                                ? html`<span>${
                                    'Priority'
                                    }
                                    #${
                                    idea.priority
                                    }
                                </span><span>${
                                    '&bull;'
                                }</span>`
                                : html``}
                            <span>
                                by ${
                                    idea.submittedBy
                                }
                            </span>
                        </div>
                    </div>
                    <div style="${
                        'padding:0.25rem'
                        + ' 0.75rem;'
                        + 'border-radius:var('
                        + '--radius-lg);'
                        + 'font-weight:600;'
                        + 'font-size:0.875rem;'
                    }${idea.scoreStyle()}">
                        ${iconStar(14)
                        } ${idea.score}
                    </div>
                </div>

                <div style="display:grid;
                    grid-template-columns:
                        3fr 2fr;
                    gap:1rem;align-items:end">
                    <div style="display:grid;
                        grid-template-columns:
                            repeat(3,1fr);
                        gap:1rem">
                        <div
                            class="${
                                'flex'
                                + ' items-center'
                                + ' gap-2'
                            }">
                            <div style="${
                                'width:2rem;'
                                + 'height:2rem;'
                                + 'border-radius'
                                + ':var('
                                + '--radius-lg);'
                                + 'background:'
                                + 'hsl('
                                + 'var(--primary)'
                                + '/0.1);'
                                + 'display:flex;'
                                + 'align-items:'
                                + 'center;'
                                + 'justify-'
                                + 'content:'
                                + 'center'
                            }">
                                ${iconClock(
                                    16,
                                    'text-primary',
                                )}
                            </div>
                            <div>
                                <p
                                    class="${
                                        'text-xs'
                                        + ' text-'
                                        + 'muted'
                                    }">
                                    Time
                                </p>
                                <p
                                    class="${
                                        'text-sm'
                                        + ' font-'
                                        + 'medium'
                                    }">
                                    ${idea.durationInDays()
                                        ? `${idea.durationInDays()}d`
                                        : '\u2014'}
                                </p>
                            </div>
                        </div>
                        <div
                            class="${
                                'flex'
                                + ' items-center'
                                + ' gap-2'
                            }">
                            <div style="${
                                'width:2rem;'
                                + 'height:2rem;'
                                + 'border-radius'
                                + ':var('
                                + '--radius-lg);'
                                + 'background:'
                                + 'hsl('
                                + 'var(--primary)'
                                + '/0.1);'
                                + 'display:flex;'
                                + 'align-items:'
                                + 'center;'
                                + 'justify-'
                                + 'content:'
                                + 'center'
                            }">
                                ${iconDollarSign(
                                    16,
                                    'text-primary',
                                )}
                            </div>
                            <div>
                                <p
                                    class="${
                                        'text-xs'
                                        + ' text-'
                                        + 'muted'
                                    }">
                                    Cost
                                </p>
                                <p
                                    class="${
                                        'text-sm'
                                        + ' font-'
                                        + 'medium'
                                    }">
                                    ${idea.estimatedCost
                                        ? '$'
                                            + (
                                                idea.estimatedCost
                                                / 1000
                                            ).toFixed(0)
                                            + 'k'
                                        : '\u2014'}
                                </p>
                            </div>
                        </div>
                        <div
                            class="${
                                'flex'
                                + ' items-center'
                                + ' gap-2'
                            }">
                            <div style="${
                                'width:2rem;'
                                + 'height:2rem;'
                                + 'border-radius'
                                + ':var('
                                + '--radius-lg);'
                                + 'background:'
                                + 'hsl('
                                + 'var(--primary)'
                                + '/0.1);'
                                + 'display:flex;'
                                + 'align-items:'
                                + 'center;'
                                + 'justify-'
                                + 'content:'
                                + 'center'
                            }">
                                ${iconTrendingUp(
                                    16,
                                    'text-primary',
                                )}
                            </div>
                            <div>
                                <p
                                    class="${
                                        'text-xs'
                                        + ' text-'
                                        + 'muted'
                                    }">
                                    Impact
                                </p>
                                <p
                                    class="${
                                        'text-sm'
                                        + ' font-'
                                        + 'medium'
                                    }">
                                    ${idea
                                        .estimatedImpact
                                        || '\u2014'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        class="${
                            'flex items-center'
                            + ' gap-2'
                            + ' idea-actions'
                        }"
                        style="justify-content:
                            flex-end">
                        <button
                            class="${
                                'btn btn-outline'
                                + ' btn-sm gap-2'
                            }"
                            data-idea-view="${
                                idea.id}">
                            ${iconEye(16)}
                            <span class="${
                                'hidden-mobile'
                            }">
                                View
                            </span>
                        </button>
                        ${idea
                            .needsEdgeDefinition()
                            ? html`
                        <button
                            class="${
                                'btn btn-outline'
                                + ' btn-sm gap-2'
                            }"
                            style="${
                                'border-color:'
                                + 'hsl('
                                + 'var(--primary)'
                                + '/0.3);'
                                + 'color:hsl('
                                + 'var(--primary))'
                            }"
                            data-idea-edge="${
                                idea.id}">
                            ${iconTarget(16)}
                            <span
                                class="${
                                    'hidden-'
                                    + 'mobile'
                                }">
                                Define Edge
                            </span>
                        </button>` : html``}
                        ${idea.isReviewable()
                            ? html`
                        <button
                            class="${
                                'btn btn-outline'
                                + ' btn-sm gap-2'
                            }"
                            style="${
                                'border-color:'
                                + 'hsl('
                                + 'var(--warning)'
                                + '/0.3);'
                                + 'color:hsl('
                                + 'var(--warning))'
                            }"
                            data-idea-review="${
                                idea.id}">
                            ${iconClipboardCheck(
                                16,
                            )}
                            <span
                                class="${
                                    'hidden-'
                                    + 'mobile'
                                }">
                                Review
                            </span>
                        </button>` : html``}
                        ${idea.isConvertible()
                            ? html`
                        <button
                            class="${
                                'btn btn-primary'
                                + ' btn-sm gap-2'
                            }"
                            data-idea-convert="${
                                idea.id}">
                            ${iconArrowRight(16)}
                            <span
                                class="${
                                    'hidden-'
                                    + 'mobile'
                                }">
                                Convert
                            </span>
                        </button>` : html``}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

export async function init(): Promise<void> {
    const listContainer = $('#ideas-list');
    if (!listContainer) return;

    const result = await withLoadingState(
        listContainer,
        buildSkeleton(
            'card-list', { count: 4 },
        ),
        getIdeas,
        init,
        {
            icon: iconLightbulb(24),
            title: 'No Ideas Yet',
            description:
                'Start innovating by'
                + ' creating'
                + ' your first idea.',
            action: {
                label: html`${iconPlus(16)}
                    Create Your First Idea
                    ${iconWand(16)}`,
                href:
                    '../idea-create'
                    + '/index.html',
            },
            onEmpty: () => {
                $(
                    '#create-idea-btn',
                )?.remove();
            },
        },
    );
    if (!result) return;
    const ideas = result;

    let currentView = 'priority';

    populateIcons([
        ['#create-btn-icon', iconPlus(16)],
        [
            '#create-btn-accent',
            iconWand(16),
        ],
        [
            '#priority-view-icon',
            iconLayoutGrid(16),
        ],
        [
            '#performance-view-icon',
            iconBarChart(16),
        ],
    ]);

    const flowEl = $('#flow-indicator');
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
            <span
                class="${
                    'text-primary font-medium'
                }">
                Edge
            </span>
            &rarr; Review &rarr; Convert
        </span>
        ${iconChevronRight(
            16, 'text-muted',
        )}`);
    }

    const pendingReviewCount = ideas
        .filter(idea => idea.isInReview())
        .length;
    const reviewBtnEl = $(
        '#review-queue-btn',
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
            ${iconClipboardCheck(16)}
            <span class="hidden-mobile">
                Review Queue
            </span> (${pendingReviewCount})
        </button>`);
        $('#review-queue-nav')
            ?.addEventListener(
                'click',
                () => navigateTo(
                    'idea-review-queue',
                ),
            );
    }

    $('#create-idea-btn')
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-create',
            ),
        );

    function mutateList() {
        const sorted =
            currentView === 'priority'
                ? [...ideas].sort(
                    (a, b) =>
                        a.priority
                        - b.priority,
                )
                : [...ideas].sort(
                    (a, b) =>
                        b.score - a.score,
                );

        const list = $('#ideas-list');
        if (list)
            setHtml(list, html`${sorted.map(
                idea => buildIdeaCard(
                    idea,
                    currentView,
                ),
            )}`);

        const count = $('#ideas-count');
        if (count)
            count.textContent =
                `${sorted.length} `
                + `${sorted.length === 1
                    ? 'idea' : 'ideas'}`
                + ` \u2022 ${currentView
                    === 'priority'
                    ? 'by priority'
                    : 'by score'}`;
    }

    initToggleGroup(
        '.view-toggle-btn',
        'data-view',
        (view) => {
            currentView = view;
            mutateList();
        },
    );

    $('#ideas-list')?.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            const actionButton =
                e.target
                    .closest<HTMLElement>(
                    '[data-idea-view],'
                    + ' [data-idea-edge],'
                    + ' [data-idea-review],'
                    + ' [data-idea-convert]',
                );
            if (actionButton) {
                if (
                    actionButton
                        .hasAttribute(
                        'data-idea-view',
                    )
                )
                    navigateTo(
                        'idea-detail',
                        {
                            ideaId: attr(
                                actionButton,
                                'data-idea-view',
                            ),
                        },
                    );
                else if (
                    actionButton
                        .hasAttribute(
                        'data-idea-edge',
                    )
                )
                    navigateTo('edge-detail', {
                        ideaId: attr(
                            actionButton,
                            'data-idea-edge',
                        ),
                    });
                else if (
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
                                'data-idea-review',
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
                                'data-idea-convert',
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
                            'data-idea-card',
                        ),
                    },
                );
        },
    );

    mutateList();
}
