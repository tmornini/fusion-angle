import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { mutateSlot } from '../dom.ts';
import {
    toggleStatusFilter,
} from './list-filter.ts';
import { stateBadge } from './state-badge.ts';
import {
    buildStateFilterBadges,
    filteredSortedList,
} from './list-choreography.ts';
import {
    displayText, formatDateTime,
} from '../core.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    type IconSize,
    ICON_SIZE,
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
} from '../icons.ts';
import type {
    Idea,
    IdeaState,
    IdeaEntity,
    IdeaWithSubmitter,
} from '../adapters/index.ts';
import {
    IDEA_STATE_CONFIG,
} from './state-display.ts';

const STATE_ICONS: Record<
    IdeaState,
    (
        size: IconSize,
        cssClass: string,
    ) => SafeHtml
> = {
    'active': iconLightbulb,
    'in_review': iconClipboardCheck,
    'approved': iconCheckCircle2,
    'promoted': iconTrendingUp,
    'sent_back': iconArrowLeft,
    'archived': iconClock,
    'deleted': iconXCircle,
};

function buildReadinessPill(idea: Idea): SafeHtml {
    if (
        idea.stateValue() !== 'active'
        || idea.isReady()
    ) {
        return html``;
    }
    return html`<span class="pill"
        data-tone="warning">Incomplete</span>`;
}

export interface IdeaDraftFields {
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

export function ideaDraftFromIdea(
    idea: Idea,
): IdeaDraftFields {
    return {
        title: idea.titleText(),
        problemStatement:
            idea.problemStatementText(),
        targetUsers:
            idea.targetUsersText(),
        proposedSolution:
            idea.proposedSolutionText(),
        expectedOutcome:
            idea.expectedOutcomeText(),
        successMetrics:
            idea.successMetricsText(),
    };
}

export function ideaPatchFromDraft(
    draft: IdeaDraftFields,
): IdeaEntityPatch {
    return {
        title: draft.title,
        problem_statement:
            draft.problemStatement,
        target_users:
            draft.targetUsers,
        proposed_solution:
            draft.proposedSolution,
        expected_outcome:
            draft.expectedOutcome,
        success_metrics:
            draft.successMetrics,
    };
}

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="idea-detail-host">
    <div class="entity">
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
                    ${iconArrowLeft(ICON_SIZE.xl, '')}
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
    <div class="idea-dialogs-slot"></div>
</div>`);
}

function buildSubmittedByLine(
    submitterName: string,
    submittedAt: string,
): SafeHtml {
    return html`
        <p class="${
            'text-sm text-muted'
        }">
            Submitted by
            ${displayText(submitterName)}
            @ ${formatDateTime(submittedAt)}
        </p>`;
}

function buildReadonlyTitleSection(
    idea: Idea,
    submitterName: string,
    submittedAt: string,
): SafeHtml {
    const cfg = IDEA_STATE_CONFIG[idea.stateValue()];
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl'
                + ' font-display'
                + ' font-bold'
            }">
                ${idea.titleText()}
            </h1>
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs'
            }">
                ${cfg.label}
            </span>
            ${buildReadinessPill(idea)}
        </div>
        ${buildSubmittedByLine(
            submitterName, submittedAt,
        )}`;
}

function buildEditableTitleSection(
    idea: Idea,
    draft: IdeaDraftFields,
    submitterName: string,
    submittedAt: string,
): SafeHtml {
    const cfg = IDEA_STATE_CONFIG[idea.stateValue()];
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <input
                class="${
                    'input idea-edit-title'
                }"
                id="idea-edit-title"
                data-idea-field="title"
                value="${draft.title}" />
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs'
            }">
                ${cfg.label}
            </span>
            ${buildReadinessPill(idea)}
        </div>
        ${buildSubmittedByLine(
            submitterName, submittedAt,
        )}`;
}

function buildReadonlyInput(
    label: string,
    savedValue: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'text-xs text-muted mb-1'
            }">${label}</p>
            <p class="text-sm">
                ${displayText(savedValue)}
            </p>
        </div>`;
}

function buildEditableInput(
    id: string,
    field: IdeaFieldKey,
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'text-xs text-muted mb-1'
            }">${label}</p>
            <input class="input"
                id="${id}"
                data-idea-field="${field}"
                value="${value}" />
        </div>`;
}

function buildReadonlyTextarea(
    label: string,
    savedValue: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'text-xs text-muted mb-1'
            }">${label}</p>
            <p class="text-sm">
                ${displayText(savedValue)}
            </p>
        </div>`;
}

