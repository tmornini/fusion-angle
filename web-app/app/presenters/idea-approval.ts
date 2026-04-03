import { html, SafeHtml } from '../safe-html';
import { displayText, formatDate } from '../core';
import {
    iconClock,
    iconDollarSign,
    iconTrendingUp,
    iconCheckCircle,
    iconXCircle,
    iconMessageSquare,
    iconAlertTriangle,
    iconArrowLeft,
    iconTarget,
    iconEdit,
    iconSave,
    iconX,
    iconCalendar,
    iconUsers,
    iconUser,
    iconLightbulb,
    iconFileText,
} from '../icons';
import type {
    Idea,
} from '../../../api/types';

type Severity =
    | 'high'
    | 'medium'
    | 'low';

const SEVERITY_CONFIG: Record<
    Severity,
    string
> = {
    high: 'badge-error',
    medium: 'badge-warning',
    low: 'badge-default',
};

type Risk = {
    title: string;
    severity: string;
    mitigation: string;
};

export class IdeaApprovalPresenter {
    #isEditing = false;
    readonly #title: string;
    readonly #submittedBy: string;
    readonly #submittedAt: string;
    readonly #category: string;
    readonly #description: string;
    readonly #expectedOutcome: string;
    readonly #impactLabel: string;
    readonly #effortLabel: string;
    readonly #effortDurationEstimate: string;
    readonly #effortTeamSize: string;
    readonly #costEstimate: string;
    readonly #costBreakdown: string;
    readonly #risks: readonly Risk[];
    readonly #assumptions:
        readonly string[];
    readonly #alignments:
        readonly string[];

    constructor(idea: Idea) {
        this.#title = idea.title;
        this.#submittedBy =
            idea.submittedBy;
        this.#submittedAt =
            idea.submittedAt;
        this.#category = idea.category;
        this.#description =
            idea.description;
        this.#expectedOutcome =
            idea.expectedOutcome;
        this.#impactLabel =
            idea.impactLabel;
        this.#effortLabel =
            idea.effortLabel;
        this.#effortDurationEstimate =
            idea.effortDurationEstimate;
        this.#effortTeamSize =
            idea.effortTeamSize;
        this.#costEstimate =
            idea.costEstimate;
        this.#costBreakdown =
            idea.costBreakdown;
        this.#risks =
            idea.parsedRisks();
        this.#assumptions =
            idea.parsedAssumptions();
        this.#alignments =
            idea.parsedAlignments();
    }

    setEditing(editing: boolean): void {
        this.#isEditing = editing;
    }

