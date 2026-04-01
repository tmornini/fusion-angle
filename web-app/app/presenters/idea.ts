import { html, SafeHtml } from '../safe-html';
import {
    displayText, formatDate,
} from '../core';
import {
    iconGripVertical,
    iconClock,
    iconDollarSign,
    iconTrendingUp,

    iconClipboardCheck,
    iconArrowRight,
    iconArrowLeft,
    iconTarget,
    iconCheckCircle2,
    iconMessageSquare,
    iconAlertCircle,
    iconChevronRight,
    iconEdit,
    iconSave,
    iconX,
} from '../icons';
import type {
    Idea,
    ReadinessLevel,
    IdeaStatus,
} from '../../../api/types';
import {
    COST_DIVISOR,
} from '../../../api/types';

const READINESS_ICONS: Record<
    ReadinessLevel,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    ready: iconCheckCircle2,
    'needs-info': iconMessageSquare,
    incomplete: iconAlertCircle,
};

export class IdeaPresenter {
    readonly #id: string;
    readonly #title: string;
    readonly #priority: number;
    readonly #status: IdeaStatus;
    readonly #statusClassName: string;
    readonly #statusLabel: string;
    readonly #edgeStatusClassName: string;
    readonly #edgeStatusLabel: string;
    readonly #submittedBy: string;
    readonly #submittedAt: string;
    readonly #category: string;
    readonly #problemStatement: string;
    readonly #description: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #durationInDays: number;
    readonly #estimatedCost: number;
    readonly #estimatedImpact: number;
    readonly #needsEdgeDefinition: boolean;
    readonly #isReviewable: boolean;
    readonly #isConvertible: boolean;
    readonly #isInReview: boolean;
    readonly #isReady: boolean;
    readonly #readiness: ReadinessLevel;
    readonly #readinessClassName: string;
    readonly #readinessLabel: string;
    readonly #waitingDays: number;
    readonly #impactLabel: string;
    readonly #effortLabel: string;
    readonly #searchTitle: string;
    readonly #searchSubmittedBy: string;

    constructor(idea: Idea) {
        this.#id = idea.id;
        this.#title = idea.title;
        this.#priority = idea.priority;
        this.#status = idea.status;
        this.#statusClassName =
            idea.statusClassName();
        this.#statusLabel =
            idea.statusLabel();
        this.#edgeStatusClassName =
            idea.edgeStatusClassName();
        this.#edgeStatusLabel =
            idea.edgeStatusLabel();
        this.#submittedBy = idea.submittedBy;
        this.#submittedAt = idea.submittedAt;
        this.#category = idea.category;
        this.#problemStatement =
            idea.problemStatement;
        this.#description = idea.description;
        this.#proposedSolution =
            idea.proposedSolution;
        this.#expectedOutcome =
            idea.expectedOutcome;
        this.#successMetrics =
            idea.successMetrics;
        this.#durationInDays =
            idea.durationInDays();
        this.#estimatedCost =
            idea.estimatedCost;
        this.#estimatedImpact =
            idea.estimatedImpact;
        this.#needsEdgeDefinition =
            idea.needsEdgeDefinition();
        this.#isReviewable =
            idea.isReviewable();
        this.#isConvertible =
            idea.isConvertible();
        this.#isInReview = idea.isInReview();
        this.#isReady = idea.isReady();
        this.#readiness = idea.readiness;
        this.#readinessClassName =
            idea.readinessClassName();
        this.#readinessLabel =
            idea.readinessLabel();
        this.#waitingDays = idea.waitingDays;
        this.#impactLabel = idea.impactLabel;
        this.#effortLabel = idea.effortLabel;
        this.#searchTitle =
            idea.title.toLowerCase();
        this.#searchSubmittedBy =
            idea.submittedBy.toLowerCase();
    }

    idForLink(): string {
        return this.#id;
    }

    prioritySortKey(): number {
        return this.#priority;
    }

    isInReview(): boolean {
        return this.#isInReview;
    }

    matchesSearch(
        term: string,
    ): boolean {
        const t = term.toLowerCase();
        return (
            this.#searchTitle.includes(t)
            || this.#searchSubmittedBy
                .includes(t)
        );
    }

