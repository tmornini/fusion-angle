import { html, SafeHtml } from '../safe-html';
import {
    displayText, formatDateTime,
} from '../core';
import {
    iconGripVertical,
    iconClock,
    iconTrendingUp,
    iconLightbulb,
    iconClipboardCheck,
    iconArrowRight,
    iconArrowLeft,
    iconCheckCircle,
    iconCheckCircle2,
    iconXCircle,
    iconMessageSquare,
    iconEdit,
    iconSave,
    iconX,
} from '../icons';
import type {
    Idea,
    IdeaStatus,
} from '../../../api/types';
import {
    orderedKeys,
} from './ordered-keys';
import {
    IDEA_STATUS_CONFIG,
} from '../../../api/types';

const STATUS_ICONS: Record<
    IdeaStatus,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    'active': iconLightbulb,
    'in-review': iconClipboardCheck,
    'approved': iconCheckCircle2,
    'promoted': iconTrendingUp,
    'sent-back': iconArrowLeft,
    'archived': iconClock,
    'deleted': iconXCircle,
};

export class IdeaPresenter {
    readonly #id: string;
    readonly #title: string;
    readonly #position: number;
    readonly #status: IdeaStatus;
    readonly #statusClassName: string;
    readonly #statusLabel: string;
    readonly #submittedBy: string;
    readonly #submittedAt: string;
    readonly #problemStatement: string;
    readonly #description: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #isReviewable: boolean;
    readonly #isConvertible: boolean;

    constructor(idea: Idea) {
        this.#id = idea.id;
        this.#title = idea.title;
        this.#position = idea.position;
        this.#status = idea.status;
        this.#statusClassName =
            idea.statusClassName();
        this.#statusLabel =
            idea.statusLabel();
        this.#submittedBy = idea.submittedBy;
        this.#submittedAt = idea.submittedAt;
        this.#problemStatement =
            idea.problemStatement;
        this.#description = idea.description;
        this.#proposedSolution =
            idea.proposedSolution;
        this.#expectedOutcome =
            idea.expectedOutcome;
        this.#successMetrics =
            idea.successMetrics;
        this.#isReviewable =
            idea.isReviewable();
        this.#isConvertible =
            idea.isConvertible();
    }

    idForLink(): string {
        return this.#id;
    }

    positionSortKey(): number {
        return this.#position;
    }

    statusGroup(): IdeaStatus {
        return this.#status;
    }