    buildApprovalPage(): SafeHtml {
        const isEditing = this.#isEditing;
        return html`
    <div class="${
        'flex items-center'
        + ' justify-between'
        + ' gap-4 mb-6'
    }">
        <div
            class="flex items-center gap-4"
            style="min-width:0">
            <button
                class="${
                    'btn btn-ghost'
                    + ' btn-icon'
                }"
                id="${
                    'approval-back'
                    + '-btn'
                }">
                ${iconArrowLeft(20, '')}
            </button>
            <div style="min-width:0">
                <p class="text-xs
                    text-muted">
                    Reviewing Idea
                </p>
                ${isEditing
                    ? html`<input
                        class="input"
                        id="${
                            'approval'
                            + '-edit'
                            + '-title'
                        }"
                        value="${
                            this.#title
                        }"
                        style="${
                            'font-size:'
                            + '1.125rem;'
                            + 'font-'
                            + 'weight:'
                            + '700'
                        }" />`
                    : html`<h1
                        class="${
                            'text-lg'
                            + ' font-bold'
                            + ' truncate'
                        }">
                        ${this.#title}
                    </h1>`}
            </div>
        </div>
        <div
            class="flex items-center
                gap-2"
            style="flex-shrink:0">
            ${isEditing
                ? html`
            <button
                class="${
                    'btn btn-outline'
                    + ' gap-2'
                }"
                id=${'approval'
                    + '-cancel'
                    + '-edit-btn'}>
                ${iconX(16, '')} Cancel
            </button>
            <button
                class="${
                    'btn btn-primary'
                    + ' gap-2'
                }"
                id=${'approval'
                    + '-save'
                    + '-edit-btn'}>
                ${iconSave(16, '')} Save
            </button>`
                : html`
            <button
                class="${
                    'btn btn-outline'
                    + ' gap-2'
                }"
                id="${
                    'approval'
                    + '-edit-btn'
                }">
                ${iconEdit(16, '')} Edit
            </button>`}
        </div>
    </div>

    <div style="padding-bottom:10rem">
        <div class="flex flex-wrap
                items-center gap-4
                text-sm text-muted mb-6">
                <span
                    class="flex items-center
                        gap-1">
                    ${iconUser(16, '')}
                    <span
                        class="font-medium"
                        style="${'color:'
                            + 'hsl(var('
                            + '--foreground))'
                        }">
                        ${displayText(
                            this.#submittedBy,
                        )}
                    </span>
                </span>
                <span
                    class="flex items-center
                        gap-1">
                    ${iconCalendar(16, '')}
                    ${formatDate(
                        this.#submittedAt,
                    )}
                </span>
                <span
                    class="flex items-center
                        gap-1">
                    ${iconTarget(16, '')}
                    ${this.#category}
                </span>
                <span
                    class="flex items-center
                        gap-1 hidden-mobile">
                    ${iconFileText(16, '')}
                    3 attachments
                </span>
                <span
                    class="flex items-center
                        gap-1 hidden-mobile">
                    ${iconMessageSquare(
                        16, '',
                    )}
                    7 comments
                </span>
            </div>

            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconLightbulb(
                        20,
                        'text-primary',
                    )}
                    Idea Overview
                </h3>
                ${isEditing
                    ? html`<textarea
                        class="textarea"
                        id=${'approval-edit'
                            + '-description'}
                        rows="4"
                        style="resize:none"
                        >${
                            this.#description
                        }</textarea>`
                    : html`<p class="${
                        'text-sm'
                        + ' leading-relaxed'
                    }">${
                        this.#description
                    }</p>`}
            </div>

            ${this
                .#buildApprovalImpactGrid()}

            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconDollarSign(
                        20,
                        'text-primary',
                    )}
                    Cost Estimate
                </h3>
                <p class="${
                    'text-2xl font-bold'
                    + ' mb-1'
                }">${
                    this.#costEstimate
                }</p>
                <p class="${
                    'text-sm text-muted'
                }">${
                    this.#costBreakdown
                }</p>
            </div>

            ${this.#buildApprovalRisks()}
            ${this
                .#buildApprovalAssumptions()}
            ${this
                .#buildApprovalAlignments()}
    </div>

        ${this.#buildApprovalFooter()}
        ${this.#buildApprovalDialogs()}`;
    }

    #buildApprovalImpactGrid(): SafeHtml {
        return html`
            <div class="detail-grid mb-6"
                style="${'grid-template-'
                    + 'columns:'
                    + '1fr 1fr'}">
                <div class="card p-6">
                    <h3 class="${
                        'font-semibold mb-3'
                        + ' flex items-center'
                        + ' gap-2'
                    }">
                        ${iconTrendingUp(
                            20, '',
                        )}
                        Expected Impact
                    </h3>
                    <p class="text-sm">${
                        this.#expectedOutcome
                    }</p>
                </div>
                <div class="card p-6">
                    <h3 class="${
                        'font-semibold mb-3'
                        + ' flex items-center'
                        + ' gap-2'
                    }">
                        ${iconClock(20, '')}
                        Effort Required
                    </h3>
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }">
                        <div
                            class="flex
                                justify-between">
                            <span class="${
                                'text-sm'
                                + ' text-muted'
                            }">
                                Timeline
                            </span>
                            <span class="${
                                'text-sm'
                                + ' font-medium'
                            }">${
                                this
                                    .#effortDurationEstimate
                            }</span>
                        </div>
                        <div
                            class="flex
                                justify-between">
                            <span class="${
                                'text-sm'
                                + ' text-muted'
                            }">
                                Team Size
                            </span>
                            <span class="${
                                'text-sm'
                                + ' font-medium'
                            }">${
                                this
                                    .#effortTeamSize
                            }</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    #buildApprovalRisks(): SafeHtml {
        if (!this.#risks.length) {
            return html``;
        }
        return html`
            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-4'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconAlertTriangle(
                        20, '',
                    )}
                    Identified Risks
                </h3>
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:0.75rem'
                }">
                    ${this.#risks
                        .map((
                        risk: Risk,
                    ) => {
                    const s = (
                        risk.severity
                    ) as Severity;
                    const sev =
                        SEVERITY_CONFIG[
                            s
                        ]!;
                    return html`
                    <div
                        class="${
                            'p-4 rounded-lg'
                        }"
                        style="${'background:'
                            + 'hsl(var('
                            + '--muted)'
                            + '/0.3);'
                            + 'border:'
                            + '1px solid'
                            + ' hsl(var('
                            + '--border))'}">
                        <div class="flex
                            items-center
                            justify-between
                            mb-2">
                            <h4 class="${
                                'font-medium'
                                + ' text-sm'
                            }">${
                                risk.title
                            }</h4>
                            <span class="${
                                'badge '
                                + sev
                                + ' text-xs'
                            }">${
                                risk.severity
                            }</span>
                        </div>
                        <p class="text-xs
                            text-muted">
                            <span
                                class="${
                                    'font-'
                                    + 'medium'
                                }">
                                Mitigation:
                            </span>
                            ${risk
                                .mitigation}
                        </p>
                    </div>`;
                    })}
                </div>
            </div>`;
    }

    #buildApprovalAssumptions(
    ): SafeHtml {
        if (
            !this.#assumptions.length
        ) {
            return html``;
        }
        return html`
            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                }">
                    Key Assumptions
                </h3>
                <ul style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:0.5rem'
                }">
                    ${this.#assumptions
                        .map((
                            assumption:
                                string,
                        ) => html`
                    <li class="${
                        'flex items-start'
                        + ' gap-2 text-sm'
                    }">
                        <span
                            class="text-primary
                                mt-1">
                            &#8226;
                        </span>
                        ${assumption}
                    </li>`)}
                </ul>
            </div>`;
    }

    #buildApprovalAlignments(
    ): SafeHtml {
        if (
            !this.#alignments.length
        ) {
            return html``;
        }
        return html`
            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconUsers(
                        20,
                        'text-primary',
                    )}
                    Strategic Alignment
                </h3>
                <div class="${
                    'flex flex-wrap'
                    + ' gap-2'
                }">
                    ${this.#alignments
                        .map((
                            alignment:
                                string,
                        ) => html`
                    <span class="${
                        'badge'
                        + ' badge-primary'
                        + ' text-xs'
                    }">${
                        alignment
                    }</span>`)}
                </div>
            </div>`;
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
                    class="btn btn-error"
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
}
