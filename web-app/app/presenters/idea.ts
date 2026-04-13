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
    iconEdit,
    iconSave,
    iconX,
} from '../icons';
import type {
    Idea,
    IdeaStatus,
} from '../adapters';
import {
    IDEA_STATUS_CONFIG,
} from '../adapters';
import {
    orderedKeys,
} from './ordered-keys';

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
    readonly #idea: Idea;

    constructor(idea: Idea) {
        this.#idea = idea;
    }

    idForLink(): string {
        return this.#idea.idForLink();
    }

    positionSortKey(): number {
        return this.#idea.positionSortKey();
    }

    statusGroup(): IdeaStatus {
        return this.#idea.statusValue();
    }

    buildStatusBadge(): SafeHtml {
        const cfg = IDEA_STATUS_CONFIG[
            this.#idea.statusValue()
        ]!;
        const icon = STATUS_ICONS[
            this.#idea.statusValue()
        ]!;
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs badge-fixed-w'
            + ' cursor-pointer'
        }" data-status="${
            this.#idea.statusValue()
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(
        view: string,
        showGrip: boolean,
    ): SafeHtml {
        return html`
    <div class="${
        'card card-hover p-5 cursor-pointer'
    }"
        data-idea-card="${this.#idea.idForLink()}"
        data-position="${
            this.#idea.positionSortKey()}">
        <div class="${
            'flex items-center gap-4'
        }">
            ${showGrip ? html`<div class="${
                'hidden-mobile text-muted'
                + ' cursor-grab'
            }">${
                iconGripVertical(20, '')
            }</div>` : html``}
            <div class="flex-fill">
                ${this.#buildHeading()}
            </div>
            <div class="${
                'flex flex-col items-end'
                + ' gap-2 ml-6'
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
            ${this.#idea.titleText()}
        </h3>
        <span class="${
            'badge '
            + this.#idea.statusClassName()
            + ' text-xs badge-fixed-w mt-1'
        }">${
            STATUS_ICONS[
                this.#idea.statusValue()
            ]!(14, '')
        } ${this.#idea.statusLabel()}</span>`;
    }

    #buildActions(): SafeHtml {
        return html`
        <div
            class="${
                'flex idea-actions'
                + ' idea-actions-stack'
            }">
            ${this.#idea.isConvertible()
                ? html`
            <button
                class="${
                    'btn btn-primary'
                    + ' btn-sm gap-2'
                }"
                data-idea-convert="${
                    this.#idea.idForLink()}">
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
        const wrapClass =
            this.#idea.isReviewable()
                ? 'idea-detail-wrap'
                  + ' has-footer-actions'
                : 'idea-detail-wrap';
        return html`
    <div class="${wrapClass}">
        <div class="flex items-center gap-2
            text-sm text-muted mb-4">
            <a href="../ideas/index.html"
                class="hover-link">
                Ideas
            </a>
            <span>/</span>
            <span>${this.#idea.titleText()}</span>
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
                                class="${
                                    'input'
                                    + ' idea-edit'
                                    + '-title'
                                }"
                                id="${
                                    'idea-edit'
                                    + '-title'
                                }"
                                value="${
                                    this.#idea
                                        .titleText()
                                }" />`
                            : html`<h1
                                class="${
                                    'text-xl'
                                    + ' font-display'
                                    + ' font-bold'
                                }">
                                ${this.#idea
                                    .titleText()}
                            </h1>`}
                        <span class="badge
                            ${this.#idea
                                .statusClassName()}
                            text-xs">
                            ${this.#idea
                                .statusLabel()}
                        </span>
                    </div>
                    <p class="${
                        'text-sm text-muted'
                    }">
                        Submitted by
                        ${displayText(
                            this.#idea
                                .submittedByName(),
                        )}
                        @ ${formatDateTime(
                            this.#idea
                                .submittedAtDate(),
                        )}
                    </p>
                </div>
            </div>
            <div
                class="${
                    'flex items-center gap-2'
                }">
                ${this.#idea.statusValue()
                    === 'active'
                    || this.#idea.statusValue()
                    === 'sent-back'
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
                ${this.#idea.isConvertible()
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

        <div class="stack-lg">
            ${this.#buildProblemSolutionCard(
                isEditing,
            )}
        </div>
    </div>
    ${this.#idea.isReviewable()
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
                    justify-end gap-4">
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
            class="${
                'dialog dialog-narrow hidden'
            }"
            role="dialog"
            aria-modal="true">
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
        <div class="${
            'flex flex-col gap-5'
        }">
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">
                    Problem Statement
                </p>
                ${isEditing
                    ? html`<textarea
                        class="${
                            'textarea'
                            + ' resize-none'
                        }"
                        id="idea-edit-problem"
                        rows="3"
                        >${this
                            .#idea
                            .problemStatementText()
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#idea
                            .problemStatementText(),
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
                    ? html`<input
                        class="input"
                        id="${
                            'idea-edit-'
                            + 'target'
                        }"
                        value="${
                            this.#idea
                                .targetUsersText()
                        }" />`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#idea
                                .targetUsersText(),
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
                        class="${
                            'textarea'
                            + ' resize-none'
                        }"
                        id="${
                            'idea-edit-'
                            + 'solution'
                        }"
                        rows="3"
                        >${this
                            .#idea
                            .proposedSolutionText()
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#idea
                            .proposedSolutionText(),
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
                        class="${
                            'textarea'
                            + ' resize-none'
                        }"
                        id="${
                            'idea-edit-'
                            + 'outcome'
                        }"
                        rows="3"
                        >${this
                            .#idea
                            .expectedOutcomeText()
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#idea
                            .expectedOutcomeText(),
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
                        class="${
                            'textarea'
                            + ' resize-none'
                        }"
                        id="${
                            'idea-edit-'
                            + 'metrics'
                        }"
                        rows="3"
                        >${this
                            .#idea
                            .successMetricsText()
                        }</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            this.#idea
                            .successMetricsText(),
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
    #filter:
        | { kind: 'all' }
        | {
            kind: 'filtered';
            status: IdeaStatus;
        } = { kind: 'all' };

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
        this.#filter =
            this.#filter.kind
                === 'filtered'
            && this.#filter.status
                === status
                ? { kind: 'all' }
                : {
                    kind: 'filtered',
                    status,
                };
    }

    activeFilter():
        IdeaStatus | null {
        return this.#filter.kind
            === 'filtered'
            ? this.#filter.status
            : null;
    }

    renderList(): SafeHtml {
        const f = this.#filter;
        const filtered =
            f.kind === 'filtered'
                ? this.#ideas.filter(
                    i => i.statusGroup()
                        === f.status,
                )
                : this.#ideas;
        const sorted =
            [...filtered].sort(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        const hasGrip =
            f.kind === 'all';
        return html`${sorted.map(
            idea => idea.buildCard(
                'position', hasGrip,
            ),
        )}`;
    }
}
