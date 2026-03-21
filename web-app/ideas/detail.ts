import {
    $, $input, $textarea,
} from '../app/dom';
import {
    html,
    setHtml,
    SafeHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconClock,
    iconDollarSign,
    iconTrendingUp,
    iconStar,
    iconTarget,
    iconArrowRight,
    iconClipboardCheck,
} from '../app/icons';
import {
    navigateTo,
    SECONDS_PER_DAY,
} from '../app/core';
import {
    getIdeaDetail,
    putIdea,
    type Idea,
} from '../app/adapters';

const state = {
    isEditing: false,
};

function buildProblemSolutionCard(
    idea: Idea,
): SafeHtml {
    return html`
    <div class="card p-6">
        <h2 class="text-lg font-display
            font-semibold mb-4">
            Problem &amp; Solution
        </h2>
        <div style="display:flex;
            flex-direction:column;
            gap:1.25rem">
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Problem Statement
                </p>
                ${state.isEditing
                    ? html`<textarea
                        class="textarea"
                        id="idea-edit-problem"
                        rows="3"
                        style="resize:none"
                        >${idea
                            .problemStatement
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${idea
                            .problemStatement
                            || '\u2014'}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Target Users
                </p>
                ${state.isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'target-users'
                        }"
                        rows="2"
                        style="resize:none"
                        >${idea
                            .description
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${idea.description
                            || '\u2014'}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Proposed Solution
                </p>
                ${state.isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'solution'
                        }"
                        rows="3"
                        style="resize:none"
                        >${idea
                            .proposedSolution
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${idea
                            .proposedSolution
                            || '\u2014'}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Expected Outcome
                </p>
                ${state.isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'outcome'
                        }"
                        rows="3"
                        style="resize:none"
                        >${idea
                            .expectedOutcome
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${idea
                            .expectedOutcome
                            || '\u2014'}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Success Metrics
                </p>
                ${state.isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'metrics'
                        }"
                        rows="3"
                        style="resize:none"
                        >${idea
                            .successMetrics
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${idea
                            .successMetrics
                            || '\u2014'}
                        </p>`}
            </div>
        </div>
    </div>`;
}

function buildDetailsCard(
    idea: Idea,
): SafeHtml {
    return html`
    <div class="card p-6">
        <h2 class="text-lg font-display
            font-semibold mb-4">
            Details
        </h2>
        <div style="display:flex;
            flex-direction:column;
            gap:1rem">
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Category
                </p>
                ${state.isEditing
                    ? html`<input class="input"
                        id="${
                            'idea-edit-category'
                        }"
                        value="${
                            idea.category
                        }" />`
                    : html`<p
                        class="${
                            'text-sm font-medium'
                        }">
                        ${idea.category
                            || '\u2014'}
                    </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Submitted by
                </p>
                <p class="${
                    'text-sm font-medium'
                }">
                    ${idea.submittedBy}
                </p>
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Submitted at
                </p>
                <p class="${
                    'text-sm font-medium'
                }">
                    ${idea.submittedAt
                        || '\u2014'}
                </p>
            </div>
        </div>
    </div>`;
}

function buildEstimatesCard(
    idea: Idea,
): SafeHtml {
    return html`
    <div class="card p-6">
        <h2 class="text-lg font-display
            font-semibold mb-4">
            Estimates
        </h2>
        <div class="score-grid">
            ${[
              {
                  label: 'Impact',
                  inputId: 'impact',
                  icon: iconTrendingUp,
                  value: idea.estimatedImpact,
                  unit: ' pts',
                  prefix: '',
              },
              {
                  label: 'Duration',
                  inputId: 'duration',
                  icon: iconClock,
                  value: idea.durationInDays(),
                  unit: 'd',
                  prefix: '',
              },
              {
                  label: 'Cost',
                  inputId: 'cost',
                  icon: iconDollarSign,
                  value: idea.estimatedCost,
                  unit: '',
                  prefix: '$',
              },
            ].map(metric => html`
            <div style="padding:1rem;
                border-radius:0.75rem;
                background:hsl(
                    var(--muted)/0.3);
                border:1px solid
                    hsl(var(--border))">
                <div
                    class="${
                        'flex items-center'
                        + ' gap-2 mb-3'
                    }">
                    ${metric.icon(
                        20, 'text-primary',
                    )}
                    <span class="font-medium">
                        ${metric.label}
                    </span>
                </div>
                ${state.isEditing
                    ? html`<input
                        type="number"
                        id="${
                            'idea-edit-'
                            + metric.inputId
                        }"
                        value="${String(
                            metric.value,
                        )}"
                        class="input"
                        style="width:100%"
                        min="0"
                        step="any" />`
                    : html`<p
                        class="${
                            'text-lg font-bold'
                        }">
                        ${metric.value
                            ? `${metric.prefix}${metric.value}${metric.unit}`
                            : '\u2014'}
                    </p>`}
            </div>
            `)}
        </div>
    </div>`;
}

function buildIdeaDetail(
    idea: Idea,
    ideaId: string,
): SafeHtml {
    return html`
    <div
        style="max-width:48rem;
            margin:0 auto">
        <div class="flex items-center gap-2
            text-sm text-muted mb-4">
            <a href="../ideas/index.html"
                class="hover-link">
                Ideas
            </a>
            <span>/</span>
            <span>${idea.title}</span>
        </div>

        <div class="flex items-start
            justify-between gap-4 mb-6">
            <div
                class="${
                    'flex items-center gap-4'
                }">
                <button
                    class="${
                        'btn btn-ghost btn-icon'
                    }"
                    id="idea-back-btn">
                    ${iconArrowLeft(20)}
                </button>
                <div>
                    <div class="flex flex-wrap
                        items-center gap-3 mb-2">
                        ${state.isEditing
                            ? html`<input
                                class="input"
                                id="${
                                    'idea-edit'
                                    + '-title'
                                }"
                                value="${
                                    idea.title
                                }"
                                style="${
                                    'font-size:'
                                    + '1.125rem;'
                                    + 'font-weight'
                                    + ':700'
                                }" />`
                            : html`<h1
                                class="${
                                    'text-xl'
                                    + ' font-display'
                                    + ' font-bold'
                                }">
                                ${idea.title}
                            </h1>`}
                        <span class="badge
                            ${idea
                                .statusClassName()}
                            text-xs">
                            ${idea.statusLabel()}
                        </span>
                        <span class="badge
                            ${idea
                                .edgeStatusClassName()}
                            text-xs">
                            ${iconTarget(12)}
                            ${idea
                                .edgeStatusLabel()}
                        </span>
                        <div style="${
                            'padding:0.25rem'
                            + ' 0.75rem;'
                            + 'border-radius:'
                            + 'var('
                            + '--radius-lg);'
                            + 'font-weight:600;'
                            + 'font-size:'
                            + '0.875rem;'
                        }${idea.scoreStyle()}">
                            ${iconStar(14)}
                            ${idea.score}
                        </div>
                    </div>
                    <p class="${
                        'text-sm text-muted'
                    }">
                        Submitted by
                        ${idea.submittedBy}
                    </p>
                </div>
            </div>
            <div
                class="${
                    'flex items-center gap-2'
                }">
                ${idea.needsEdgeDefinition()
                    ? html`
                <button
                    class="${
                        'btn btn-outline'
                        + ' btn-sm gap-2'
                    }"
                    style="${
                        'border-color:hsl('
                        + 'var(--primary)/0.3);'
                        + 'color:hsl('
                        + 'var(--primary))'
                    }"
                    id="idea-edge-btn">
                    ${iconTarget(16)}
                    Define Edge
                </button>` : html``}
                ${idea.isReviewable()
                    ? html`
                <button
                    class="${
                        'btn btn-outline'
                        + ' btn-sm gap-2'
                    }"
                    style="${
                        'border-color:hsl('
                        + 'var(--warning)/0.3);'
                        + 'color:hsl('
                        + 'var(--warning))'
                    }"
                    id="idea-review-btn">
                    ${iconClipboardCheck(16)}
                    Review
                </button>` : html``}
                ${idea.isConvertible()
                    ? html`
                <button
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }"
                    id="idea-convert-btn">
                    ${iconArrowRight(16)}
                    Convert
                </button>` : html``}
                ${state.isEditing
                    ? html`<div
                        class="flex gap-2">
                        <button
                            class="${
                                'btn btn-outline'
                                + ' gap-2'
                            }"
                            id="${
                                'idea-cancel-btn'
                            }">
                            ${iconX(16)} Cancel
                        </button>
                        <button
                            class="${
                                'btn btn-primary'
                                + ' gap-2'
                            }"
                            id="${
                                'idea-save-btn'
                            }">
                            ${iconSave(16)} Save
                        </button>
                    </div>`
                    : html`<button
                        class="${
                            'btn btn-outline'
                            + ' gap-2'
                        }"
                        id="idea-edit-btn">
                        ${iconEdit(16)} Edit
                    </button>`}
            </div>
        </div>

        <div style="display:flex;
            flex-direction:column;
            gap:1.5rem">
            ${buildProblemSolutionCard(idea)}
            ${buildDetailsCard(idea)}
            ${buildEstimatesCard(idea)}
        </div>
    </div>`;
}

function bindIdeaEvents(
    idea: Idea,
    ideaId: string,
): void {
    $('#idea-back-btn')
        ?.addEventListener(
            'click',
            () => navigateTo('ideas'),
        );

    $('#idea-edit-btn')
        ?.addEventListener(
            'click',
            () => {
                state.isEditing = true;
                mutateIdeaPage(
                    idea, ideaId,
                );
            },
        );

    $('#idea-cancel-btn')
        ?.addEventListener(
            'click',
            () => {
                state.isEditing = false;
                mutateIdeaPage(
                    idea, ideaId,
                );
            },
        );

    $('#idea-save-btn')
        ?.addEventListener(
            'click',
            async () => {
                const title =
                    $input(
                        '#idea-edit-title',
                    )?.value
                    ?? idea.title;
                const description =
                    $textarea(
                        '#idea-edit-target-users',
                    )?.value
                    ?? idea.description;
                const category =
                    $input(
                        '#idea-edit-category',
                    )?.value
                    ?? idea.category;
                const problemStatement =
                    $textarea(
                        '#idea-edit-problem',
                    )?.value
                    ?? idea.problemStatement;
                const proposedSolution =
                    $textarea(
                        '#idea-edit-solution',
                    )?.value
                    ?? idea.proposedSolution;
                const expectedOutcome =
                    $textarea(
                        '#idea-edit-outcome',
                    )?.value
                    ?? idea.expectedOutcome;
                const successMetrics =
                    $textarea(
                        '#idea-edit-metrics',
                    )?.value
                    ?? idea.successMetrics;
                const impact = Number(
                    $input(
                        '#idea-edit-impact',
                    )?.value
                    ?? idea.estimatedImpact,
                );
                const duration = Number(
                    $input(
                        '#idea-edit-duration',
                    )?.value
                    ?? idea.durationInDays(),
                );
                const cost = Number(
                    $input(
                        '#idea-edit-cost',
                    )?.value
                    ?? idea.estimatedCost,
                );

                try {
                    await putIdea(ideaId, {
                        title,
                        description,
                        category,
                        problem_statement:
                            problemStatement,
                        proposed_solution:
                            proposedSolution,
                        expected_outcome:
                            expectedOutcome,
                        success_metrics:
                            successMetrics,
                        estimated_impact:
                            impact,
                        estimated_duration:
                            duration
                            * SECONDS_PER_DAY,
                        estimated_cost:
                            cost,
                    });
                    showToast(
                        'Idea saved',
                        'success',
                    );
                    const updated =
                        await getIdeaDetail(
                            ideaId,
                        );
                    state.isEditing = false;
                    mutateIdeaPage(
                        updated,
                        ideaId,
                    );
                } catch {
                    showToast(
                        'Failed to save'
                        + ' idea',
                        'error',
                    );
                }
            },
        );

    $('#idea-edge-btn')
        ?.addEventListener(
            'click',
            () => navigateTo(
                'edge',
                { ideaId },
            ),
        );
    $('#idea-review-btn')
        ?.addEventListener(
            'click',
            () => navigateTo(
                'approval-detail',
                { id: ideaId },
            ),
        );
    $('#idea-convert-btn')
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-convert',
                { ideaId },
            ),
        );
}

function mutateIdeaPage(
    idea: Idea,
    ideaId: string,
): void {
    const container = $(
        '#idea-detail-content',
    );
    if (!container) return;
    setHtml(
        container,
        buildIdeaDetail(idea, ideaId),
    );
    bindIdeaEvents(idea, ideaId);
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const ideaId = params?.ideaId;
    if (!ideaId) { navigateTo('ideas'); return; }
    state.isEditing = false;

    const container = $(
        '#idea-detail-content',
    );
    if (!container) return;

    const idea = await withLoadingState(
        container,
        buildSkeleton('detail'),
        () => getIdeaDetail(ideaId),
        () => init(params),
    );
    if (!idea) return;

    mutateIdeaPage(idea, ideaId);
}