function buildEditableTextarea(
    id: string,
    field: IdeaFieldKey,
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'text-xs text-muted mb-1'
            }">${label}</p>
            <textarea
                class="${
                    'textarea resize-none'
                }"
                id="${id}"
                data-idea-field="${field}"
                rows="3"
                >${value}</textarea>
        </div>`;
}

function buildSubmitConvertButtons(
    idea: Idea,
): SafeHtml {
    const canSubmit =
        idea.canBeSubmittedForReview();
    return html`
        ${canSubmit
            ? html`<button
                class="${
                    'btn btn-primary'
                    + ' btn-sm gap-2'
                }"
                id="idea-submit-review-btn"
                data-idea-action="${
                    'submit-review'
                }">
                ${iconClipboardCheck(ICON_SIZE.base, '')}
                Submit for Review
            </button>` : html``}
        ${idea.isConvertible()
            ? html`<button
                class="${
                    'btn btn-primary'
                    + ' btn-sm gap-2'
                }"
                id="idea-convert-btn"
                data-idea-action="convert">
                ${iconArrowRight(ICON_SIZE.base, '')}
                Convert
            </button>` : html``}`;
}

function buildApprovalButtons(): SafeHtml {
    return html`
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
            ${iconXCircle(ICON_SIZE.base, '')}
            Send Back
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
            ${iconCheckCircle(ICON_SIZE.base, '')}
            Approve
        </button>`;
}

function buildApprovalDialogs(): SafeHtml {
    return html`
    <dialog
        id="approval-send-back-dialog"
        class="${
            'dialog dialog-narrow'
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
    </dialog>`;
}

function buildProblemSolutionReadonlyCard(
    idea: Idea,
): SafeHtml {
    return html`
<div class="card p-6">
    <h2 class="${
        'text-lg font-display'
        + ' font-semibold mb-4'
    }">
        Problem &amp; Solution
    </h2>
    <div class="flex flex-col gap-5">
        ${buildReadonlyTextarea(
            'Problem Statement',
            idea.problemStatementText(),
        )}
        ${buildReadonlyInput(
            'Target Users',
            idea.targetUsersText(),
        )}
        ${buildReadonlyTextarea(
            'Proposed Solution',
            idea.proposedSolutionText(),
        )}
        ${buildReadonlyTextarea(
            'Expected Outcome',
            idea.expectedOutcomeText(),
        )}
        ${buildReadonlyTextarea(
            'Success Metrics',
            idea.successMetricsText(),
        )}
    </div>
</div>`;
}

function buildProblemSolutionEditableCard(
    draft: IdeaDraftFields,
): SafeHtml {
    return html`
<div class="card p-6">
    <h2 class="${
        'text-lg font-display'
        + ' font-semibold mb-4'
    }">
        Problem &amp; Solution
    </h2>
    <div class="flex flex-col gap-5">
        ${buildEditableTextarea(
            'idea-edit-problem',
            'problemStatement',
            'Problem Statement',
            draft.problemStatement,
        )}
        ${buildEditableInput(
            'idea-edit-target',
            'targetUsers',
            'Target Users',
            draft.targetUsers,
        )}
        ${buildEditableTextarea(
            'idea-edit-solution',
            'proposedSolution',
            'Proposed Solution',
            draft.proposedSolution,
        )}
        ${buildEditableTextarea(
            'idea-edit-outcome',
            'expectedOutcome',
            'Expected Outcome',
            draft.expectedOutcome,
        )}
        ${buildEditableTextarea(
            'idea-edit-metrics',
            'successMetrics',
            'Success Metrics',
            draft.successMetrics,
        )}
    </div>
