import {
    html, setHtml, SafeHtml,
} from '../safe-html';
import { $ } from '../dom';
import {
    orderedKeys,
} from './ordered-keys';
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
    IdeaEntity,
} from '../adapters';
import {
    IDEA_STATUS_CONFIG,
} from '../adapters';
import type { EditMode } from './edit-mode';

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

interface IdeaDraftFields {
    title: string;
    problemStatement: string;
    targetUsers: string;
    proposedSolution: string;
    expectedOutcome: string;
    successMetrics: string;
}

export type IdeaFieldKey =
    keyof IdeaDraftFields;

export type IdeaEntityPatch =
    Pick<IdeaEntity,
        | 'title'
        | 'problem_statement'
        | 'target_users'
        | 'proposed_solution'
        | 'expected_outcome'
        | 'success_metrics'>;

export class IdeaPresenter {
    #idea: Idea;
    #mode: EditMode<IdeaDraftFields>
        = { kind: 'reading' };

    constructor(idea: Idea) {
        this.#idea = idea;
    }

    update(idea: Idea): void {
        this.#idea = idea;
        this.#mode = { kind: 'reading' };
    }

    beginEdit(): void {
        this.#mode = {
            kind: 'editing',
            draft: {
                title:
                    this.#idea.titleText(),
                problemStatement: this.#idea
                    .problemStatementText(),
                targetUsers: this.#idea
                    .targetUsersText(),
                proposedSolution: this.#idea
                    .proposedSolutionText(),
                expectedOutcome: this.#idea
                    .expectedOutcomeText(),
                successMetrics: this.#idea
                    .successMetricsText(),
            },
        };
    }

    cancelEdit(): void {
        this.#mode = { kind: 'reading' };
    }

    isEditing(): boolean {
        return this.#mode.kind === 'editing';
    }

    setDraftField(
        field: IdeaFieldKey,
        value: string,
    ): void {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'setDraftField requires'
                + ' editing mode',
            );
        }
        this.#mode.draft[field] = value;
    }

    buildEntityPatch(): IdeaEntityPatch {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'buildEntityPatch requires'
                + ' editing mode',
            );
        }
        const d = this.#mode.draft;
        return {
            title: d.title,
            problem_statement:
                d.problemStatement,
            target_users: d.targetUsers,
            proposed_solution:
                d.proposedSolution,
            expected_outcome:
                d.expectedOutcome,
            success_metrics:
                d.successMetrics,
        };
    }

    idForLink(): string {
        return this.#idea.idForLink();
    }

    isReviewable(): boolean {
        return this.#idea.isReviewable();
    }

    isConvertible(): boolean {
        return this.#idea.isConvertible();
    }

    canSubmit(): boolean {
        const s = this.#idea.statusValue();
        return s === 'active'
            || s === 'sent-back';
    }

    positionSortKey(): number {
        return this.#idea.positionSortKey();
    }

    statusGroup(): IdeaStatus {
        return this.#idea.statusValue();
    }

    buildStatusBadge(
        isActive: boolean | null,
    ): SafeHtml {
        const cfg = IDEA_STATUS_CONFIG[
            this.#idea.statusValue()
        ]!;
        const icon = STATUS_ICONS[
            this.#idea.statusValue()
        ]!;
        const dimmed = isActive === false
            ? 'true'
            : 'false';
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs badge-fixed-w'
            + ' cursor-pointer'
        }" data-status="${
            this.#idea.statusValue()
        }" data-dimmed="${dimmed}">${
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

    renderShell(
        container: HTMLElement,
    ): void {
        setHtml(container, html`
<div class="idea-detail-host">
    <div class="idea-detail-wrap">
        <div class="${
            'flex items-center gap-2'
            + ' text-sm text-muted mb-4'
            + ' idea-breadcrumb-slot'
        }"></div>
        <div class="${
            'flex items-start'
            + ' justify-between gap-4 mb-6'
        }">
            <div class="${
                'flex items-center gap-4'
            }">
                <button
                    class="${
                        'btn btn-ghost'
                        + ' btn-icon'
                    }"
                    id="idea-back-btn"
                    data-idea-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="idea-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' idea-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg idea-cards-slot'
        }"></div>
    </div>
    <div class="idea-footer-slot"></div>
    <div class="idea-dialogs-slot"></div>
</div>`);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        this.#updateWrapClass(container);
        this.#updateBreadcrumb(container);
        this.#updateTitle(container);
        this.#updateActions(container);
        this.#updateCards(container);
        this.#updateFooter(container);
        this.#updateDialogs(container);
    }

    #updateWrapClass(
        container: HTMLElement,
    ): void {
        const wrap = $(
            '.idea-detail-wrap', container,
        );
        if (!wrap) return;
        wrap.classList.toggle(
            'has-footer-actions',
            this.#idea.isReviewable(),
        );
    }

    #updateBreadcrumb(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-breadcrumb-slot', container,
        );
        if (!slot) return;
        setHtml(slot, html`
            <a href="../ideas/index.html"
                class="hover-link">
                Ideas
            </a>
            <span>/</span>
            <span>${this.#titleForDisplay()}</span>`);
    }

    #titleForDisplay(): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft.title
            : this.#idea.titleText();
    }

    #updateTitle(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-title-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildTitleSection());
    }

    #buildTitleSection(): SafeHtml {
        return html`
            <div class="${
                'flex flex-wrap items-center'
                + ' gap-3 mb-2'
            }">
                ${this.isEditing()
                    ? html`<input
                        class="${
                            'input idea-edit-title'
                        }"
                        id="idea-edit-title"
                        data-idea-field="title"
                        value="${
                            this.#titleForDisplay()
                        }" />`
                    : html`<h1
                        class="${
                            'text-xl'
                            + ' font-display'
                            + ' font-bold'
                        }">
                        ${this.#idea.titleText()}
                    </h1>`}
                <span class="${
                    'badge '
                    + this.#idea.statusClassName()
                    + ' text-xs'
                }">
                    ${this.#idea.statusLabel()}
                </span>
            </div>
            <p class="${
                'text-sm text-muted'
            }">
                Submitted by
                ${displayText(
                    this.#idea.submittedByName(),
                )}
                @ ${formatDateTime(
                    this.#idea.submittedAtDate(),
                )}
            </p>`;
    }

    #updateActions(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-actions-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildActionButtons());
    }

    #buildActionButtons(): SafeHtml {
        return html`
            ${this.canSubmit()
                ? html`<button
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }"
                    id="idea-submit-review-btn"
                    data-idea-action="${
                        'submit-review'
                    }">
                    ${iconClipboardCheck(16, '')}
                    Submit for Review
                </button>` : html``}
            ${this.#idea.isConvertible()
                ? html`<button
                    class="${
                        'btn btn-primary'
                        + ' btn-sm gap-2'
                    }"
                    id="idea-convert-btn"
                    data-idea-action="convert">
                    ${iconArrowRight(16, '')}
                    Convert
                </button>` : html``}
            ${this.isEditing()
                ? html`<div class="flex gap-2">
                    <button
                        class="${
                            'btn btn-outline gap-2'
                        }"
                        id="idea-cancel-btn"
                        data-idea-action="cancel">
                        ${iconX(16, '')} Cancel
                    </button>
                    <button
                        class="${
                            'btn btn-primary gap-2'
                        }"
                        id="idea-save-btn"
                        data-idea-action="save">
                        ${iconSave(16, '')} Save
                    </button>
                </div>`
                : html`<button
                    class="${
                        'btn btn-outline gap-2'
                    }"
                    id="idea-edit-btn"
                    data-idea-action="edit">
                    ${iconEdit(16, '')} Edit
                </button>`}`;
    }

    #updateCards(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-cards-slot', container,
        );
        if (!slot) return;
        setHtml(
            slot,
            this.#buildProblemSolutionCard(),
        );
    }

    #buildProblemSolutionCard(): SafeHtml {
        return html`
    <div class="card p-6">
        <h2 class="${
            'text-lg font-display'
            + ' font-semibold mb-4'
        }">
            Problem &amp; Solution
        </h2>
        <div class="flex flex-col gap-5">
            ${this.#buildTextareaField(
                'idea-edit-problem',
                'problemStatement',
                'Problem Statement',
                this.#idea
                    .problemStatementText(),
            )}
            ${this.#buildInputField(
                'idea-edit-target',
                'targetUsers',
                'Target Users',
                this.#idea.targetUsersText(),
            )}
            ${this.#buildTextareaField(
                'idea-edit-solution',
                'proposedSolution',
                'Proposed Solution',
                this.#idea
                    .proposedSolutionText(),
            )}
            ${this.#buildTextareaField(
                'idea-edit-outcome',
                'expectedOutcome',
                'Expected Outcome',
                this.#idea
                    .expectedOutcomeText(),
            )}
            ${this.#buildTextareaField(
                'idea-edit-metrics',
                'successMetrics',
                'Success Metrics',
                this.#idea
                    .successMetricsText(),
            )}
        </div>
    </div>`;
    }

    #fieldDraftValue(
        field: IdeaFieldKey,
        savedValue: string,
    ): string {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft[field]
            : savedValue;
    }

    #buildInputField(
        id: string,
        field: IdeaFieldKey,
        label: string,
        savedValue: string,
    ): SafeHtml {
        const value = this.#fieldDraftValue(
            field, savedValue,
        );
        return html`
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">${label}</p>
                ${this.isEditing()
                    ? html`<input
                        class="input"
                        id="${id}"
                        data-idea-field="${
                            field
                        }"
                        value="${value}" />`
                    : html`<p class="text-sm">
                        ${displayText(
                            savedValue,
                        )}
                    </p>`}
            </div>`;
    }

    #buildTextareaField(
        id: string,
        field: IdeaFieldKey,
        label: string,
        savedValue: string,
    ): SafeHtml {
        const value = this.#fieldDraftValue(
            field, savedValue,
        );
        return html`
            <div>
                <p class="${
                    'text-xs text-muted mb-1'
                }">${label}</p>
                ${this.isEditing()
                    ? html`<textarea
                        class="${
                            'textarea resize-none'
                        }"
                        id="${id}"
                        data-idea-field="${
                            field
                        }"
                        rows="3"
                        >${value}</textarea>`
                    : html`<p class="text-sm">
                        ${displayText(
                            savedValue,
                        )}
                    </p>`}
            </div>`;
    }

    #updateFooter(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-footer-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#idea.isReviewable()
            ? this.#buildApprovalFooter()
            : html``);
    }

    #buildApprovalFooter(): SafeHtml {
        return html`
        <div class="action-footer">
            <div class="action-footer-inner">
                <div class="${
                    'flex items-center'
                    + ' justify-end gap-4'
                }">
                    <div class="flex gap-3">
                        <button
                            class="${
                                'btn'
                                + ' btn-outline-error'
                                + ' gap-2'
                            }"
                            id="approval-send-back-btn"
                            data-dialog-open="${
                                'approval-send-back'
                            }">
                            ${iconXCircle(16, '')}
                            <span class="${
                                'hidden-mobile'
                            }">Send Back</span>
                            <span class="${
                                'visible-mobile'
                            }">Send Back</span>
                        </button>
                        <button
                            class="${
                                'btn btn-success'
                                + ' gap-2'
                            }"
                            id="approval-approve-btn"
                            data-idea-action="${
                                'approve'
                            }">
                            ${iconCheckCircle(16, '')}
                            Approve
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    #updateDialogs(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.idea-dialogs-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#idea.isReviewable()
            ? this.#buildApprovalDialogs()
            : html``);
    }

    #buildApprovalDialogs(): SafeHtml {
        return html`
        <div
            id="approval-send-back-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"
            data-dialog-id="${
                'approval-send-back'
            }">
        </div>
        <div
            id="approval-send-back-dialog"
            class="${
                'dialog dialog-narrow hidden'
            }"
            role="dialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="dialog-title">
                    Send Back for Revision
                </h3>
                <p class="${
                    'dialog-description'
                }">
                    Provide feedback to help
                    the submitter improve their
                    idea.
                </p>
            </div>
            <div class="py-4">
                <textarea
                    class="${
                        'textarea resize-none'
                    }"
                    id="${
                        'approval-send-back'
                        + '-feedback'
                    }"
                    placeholder="${
                        'Explain what changes'
                        + ' or additional'
                        + ' information is'
                        + ' needed...'
                    }"
                    rows="4">
                </textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="btn btn-outline"
                    id="${
                        'approval-send-back'
                        + '-cancel'
                    }"
                    data-dialog-cancel="${
                        'approval-send-back'
                    }">
                    Cancel
                </button>
                <button
                    class="${
                        'btn btn-destructive'
                    }"
                    id="${
                        'approval-send-back'
                        + '-confirm'
                    }"
                    data-idea-action="${
                        'send-back-confirm'
                    }">
                    Send Back
                </button>
            </div>
        </div>`;
    }
}

export class IdeaListPresenter {
    #ideas: IdeaPresenter[];
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
    }

    update(ideas: Idea[]): void {
        this.#ideas = ideas.map(
            i => new IdeaPresenter(i),
        );
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

    renderBadges(
        container: HTMLElement,
    ): void {
        setHtml(
            container, this.#buildBadges(),
        );
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, this.#buildList());
    }

    #buildBadges(): SafeHtml {
        const active = this.activeFilter();
        const groups = Object.groupBy(
            this.#ideas,
            i => i.statusGroup(),
        );
        const order: IdeaStatus[] = [
            'active', 'in-review',
            'sent-back', 'approved',
        ];
        const badges = orderedKeys(
            groups, order,
        )
            .map(s => ({
                status: s,
                items: groups[s],
            }))
            .filter(
                g => g.items
                    && g.items.length > 0,
            )
            .map(g => g.items![0]!
                .buildStatusBadge(
                    active === null
                        ? null
                        : g.status === active,
                ));
        return html`${badges}`;
    }

    #buildList(): SafeHtml {
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