    buildStatusBadge(): SafeHtml {
        const cfg = IDEA_STATUS_CONFIG[
            this.#status
        ]!;
        const icon = STATUS_ICONS[
            this.#status
        ]!;
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs'
        }" data-status="${
            this.#status
        }" style="${
            'cursor:pointer;'
            + 'min-width:6rem;'
            + 'justify-content:center'
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(
        view: string,
        showGrip: boolean,
    ): SafeHtml {
        return html`
    <div class="card card-hover"
        style="${
            'padding:1.25rem;'
            + 'cursor:pointer'
        }"
        data-idea-card="${this.#id}"
        data-position="${this.#position}">
        <div class="${
            'flex items-center gap-4'
        }">
            ${showGrip ? html`<div class="${
                'hidden-mobile text-muted'
            }" style="cursor:grab">${
                iconGripVertical(20, '')
            }</div>` : html``}
            <div style="${
                'flex:1;min-width:0'
            }">
                ${this.#buildHeading()}
            </div>
            <div style="${
                'display:flex;'
                + 'flex-direction:column;'
                + 'align-items:flex-end;'
                + 'gap:0.5rem;'
                + 'margin-left:1.5rem'
            }">
                ${this.#buildActions()}
            </div>
        </div>
    </div>`;
    }

    #buildHeading(): SafeHtml {
        return html`
        <h3 class="${
            'font-display'
            + ' font-semibold'
            + ' truncate'
        }">
            ${this.#title}
        </h3>
        <span class="${
            'badge '
            + this.#statusClassName
            + ' text-xs'
        }" style="${
            'justify-content:center;'
            + 'min-width:6rem;'
            + 'margin-top:0.25rem'
        }">${
            STATUS_ICONS[
                this.#status
            ]!(14, '')
        } ${this.#statusLabel}</span>`;
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

    buildDetailView(
        ideaId: string,
        isEditing: boolean,
    ): SafeHtml {
        const pad = this.#isReviewable
            ? ';padding-bottom:10rem'
            : '';
        return html`
    <div
        style="${'max-width:48rem;'
            + 'margin:0 auto'
            + pad}">
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
                    </div>
                    <p class="${
                        'text-sm text-muted'
                    }">
                        Submitted by
                        ${displayText(
                            this.#submittedBy,
                        )}
                        @ ${formatDateTime(
                            this.#submittedAt,
                        )}
                    </p>
                </div>
            </div>
            <div
                class="${
                    'flex items-center gap-2'
                }">
                ${this.#status === 'active'
                    || this.#status === 'sent-back'
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
        </div>
    </div>
    ${this.#isReviewable
        ? html`
            ${this.#buildApprovalFooter()}
            ${this.#buildApprovalDialogs()}`
        : html``}`;
    }

    #buildApprovalFooter(): SafeHtml {
        return html`
        <div class="action-footer">
            <div class="${
                'action-footer-inner'
            }">
                <div class="flex items-center
                    justify-between gap-4">
                    <button
                        class="${
                            'btn btn-outline'
                            + ' gap-2'
                        }"
                        id="${
                            'approval-clarify'
                            + '-btn'
                        }">
                        ${iconMessageSquare(
                            16, '',
                        )}
                        <span class="${
                            'hidden-mobile'
                        }">
                            ${'Request'
                                + ' Clarification'}
                        </span>
                        <span
                            class="${
                                'visible-'
                                + 'mobile'
                            }">
                            Clarify
                        </span>
                    </button>
                    <div class="flex gap-3">
                        <button
                            class="${
                                'btn'
                                + ' btn-outline'
                                + '-error gap-2'
                            }"
                            id="${
                                'approval-'
                                + 'reject'
                                + '-btn'
                            }">
                            ${iconXCircle(
                                16, '',
                            )}
                            <span
                                class="${
                                    'hidden-'
                                    + 'mobile'
                                }">
                                Send Back
                            </span>
                            <span
                                class="${
                                    'visible-'
                                    + 'mobile'
                                }">
                                Reject
                            </span>
                        </button>
                        <button
                            class="${
                                'btn'
                                + ' btn-success'
                                + ' gap-2'
                            }"
                            id=${'approval'
                                + '-approve'
                                + '-btn'}>
                            ${iconCheckCircle(
                                16, '',
                            )}
                            Approve
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    #buildApprovalDialogs(): SafeHtml {
        return html`
        <div
            id="${
                'approval-reject'
                + '-backdrop'
            }"
            class="${
                'dialog-backdrop hidden'
            }">
        </div>
        <div
            id="${
                'approval-reject-dialog'
            }"
            class="dialog hidden"
            role="dialog"
            aria-modal="true"
            style="max-width:28rem">
            <div class="dialog-header">
                <h3 class="dialog-title">
                    ${'Send Back for'
                        + ' Revision'}
                </h3>
                <p class="${
                    'dialog-description'
                }">
                    ${'Provide feedback'
                        + ' to help the'
                        + ' submitter'
                        + ' improve'
                        + ' their idea.'}
                </p>
            </div>
            <div class="py-4">
                <textarea
                    class="${
                        'textarea'
                        + ' resize-none'
                    }"
                    id=${'approval'
                        + '-reject'
                        + '-feedback'}
                    placeholder="${
                        'Explain what'
                        + ' changes or'
                        + ' additional'
                        + ' information'
                        + ' is'
                        + ' needed...'
                    }"
                    rows="4">
                </textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="${
                        'btn btn-outline'
                    }"
                    id="${
                        'approval-reject'
                        + '-cancel'
                    }">
                    Cancel
                </button>
                <button
                    class="btn
                        btn-destructive"
                    id="${
                        'approval-reject'
                        + '-confirm'
                    }">
                    Send Back
                </button>
            </div>
        </div>

        <div
            id="${
                'approval-clarify'
                + '-backdrop'
            }"
            class="${
                'dialog-backdrop hidden'
            }">
        </div>
        <div
            id="${
                'approval-clarify'
                + '-dialog'
            }"
            class="dialog hidden"
            role="dialog"
            aria-modal="true"
            style="max-width:28rem">
            <div class="dialog-header">
                <h3 class="dialog-title">
                    ${'Request'
                        + ' Clarification'}
                </h3>
                <p class="${
                    'dialog-description'
                }">
                    ${'Ask the submitter'
                        + ' for additional'
                        + ' details before'
                        + ' making a'
                        + ' decision.'}
                </p>
            </div>
            <div class="py-4">
                <textarea
                    class="${
                        'textarea'
                        + ' resize-none'
                    }"
                    id=${'approval'
                        + '-clarify'
                        + '-feedback'}
                    placeholder="${
                        'What additional'
                        + ' information'
                        + ' do you'
                        + ' need?'
                    }"
                    rows="4">
                </textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="${
                        'btn btn-outline'
                    }"
                    id="${
                        'approval-clarify'
                        + '-cancel'
                    }">
                    Cancel
                </button>
                <button
                    class="${
                        'btn btn-primary'
                    }"
                    id=${'approval'
                        + '-clarify'
                        + '-confirm'}>
                    Send Request
                </button>
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

}

export class IdeaListPresenter {
    #ideas: IdeaPresenter[];
    readonly #statusBadges: SafeHtml;
    #filterStatus: IdeaStatus | null =
        null;

    constructor(ideas: Idea[]) {
        this.#ideas = ideas.map(
            i => new IdeaPresenter(i),
        );
        const groups = Object.groupBy(
            this.#ideas,
            i => i.statusGroup(),
        );
        const order: IdeaStatus[] = [
            'active', 'in-review',
            'sent-back', 'approved',
        ];
        const badges =
            orderedKeys(groups, order)
                .map(s => groups[s])
                .filter(
                    items =>
                        items
                        && items.length > 0,
                )
                .map(items =>
                    items![0]!
                        .buildStatusBadge(),
                );
        this.#statusBadges =
            html`${badges}`;
    }

    update(ideas: Idea[]): void {
        this.#ideas = ideas.map(
            i => new IdeaPresenter(i),
        );
    }

    renderStatusBadges(): SafeHtml {
        return this.#statusBadges;
    }

    toggleFilter(
        status: IdeaStatus,
    ): void {
        this.#filterStatus =
            this.#filterStatus === status
                ? null
                : status;
    }

    activeFilter():
        IdeaStatus | null {
        return this.#filterStatus;
    }

    renderList(): SafeHtml {
        const filtered =
            this.#filterStatus
                ? this.#ideas.filter(
                    i => i.statusGroup()
                        === this
                            .#filterStatus,
                )
                : this.#ideas;
        const sorted =
            [...filtered].sort(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        const hasGrip =
            !this.#filterStatus;
        return html`${sorted.map(
            idea => idea.buildCard(
                'position', hasGrip,
            ),
        )}`;
    }
}