    isReady(): boolean {
        return this.#isReady;
    }

    matchesReadinessFilter(
        readiness: string,
    ): boolean {
        return readiness === 'all'
            || this.#readiness
                === readiness;
    }

    waitingDays(): number {
        return this.#waitingDays;
    }

    buildCard(view: string): SafeHtml {
        return html`
    <div class="card card-hover p-5"
        style="cursor:pointer"
        data-idea-card="${this.#id}">
        <div class="flex items-start gap-4">
            <div class="hidden-mobile"
                style="color:hsl(
                    var(--muted-foreground)
                    /0.5);
                    margin-top:0.25rem;
                    cursor:grab">
                ${iconGripVertical(20, '')}
            </div>
            <div style="flex:1;min-width:0">
                <div class="flex items-start
                    justify-between gap-4 mb-3">
                    <div style="${
                        'flex:1;min-width:0'
                    }">
                        ${this.#buildHeading(
                            view,
                        )}
                    </div>
                </div>
                <div style="display:grid;
                    grid-template-columns:
                        3fr auto;
                    gap:1rem;
                    align-items:start">
                    ${this.#buildEstimates()}
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'align-items:'
                        + 'flex-end;'
                        + 'gap:0.5rem;'
                        + 'padding-right:'
                        + '0.75rem'
                    }">
                        ${this.#buildBadges()}
                        ${this.#buildActions()}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    }

    #buildHeading(
        view: string,
    ): SafeHtml {
        return html`
        <h3 class="${
            'font-display'
            + ' font-semibold'
            + ' truncate'
            + ' mb-1'
        }">
            ${this.#title}
        </h3>
        <div class="${
            'flex items-center'
            + ' gap-2 text-xs'
            + ' text-muted'
        }">
            ${view === 'priority'
                ? html`<span>${
                    'Priority'
                    } #${this.#priority}
                </span><span>${
                    '\u2022'
                }</span>`
                : html``}
            <span>
                by ${
                    displayText(
                        this.#submittedBy,
                    )
                }
            </span>
        </div>`;
    }

    #buildBadges(): SafeHtml {
        return html`
        <div style="${
            'display:grid;'
            + 'gap:0.25rem;'
            + 'align-self:center'
        }">
            <span class="${
                'badge '
                + this.#statusClassName
                + ' text-xs'
            }" style="${
                'justify-content:center'
            }">
                ${this.#statusLabel}
            </span>
            <span class="${
                'badge '
                + this.#edgeStatusClassName
                + ' text-xs'
            }" style="${
                'justify-content:center'
            }">
                ${iconTarget(12, '')}
                ${this.#edgeStatusLabel}
            </span>
        </div>`;
    }

    #buildEstimates(): SafeHtml {
        const boxStyle =
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
            + 'center';
        const days = this.#durationInDays;
        const cost = this.#estimatedCost;
        const impact = this.#estimatedImpact;
        return html`
        <div style="display:grid;
            grid-template-columns:
                repeat(3,1fr);
            gap:1rem">
            <div class="${
                'flex items-center gap-2'
            }">
                <div style="${boxStyle}">
                    ${iconClock(
                        16, 'text-primary',
                    )}
                </div>
                <div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Time
                    </p>
                    <p class="${
                        'text-sm font-medium'
                    }">
                        ${days
                            ? `${days}d`
                            : '\u2014'}
                    </p>
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
            }">
                <div style="${boxStyle}">
                    ${iconDollarSign(
                        16, 'text-primary',
                    )}
                </div>
                <div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Cost
                    </p>
                    <p class="${
                        'text-sm font-medium'
                    }">
                        ${cost
                            ? '$'
                                + (
                                    cost
                                    / COST_DIVISOR
                                ).toFixed(0)
                                + 'k'
                            : '\u2014'}
                    </p>
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
            }">
                <div style="${boxStyle}">
                    ${iconTrendingUp(
                        16, 'text-primary',
                    )}
                </div>
                <div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Impact
                    </p>
                    <p class="${
                        'text-sm font-medium'
                    }">
                        ${displayText(
                            impact
                                ? String(
                                    impact,
                                )
                                : '',
                        )}
                    </p>
                </div>
            </div>
        </div>`;
    }

    #buildActions(): SafeHtml {
        return html`
        <div
            class="flex idea-actions"
            style="${
                'flex-direction:column;'
                + 'align-items:stretch;'
                + 'gap:0.5rem;'
                + 'min-width:8rem;'
                + 'padding-bottom:'
                + '0.5rem'
            }">
            ${this.#needsEdgeDefinition
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
                data-idea-edge="${this.#id}">
                ${iconTarget(16, '')}
                <span
                    class="${
                        'hidden-'
                        + 'mobile'
                    }">
                    Define Edge
                </span>
            </button>` : html``}
            ${this.#isReviewable
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
                data-idea-review="${this.#id}">
                ${iconClipboardCheck(
                    16, '',
                )}
                <span
                    class="${
                        'hidden-'
                        + 'mobile'
                    }">
                    Review
                </span>
            </button>` : html``}
            ${this.#isConvertible
                ? html`
            <button
                class="${
                    'btn btn-primary'
                    + ' btn-sm gap-2'
                }"
                data-idea-convert="${
                    this.#id}">
                ${iconArrowRight(16, '')}
                <span
                    class="${
                        'hidden-'
                        + 'mobile'
                    }">
                    Convert
                </span>
            </button>` : html``}
        </div>`;
    }

    buildReviewCard(): SafeHtml {
        const rIcon = READINESS_ICONS[
            this.#readiness
        ]!;
        return html`
    <div class="card card-hover p-4"
        style="cursor:pointer"
        data-review-card="${this.#id}">
        <div class="flex items-start
            justify-between gap-4">
            <div style="${
                'flex:1;min-width:0'
            }">
                <div class="${
                    'flex flex-wrap'
                    + ' items-center'
                    + ' gap-2 mb-2'
                }">
                    <span class="${
                        'flex items-center'
                        + ' gap-1 text-sm '
                        + this
                            .#readinessClassName
                    }">${
                        rIcon(16, '')
                    } ${
                        this.#readinessLabel
                    }</span>
                    <span class="${
                        'badge '
                        + this
                            .#edgeStatusClassName
                        + ' text-xs'
                    }">${
                        iconTarget(12, '')
                    } ${
                        this.#edgeStatusLabel
                    }</span>
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${this.#title}</h3>
                <div class="${
                    'flex items-center'
                    + ' gap-4 text-sm'
                    + ' text-muted'
                }">
                    <span>by ${
                        displayText(
                            this.#submittedBy,
                        )
                    }</span>
                    <span>${
                        '\u2022'
                    }</span>
                    <span>${
                        this.#category
                    }</span>
                    <span>${
                        '\u2022'
                    }</span>
                    <span style="${
                        'color:hsl('
                        + 'var(--warning))'
                    }">${
                        this.#waitingDays
                    } days waiting</span>
                </div>
            </div>
            <div class="${
                'flex items-center gap-6'
            }">
                <div class="${
                    'text-right'
                    + ' hidden-mobile'
                }">
                    <div class="${
                        'flex items-center'
                        + ' gap-4 text-sm'
                    }">
                        <div>
                            <p class="${
                                'text-muted'
                            }">Impact</p>
                            <p class="${
                                'font-medium'
                            }">${
                                this
                                    .#impactLabel
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-muted'
                            }">Effort</p>
                            <p class="${
                                'font-medium'
                            }">${
                                this
                                    .#effortLabel
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

    buildDetailView(
        ideaId: string,
        isEditing: boolean,
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
            <span>${this.#title}</span>
        </div>

        <div class="flex items-start
            justify-between gap-4 mb-6">
            <div
                class="${
                    'flex items-center gap-4'
                }">
                <button
                    class="${
                        'btn btn-ghost'
                        + ' btn-icon'
                    }"
                    id="idea-back-btn">
                    ${iconArrowLeft(20, '')}
                </button>
                <div>
                    <div class="flex flex-wrap
                        items-center gap-3
                        mb-2">
                        ${isEditing
                            ? html`<input
                                class="input"
                                id="${
                                    'idea-edit'
                                    + '-title'
                                }"
                                value="${
                                    this.#title
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
                                ${this.#title}
                            </h1>`}
                        <span class="badge
                            ${this
                                .#statusClassName}
                            text-xs">
                            ${this
                                .#statusLabel}
                        </span>
                        <span class="badge
                            ${this
                                .#edgeStatusClassName}
                            text-xs">
                            ${iconTarget(
                                12, '',
                            )}
                            ${this
                                .#edgeStatusLabel}
                        </span>
                    </div>
                    <p class="${
                        'text-sm text-muted'
                    }">
                        Submitted by
                        ${displayText(
                            this.#submittedBy,
                        )}
                    </p>
                </div>
            </div>
            <div
                class="${
                    'flex items-center gap-2'
                }">
                ${this.#needsEdgeDefinition
                    ? html`
                <button
                    class="${
                        'btn btn-outline'
                        + ' btn-sm gap-2'
                    }"
                    style="${
                        'border-color:hsl('
                        + 'var(--primary)'
                        + '/0.3);'
                        + 'color:hsl('
                        + 'var(--primary))'
                    }"
                    id="idea-edge-btn">
                    ${iconTarget(16, '')}
                    Define Edge
                </button>` : html``}
                ${this.#status === 'active'
                    ? html`
                <button
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }"
                    id="${
                        'idea-submit'
                        + '-review-btn'
                    }">
                    ${iconClipboardCheck(
                        16, '',
                    )}
                    Submit for Review
                </button>` : html``}
                ${this.#isReviewable
                    ? html`
                <button
                    class="${
                        'btn btn-outline'
                        + ' btn-sm gap-2'
                    }"
                    style="${
                        'border-color:hsl('
                        + 'var(--warning)'
                        + '/0.3);'
                        + 'color:hsl('
                        + 'var(--warning))'
                    }"
                    id="idea-review-btn">
                    ${iconClipboardCheck(
                        16, '',
                    )}
                    Review
                </button>` : html``}
                ${this.#isConvertible
                    ? html`
                <button
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }"
                    id="idea-convert-btn">
                    ${iconArrowRight(16, '')}
                    Convert
                </button>` : html``}
                ${isEditing
                    ? html`<div
                        class="flex gap-2">
                        <button
                            class="${
                                'btn btn-outline'
                                + ' gap-2'
                            }"
                            id="${
                                'idea-cancel'
                                + '-btn'
                            }">
                            ${iconX(
                                16, '',
                            )} Cancel
                        </button>
                        <button
                            class="${
                                'btn btn-primary'
                                + ' gap-2'
                            }"
                            id="${
                                'idea-save-btn'
                            }">
                            ${iconSave(
                                16, '',
                            )} Save
                        </button>
                    </div>`
                    : html`<button
                        class="${
                            'btn btn-outline'
                            + ' gap-2'
                        }"
                        id="idea-edit-btn">
                        ${iconEdit(
                            16, '',
                        )} Edit
                    </button>`}
            </div>
        </div>

        <div style="display:flex;
            flex-direction:column;
            gap:1.5rem">
            ${this.#buildProblemSolutionCard(
                isEditing,
            )}
            ${this.#buildDetailsCard(
                isEditing,
            )}
            ${this.#buildEstimatesCard(
                isEditing,
            )}
        </div>
    </div>`;
    }

    #buildProblemSolutionCard(
        isEditing: boolean,
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
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id="idea-edit-problem"
                        rows="3"
                        style="resize:none"
                        >${this
                            .#problemStatement
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this
                                .#problemStatement,
                        )}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Target Users
                </p>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'target-users'
                        }"
                        rows="2"
                        style="resize:none"
                        >${this
                            .#description
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#description,
                        )}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Proposed Solution
                </p>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'solution'
                        }"
                        rows="3"
                        style="resize:none"
                        >${this
                            .#proposedSolution
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this
                                .#proposedSolution,
                        )}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Expected Outcome
                </p>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'outcome'
                        }"
                        rows="3"
                        style="resize:none"
                        >${this
                            .#expectedOutcome
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this
                                .#expectedOutcome,
                        )}
                        </p>`}
            </div>
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Success Metrics
                </p>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id="${
                            'idea-edit-'
                            + 'metrics'
                        }"
                        rows="3"
                        style="resize:none"
                        >${this
                            .#successMetrics
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this
                                .#successMetrics,
                        )}
                        </p>`}
            </div>
        </div>
    </div>`;
    }

    #buildDetailsCard(
        isEditing: boolean,
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
                ${isEditing
                    ? html`<input class="input"
                        id="${
                            'idea-edit-category'
                        }"
                        value="${
                            this.#category
                        }" />`
                    : html`<p
                        class="${
                            'text-sm font-medium'
                        }">
                        ${displayText(
                            this.#category,
                        )}
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
                    ${displayText(
                        this.#submittedBy,
                    )}
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
                    ${this.#submittedAt
                        ? formatDate(
                            this.#submittedAt,
                        )
                        : displayText('')}
                </p>
            </div>
        </div>
    </div>`;
    }

    #buildEstimatesCard(
        isEditing: boolean,
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
                  value:
                      this.#estimatedImpact,
                  unit: ' pts',
                  prefix: '',
              },
              {
                  label: 'Duration',
                  inputId: 'duration',
                  icon: iconClock,
                  value:
                      this.#durationInDays,
                  unit: 'd',
                  prefix: '',
              },
              {
                  label: 'Cost',
                  inputId: 'cost',
                  icon: iconDollarSign,
                  value:
                      this.#estimatedCost,
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
                    <span
                        class="font-medium">
                        ${metric.label}
                    </span>
                </div>
                ${isEditing
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
                            'text-lg'
                            + ' font-bold'
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
}

export class IdeaListPresenter {
    readonly #ideas: IdeaPresenter[];
    readonly #pendingReviewCount: number;

    constructor(ideas: Idea[]) {
        this.#ideas = ideas.map(
            i => new IdeaPresenter(i),
        );
        this.#pendingReviewCount =
            this.#ideas.filter(
                i => i.isInReview(),
            ).length;
    }

    pendingReviewCount(): number {
        return this.#pendingReviewCount;
    }

    totalCount(): number {
        return this.#ideas.length;
    }

    renderList(): SafeHtml {
        const sorted =
            [...this.#ideas].sort(
                (a, b) =>
                    a.prioritySortKey()
                    - b.prioritySortKey(),
            );
        return html`${sorted.map(
            idea => idea.buildCard(
                'priority',
            ),
        )}`;
    }

    countLabel(): string {
        const n = this.#ideas.length;
        return `${n} `
            + `${n === 1
                ? 'idea' : 'ideas'}`
            + ' \u2022 by priority';
    }
}