</div>`;
}

export class IdeaPresenter {
    readonly #idea: Idea;
    readonly #submitterName: string;
    readonly #submittedAt: string;

    constructor(
        idea: Idea,
        submitterName: string,
        submittedAt: string,
    ) {
        this.#idea = idea;
        this.#submitterName = submitterName;
        this.#submittedAt = submittedAt;
    }

    submitterName(): string {
        return this.#submitterName;
    }

    submittedAt(): string {
        return this.#submittedAt;
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
        return this.#idea
            .canBeSubmittedForReview();
    }

    positionSortKey(): number {
        return this.#idea.positionSortKey();
    }

    stateGroup(): IdeaState {
        return this.#idea.stateValue();
    }

    matchesState(
        state: IdeaState,
    ): boolean {
        return this.stateGroup() === state;
    }

    buildStateBadge(
        isActive: boolean | null,
    ): SafeHtml {
        const s = this.#idea.stateValue();
        return stateBadge(
            s, IDEA_STATE_CONFIG[s]!,
            STATE_ICONS[s]!, isActive,
        );
    }

    buildCard(
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
            ${showGrip ? html`<button
                type="button"
                class="${
                    'hidden-mobile text-muted'
                    + ' drag-handle'
                }"
                aria-label="${
                    'Reorder '
                    + this.#idea.titleText()
                }">${
                iconGripVertical(ICON_SIZE.xl, '')
            }</button>` : html``}
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
        const cfg = IDEA_STATE_CONFIG[
            this.#idea.stateValue()
        ];
        return html`
        <h3 class="${
            'font-display'
            + ' font-semibold'
            + ' truncate'
        }">
            <a href="${
                buildPageUrl(
                    'idea-detail',
                    {
                        ideaId: this.#idea
                            .idForLink(),
                    },
                )
            }">${this.#idea.titleText()}</a>
        </h3>
        <div class="${
            'flex items-center gap-2 mt-1'
        }">
            <span class="${
                'badge '
                + cfg.className
                + ' text-xs badge-fixed-w'
            }">${
                STATE_ICONS[
                    this.#idea.stateValue()
                ]!(14, '')
            } ${cfg.label}</span>
            ${buildReadinessPill(this.#idea)}
        </div>`;
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
                ${iconArrowRight(ICON_SIZE.base, '')}
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
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.idea-title-slot',
            buildReadonlyTitleSection(
                this.#idea,
                this.#submitterName,
                this.#submittedAt,
            ),
        );
        mutateSlot(
            container,
            '.idea-actions-slot',
            this.#buildActionButtons(),
        );
        mutateSlot(
            container,
            '.idea-cards-slot',
            buildProblemSolutionReadonlyCard(
                this.#idea,
            ),
        );
        mutateSlot(
            container,
            '.idea-dialogs-slot',
            this.#idea.isReviewable()
                ? buildApprovalDialogs()
                : html``,
        );
    }

    #buildActionButtons(): SafeHtml {
        return html`
            ${buildSubmitConvertButtons(
                this.#idea,
            )}
            ${this.#idea.isReviewable()
                ? buildApprovalButtons()
                : html``}
            <button
                class="${
                    'btn btn-outline gap-2'
                }"
                id="idea-edit-btn"
                data-idea-action="edit">
                ${iconEdit(ICON_SIZE.base, '')} Edit
            </button>`;
    }
}

export class IdeaEditPresenter {
    readonly #idea: Idea;
    readonly #draft: IdeaDraftFields;
    readonly #submitterName: string;
    readonly #submittedAt: string;

    constructor(
        idea: Idea,
        draft: IdeaDraftFields,
        submitterName: string,
        submittedAt: string,
    ) {
        this.#idea = idea;
        this.#draft = draft;
        this.#submitterName = submitterName;
        this.#submittedAt = submittedAt;
    }

    idForLink(): string {
        return this.#idea.idForLink();
    }

    draft(): IdeaDraftFields {
        return this.#draft;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.idea-title-slot',
            buildEditableTitleSection(
                this.#idea, this.#draft,
                this.#submitterName,
                this.#submittedAt,
            ),
        );
        mutateSlot(
            container,
            '.idea-actions-slot',
            this.#buildActionButtons(),
        );
        mutateSlot(
            container,
            '.idea-cards-slot',
            buildProblemSolutionEditableCard(
                this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.idea-dialogs-slot',
            this.#idea.isReviewable()
                ? buildApprovalDialogs()
                : html``,
        );
    }

    #buildActionButtons(): SafeHtml {
        return html`
            <div class="flex gap-2">
                <button
                    class="${
                        'btn btn-outline gap-2'
                    }"
                    id="idea-cancel-btn"
                    data-idea-action="cancel">
                    ${iconX(ICON_SIZE.base, '')} Cancel
                </button>
                <button
                    class="${
                        'btn btn-primary gap-2'
                    }"
                    id="idea-save-btn"
                    data-idea-action="save">
                    ${iconSave(ICON_SIZE.base, '')} Save
                </button>
            </div>`;
    }
}

export type IdeaListFilter =
    | { kind: 'all' }
    | { kind: 'filtered'; status: IdeaState };

export type IdeaListState = {
    ideas: IdeaWithSubmitter[];
    filter: IdeaListFilter;
};

export function buildInitialIdeaListState(
    ideas: IdeaWithSubmitter[],
): IdeaListState {
    return { ideas, filter: { kind: 'all' } };
}

export function applyIdeaListUpdate(
    state: IdeaListState,
    ideas: IdeaWithSubmitter[],
): IdeaListState {
    return { ...state, ideas };
}

export function applyIdeaFilterToggle(
    listState: IdeaListState,
    ideaState: IdeaState,
): IdeaListState {
    const next: IdeaListFilter =
        toggleStatusFilter(
            listState.filter, ideaState,
        );
    return { ...listState, filter: next };
}

export class IdeaListPresenter {
    #ideas: IdeaPresenter[];
    #filter: IdeaListFilter;

    constructor(state: IdeaListState) {
        this.#ideas = state.ideas.map(
            t => new IdeaPresenter(
                t.idea,
                t.submitterName,
                t.submittedAt,
            ),
        );
        this.#filter = state.filter;
    }

    activeFilter():
        IdeaState | null {
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
        return buildStateFilterBadges(
            this.#ideas,
            i => i.stateGroup(),
            ['active', 'in_review', 'sent_back', 'approved'],
            this.activeFilter(),
            (item, isActive) =>
                item.buildStateBadge(isActive),
        );
    }

    #buildList(): SafeHtml {
        const hasGrip = this.#filter.kind === 'all';
        return filteredSortedList(
            this.#ideas,
            this.#filter,
            (i, status) => i.matchesState(status),
            items => items.toSorted(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            ),
            idea => idea.buildCard(hasGrip),
        );
    }
}