export class ReviewQueuePresenter {
    readonly #ideas: IdeaPresenter[];
    readonly #totalCount: number;
    readonly #readyCount: number;
    readonly #avgWaitDays: number;
    #search = '';
    #readinessFilter = 'all';

    constructor(ideas: Idea[]) {
        this.#ideas = ideas.map(
            i => new IdeaPresenter(i),
        );
        this.#totalCount =
            this.#ideas.length;
        this.#readyCount =
            this.#ideas.filter(
                i => i.isReady(),
            ).length;
        this.#avgWaitDays =
            this.#ideas.length > 0
                ? Math.round(
                    this.#ideas.reduce(
                        (sum, i) =>
                            sum
                            + i.waitingDays(),
                        0,
                    ) / this.#ideas.length,
                )
                : 0;
    }

    setSearch(query: string): void {
        this.#search = query.toLowerCase();
    }

    setReadinessFilter(
        readiness: string,
    ): void {
        this.#readinessFilter = readiness;
    }

    stats(): {
        total: number;
        ready: number;
        avgWait: number;
    } {
        return {
            total: this.#totalCount,
            ready: this.#readyCount,
            avgWait: this.#avgWaitDays,
        };
    }

    renderList(): SafeHtml {
        const filtered =
            this.#ideas.filter(
                i =>
                    i.matchesSearch(
                        this.#search,
                    )
                    && i.matchesReadinessFilter(
                        this.#readinessFilter,
                    ),
            );
        return html`${filtered.map(
            i => i.buildReviewCard(),
        )}`;
    }

    hasFilteredResults(): boolean {
        return this.#ideas.some(
            i =>
                i.matchesSearch(
                    this.#search,
                )
                && i.matchesReadinessFilter(
                    this.#readinessFilter,
                ),
        );
    }
}
