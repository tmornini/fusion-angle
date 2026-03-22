import {
    $, $input, $textarea,
} from '../app/dom';
import {
    html, setHtml, SafeHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import {
    iconArrowLeft, iconAlertTriangle,
    iconTrendingUp, iconClock, iconUser,
    iconCalendar, iconTarget, iconLightbulb,
    iconCheckCircle, iconXCircle,
    iconMessageSquare, iconFileText,
    iconDollarSign, iconUsers, iconShield,
    iconGauge, iconEdit, iconSave, iconX,
} from '../app/icons';
import {
    navigateTo, initDialog, closeDialog,
    displayText,
} from '../app/core';
import {
    getIdeaForApproval,
    getEdgeForApproval,
    getIdea,
    putIdea,
    Idea,
    type EdgeData,
    type Metric,
} from '../app/adapters';

const severityConfig:
    Record<string, string> = {
        high: 'badge-error',
        medium: 'badge-warning',
        low: 'badge-default',
    };

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.['id'];
    if (!id) {
        navigateTo('idea-review-queue');
        return;
    }

    const state = {
        isEditingIdea: false,
    };

    function buildApprovalPage(
        idea: Idea,
        edge: EdgeData | null,
    ): SafeHtml {
        return html`
    <div>
        <header style=${'position:sticky;'
            + 'top:0;z-index:10;'
            + 'background:'
            + 'hsl(var(--background)/0.95);'
            + 'backdrop-filter:blur(8px);'
            + 'border-bottom:'
            + '1px solid hsl(var(--border))'}>
            <div style=${'max-width:60rem;'
                + 'margin:0 auto;'
                + 'padding:0 1.5rem'}>
                <div
                    class="flex items-center
                        justify-between"
                    style=${'height:4rem;'
                        + 'gap:0.5rem'}>
                    <div
                        class="flex items-center
                            gap-4"
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
                        <div style="${
                            'min-width:0'
                        }">
                            <p class="text-xs
                                text-muted">
                                Reviewing Idea
                            </p>
                            ${state.isEditingIdea
                                ? html`<input
                                    class="input"
                                    id="${
                                        'approval'
                                        + '-edit'
                                        + '-title'
                                    }"
                                    value="${
                                        idea.title
                                    }"
                                    style=${
                                        'font-size:'
                                        + '1.125rem;'
                                        + 'font-'
                                        + 'weight:'
                                        + '700'
                                    } />`
                                : html`<h1
                                    class="${
                                        'text-lg'
                                        + ' font-bold'
                                        + ' truncate'
                                    }">
                                    ${idea.title}
                                </h1>`}
                        </div>
                    </div>
                    <div
                        class="flex items-center
                            gap-2"
                        style="flex-shrink:0">
                        ${state.isEditingIdea
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
                        </button>
                        <span
                            class="badge
                                badge-error
                                text-xs">
                            ${idea.priorityLevel()}
                        </span>`}
                    </div>
                </div>
            </div>
        </header>

        <main style=${'max-width:60rem;'
            + 'margin:0 auto;'
            + 'padding:1.5rem;'
            + 'padding-bottom:10rem'}>
            <div class="flex flex-wrap
                items-center gap-4
                text-sm text-muted mb-6">
                <span
                    class="flex items-center
                        gap-1">
                    ${iconUser(16, '')}
                    <span
                        class="font-medium"
                        style=${'color:'
                            + 'hsl(var('
                            + '--foreground))'}>
                        ${displayText(
                            idea.submittedBy,
                        )}
                    </span>
                </span>
                <span
                    class="flex items-center
                        gap-1">
                    ${iconCalendar(16, '')}
                    ${idea.submittedAt}
                </span>
                <span
                    class="flex items-center
                        gap-1">
                    ${iconTarget(16, '')}
                    ${idea.category}
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
                    ${iconMessageSquare(16, '')}
                    7 comments
                </span>
            </div>

            <div class="card p-6 mb-6"
                style=${'background:'
                    + 'linear-gradient('
                    + 'to right,'
                    + 'hsl(var(--primary)'
                    + '/0.05),'
                    + 'hsl(var(--primary)'
                    + '/0.1));'
                    + 'border-color:'
                    + 'hsl(var(--primary)'
                    + '/0.2)'}>
                <div class="flex items-center
                    justify-between gap-4">
                    <div>
                        <p class="${
                            'text-sm text-muted'
                            + ' mb-1'
                        }">
                            Innovation Score
                        </p>
                        <div class="flex
                            items-baseline
                            gap-2">
                            <span class="${
                                'text-4xl'
                                + ' font-bold'
                                + ' text-primary'
                            }">
                                ${idea.score}
                            </span>
                            <span class="${
                                'text-muted'
                            }">
                                /100
                            </span>
                        </div>
                    </div>
                    <div style=${'display:grid;'
                        + 'grid-template-columns:'
                        + 'repeat(3,1fr);'
                        + 'gap:2rem;'
                        + 'text-align:center'}>
                        <div>
                            <p class="${
                                'text-sm'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                Impact
                            </p>
                            <p class="${
                                'text-xl'
                                + ' font-semibold'
                            }">
                                ${idea
                                    .impactLabel}
                            </p>
                        </div>
                        <div>
                            <p class="${
                                'text-sm'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                Effort
                            </p>
                            <p class="${
                                'text-xl'
                                + ' font-semibold'
                            }">
                                ${idea
                                    .effortLabel}
                            </p>
                        </div>
                        <div>
                            <p class="${
                                'text-sm'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                Timeline
                            </p>
                            <p class="${
                                'text-xl'
                                + ' font-semibold'
                            }">
                                ${idea
                                    .effortDurationEstimate}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center gap-2'
                }">
                    ${iconLightbulb(
                        20,
                        'text-primary',
                    )}
                    Idea Overview
                </h3>
                ${state.isEditingIdea
                    ? html`<textarea
                        class="textarea"
                        id=${'approval-edit'
                            + '-description'}
                        rows="4"
                        style="resize:none">${
                            idea.description
                        }</textarea>`
                    : html`<p class="${
                        'text-sm'
                        + ' leading-relaxed'
                    }">${
                        idea.description
                    }</p>`}
            </div>

            <div class="detail-grid mb-6"
                style=${'grid-template-'
                    + 'columns:'
                    + '1fr 1fr'}>
                <div class="card p-6">
                    <h3 class="${
                        'font-semibold mb-3'
                        + ' flex items-center'
                        + ' gap-2'
                    }">
                        ${iconTrendingUp(20, '')}
                        Expected Impact
                    </h3>
                    <p class="text-sm">${
                        idea.description
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
                    <div style=${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }>
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
                                idea
                                    .effortDurationEstimate
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
                                idea
                                    .effortTeamSize
                            }</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center gap-2'
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
                    idea.costEstimate
                }</p>
                <p class="${
                    'text-sm text-muted'
                }">${
                    idea.costBreakdown
                }</p>
            </div>

            ${edge ? html`
            <div class="card p-6 mb-6"
                style=${'background:'
                    + 'linear-gradient('
                    + 'to right,'
                    + 'hsl(var(--primary)'
                    + '/0.05),'
                    + 'hsl(var(--primary)'
                    + '/0.1));'
                    + 'border-color:'
                    + 'hsl(var(--primary)'
                    + '/0.2)'}>
                <div class="flex items-center
                    justify-between mb-4">
                    <h3 class="${
                        'font-semibold flex'
                        + ' items-center gap-2'
                    }">
                        ${iconTarget(
                            20,
                            'text-primary',
                        )}
                        ${'Edge: Business'
                            + ' Outcomes'}
                        &amp; Success Criteria
                    </h3>
                    <span class="${
                        'badge'
                        + ' badge-success'
                        + ' text-xs'
                    }">
                        ${iconShield(12, '')}
                        High Confidence
                    </span>
                </div>
                ${edge.outcomes.map((
                    outcome:
                        EdgeData[
                            'outcomes'
                        ][number],
                    outcomeIndex: number,
                ) => html`
                <div
                    class="p-4 rounded-lg mb-3"
                    style=${'background:'
                        + 'hsl(var('
                        + '--background));'
                        + 'border:1px solid'
                        + ' hsl(var(--border))'}>
                    <div class="flex
                        items-start gap-2 mb-3">
                        <div style=${
                            'width:'
                            + '1.25rem;'
                            + 'height:1.25rem;'
                            + 'border-radius:'
                            + '9999px;'
                            + 'background:'
                            + 'hsl(var('
                            + '--primary)/0.1);'
                            + 'display:flex;'
                            + 'align-items:'
                            + 'center;'
                            + 'justify-content:'
                            + 'center;'
                            + 'font-size:'
                            + '0.75rem;'
                            + 'font-weight:700;'
                            + 'color:'
                            + 'hsl(var('
                            + '--primary));'
                            + 'flex-shrink:0'
                        }>${
                            outcomeIndex + 1
                        }</div>
                        <p class="${
                            'font-medium'
                            + ' text-sm'
                        }">${
                            outcome.description
                        }</p>
                    </div>
                    <div
                        style=${'padding-left:'
                            + '1.75rem'}
                        class="${
                            'flex flex-wrap'
                            + ' gap-2'
                        }">
                        ${outcome.metrics.map((
                            metric:
                                Metric,
                        ) => html`
                        <span
                            class="${
                                'flex'
                                + ' items-center'
                                + ' gap-2 text-sm'
                            }"
                            style=${
                                'padding:'
                                + '0.375rem'
                                + ' 0.75rem;'
                                + 'border-radius:'
                                + '9999px;'
                                + 'background:'
                                + 'hsl(var('
                                + '--muted)/0.5);'
                                + 'border:'
                                + '1px solid'
                                + ' hsl(var('
                                + '--border))'
                            }>
                            ${iconGauge(
                                14,
                                'text-primary',
                            )}
                            ${metric.name}:
                            <span
                                class="${
                                    'font-'
                                    + 'semibold'
                                    + ' text-'
                                    + 'primary'
                                }">${
                                metric.target
                            }${metric.unit
                            }</span>
                        </span>`)}
                    </div>
                </div>`)}
                <div style=${'display:grid;'
                    + 'grid-template-columns:'
                    + 'repeat(3,1fr);'
                    + 'gap:0.75rem;'
                    + 'margin-top:0.5rem'}>
                    <div
                        class="p-3 rounded-lg"
                        style=${'background:'
                            + 'hsl(var('
                            + '--success-soft));'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--success)/0.2)'}>
                        <div class="flex
                            items-center
                            gap-1 mb-2">
                            <span
                                class="${
                                    'text-xs'
                                    + ' font-'
                                    + 'medium'
                                }"
                                style=${'color:'
                                    + 'hsl(var('
                                    + '--success'
                                    + '))'}>
                                ${iconClock(14, '')}
                                ${'Short-term'
                                    + ' (0-3mo)'}
                            </span>
                        </div>
                        <p class="text-xs">${
                            edge.impact.shortTerm
                        }</p>
                    </div>
                    <div
                        class="p-3 rounded-lg"
                        style=${'background:'
                            + 'hsl(var('
                            + '--warning-soft));'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--warning)/0.2)'}>
                        <div class="flex
                            items-center
                            gap-1 mb-2">
                            <span
                                class="${
                                    'text-xs'
                                    + ' font-'
                                    + 'medium'
                                }"
                                style=${'color:'
                                    + 'hsl(var('
                                    + '--warning'
                                    + '))'}>
                                ${iconClock(14, '')}
                                ${'Mid-term'
                                    + ' (3-12mo)'}
                            </span>
                        </div>
                        <p class="text-xs">${
                            edge.impact.midTerm
                        }</p>
                    </div>
                    <div
                        class="p-3 rounded-lg"
                        style=${'background:'
                            + 'hsl(var('
                            + '--info-soft));'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--primary)/0.2)'}>
                        <div class="flex
                            items-center
                            gap-1 mb-2">
                            <span
                                class="${
                                    'text-xs'
                                    + ' font-'
                                    + 'medium'
                                    + ' text-'
                                    + 'primary'
                                }">
                                ${iconClock(14, '')}
                                ${'Long-term'
                                    + ' (12+mo)'}
                            </span>
                        </div>
                        <p class="text-xs">${
                            edge.impact.longTerm
                        }</p>
                    </div>
                </div>
                <div
                    class="flex items-center
                        justify-between
                        mt-3 pt-3"
                    style=${'border-top:'
                        + '1px solid'
                        + ' hsl(var(--border))'}>
                    <span class="text-xs
                        text-muted">
                        Edge Owner
                    </span>
                    <span class="text-sm
                        font-medium">${
                        edge.owner
                    }</span>
                </div>
            </div>
            ` : html``}

            ${idea.parsedRisks().length
                ? html`
            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-4'
                    + ' flex items-center gap-2'
                }">
                    ${iconAlertTriangle(20, '')}
                    Identified Risks
                </h3>
                <div style=${'display:flex;'
                    + 'flex-direction:column;'
                    + 'gap:0.75rem'}>
                    ${idea.parsedRisks().map((
                        risk:
                            { title: string;
                                severity: string;
                                mitigation: string },
                    ) => html`
                    <div
                        class="p-4 rounded-lg"
                        style=${'background:'
                            + 'hsl(var('
                            + '--muted)/0.3);'
                            + 'border:1px solid'
                            + ' hsl(var('
                            + '--border))'}>
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
                                + (severityConfig[
                                    risk.severity
                                ] ?? '')
                                + ' text-xs'
                            }">${
                                risk.severity
                            }</span>
                        </div>
                        <p class="text-xs
                            text-muted">
                            <span
                                class="${
                                    'font-medium'
                                }">
                                Mitigation:
                            </span>
                            ${risk.mitigation}
                        </p>
                    </div>`)}
                </div>
            </div>`
                : html``}

            ${idea.parsedAssumptions().length
                ? html`
            <div class="card p-6 mb-6">
                <h3 class="font-semibold mb-3">
                    Key Assumptions
                </h3>
                <ul style=${'display:flex;'
                    + 'flex-direction:column;'
                    + 'gap:0.5rem'}>
                    ${idea.parsedAssumptions().map((
                        assumption: string,
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
            </div>`
                : html``}

            ${idea.parsedAlignments().length
                ? html`
            <div class="card p-6 mb-6">
                <h3 class="${
                    'font-semibold mb-3'
                    + ' flex items-center gap-2'
                }">
                    ${iconUsers(
                        20,
                        'text-primary',
                    )}
                    Strategic Alignment
                </h3>
                <div class="flex flex-wrap
                    gap-2">
                    ${idea.parsedAlignments().map((
                        alignment: string,
                    ) => html`
                    <span class="${
                        'badge'
                        + ' badge-primary'
                        + ' text-xs'
                    }">${
                        alignment
                    }</span>`)}
                </div>
            </div>`
                : html``}
        </main>

        <div class="action-footer">
            <div class="action-footer-inner">
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
                        ${iconMessageSquare(16, '')}
                        <span class="${
                            'hidden-mobile'
                        }">
                            ${'Request'
                                + ' Clarification'}
                        </span>
                        <span
                            class="${
                                'visible-mobile'
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
                                'approval-reject'
                                + '-btn'
                            }">
                            ${iconXCircle(16, '')}
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
                                'btn btn-success'
                                + ' gap-2'
                            }"
                            id=${'approval'
                                + '-approve-btn'}>
                            ${iconCheckCircle(16, '')}
                            Approve
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div
            id="${
                'approval-reject-backdrop'
            }"
            class="${
                'dialog-backdrop hidden'
            }">
        </div>
        <div
            id="approval-reject-dialog"
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
                    ${'Provide feedback to'
                        + ' help the'
                        + ' submitter improve'
                        + ' their idea.'}
                </p>
            </div>
            <div class="py-4">
                <textarea
                    class="${
                        'textarea resize-none'
                    }"
                    id=${'approval'
                        + '-reject-feedback'}
                    placeholder=${
                        'Explain what'
                        + ' changes or'
                        + ' additional'
                        + ' information is'
                        + ' needed...'
                    }
                    rows="4">
                </textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="btn btn-outline"
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
                'approval-clarify-backdrop'
            }"
            class="${
                'dialog-backdrop hidden'
            }">
        </div>
        <div
            id="${
                'approval-clarify-dialog'
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
                    ${'Ask the submitter for'
                        + ' additional details'
                        + ' before'
                        + ' making a decision.'}
                </p>
            </div>
            <div class="py-4">
                <textarea
                    class="${
                        'textarea resize-none'
                    }"
                    id=${'approval'
                        + '-clarify-feedback'}
                    placeholder=${
                        'What additional'
                        + ' information do'
                        + ' you'
                        + ' need?'
                    }
                    rows="4">
                </textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="btn btn-outline"
                    id="${
                        'approval-clarify'
                        + '-cancel'
                    }">
                    Cancel
                </button>
                <button
                    class="btn btn-primary"
                    id=${'approval'
                        + '-clarify-confirm'}>
                    Send Request
                </button>
            </div>
        </div>
    </div>`;
    }

    function bindApprovalEvents(
        idea: Idea,
        edge: EdgeData | null,
        id: string,
    ): void {
        $('#approval-approve-btn', document)
            ?.addEventListener(
                'click',
                async () => {
                    const existingIdea =
                        await getIdea(id);
                    await putIdea(id, {
                        ...existingIdea,
                        status: 'approved',
                    });
                    showToast(
                        'Idea approved'
                        + ' successfully',
                        'success',
                    );
                    navigateTo(
                        'idea-review-queue',
                    );
                },
            );

        $('#approval-back-btn', document)
            ?.addEventListener(
                'click',
                () => navigateTo(
                    'idea-review-queue',
                ),
            );

        $('#approval-edit-btn', document)
            ?.addEventListener(
                'click',
                () => {
                    state.isEditingIdea
                        = true;
                    mutateApprovalPage(
                        idea,
                        edge,
                        id,
                    );
                },
            );

        $('#approval-cancel-edit-btn', document)
            ?.addEventListener(
                'click',
                () => {
                    state.isEditingIdea
                        = false;
                    mutateApprovalPage(
                        idea,
                        edge,
                        id,
                    );
                },
            );

        $('#approval-save-edit-btn', document)
            ?.addEventListener(
                'click',
                async () => {
                    const title =
                        $input(
                            '#approval-edit'
                            + '-title',
                            document,
                        )!.value;
                    const description =
                        $textarea(
                            '#approval-edit'
                            + '-description',
                            document,
                        )!.value;
                    try {
                        const existing =
                            await getIdea(
                                id,
                            );
                        await putIdea(id, {
                            ...existing,
                            title,
                            description,
                        });
                        showToast(
                            'Idea saved',
                            'success',
                        );
                        const [
                            updatedIdea,
                            updatedEdge,
                        ] = await Promise
                            .all([
                            getIdeaForApproval(
                                id,
                            ),
                            getEdgeForApproval(
                                id,
                            ),
                        ]);
                        state.isEditingIdea
                            = false;
                        mutateApprovalPage(
                            updatedIdea,
                            updatedEdge,
                            id,
                        );
                    } catch {
                        showToast(
                            'Failed to'
                            + ' save idea',
                            'error',
                        );
                    }
                },
            );

        initDialog('approval-reject', {
            openBtnId:
                'approval-reject-btn',
        });
        $('#approval-reject-confirm', document)
            ?.addEventListener(
                'click',
                async () => {
                    const existingIdea =
                        await getIdea(id);
                    await putIdea(id, {
                        ...existingIdea,
                        status: 'archived',
                    });
                    showToast(
                        'Idea sent back'
                        + ' for revision',
                        'info',
                    );
                    closeDialog(
                        'approval-reject',
                    );
                    navigateTo(
                        'idea-review-queue',
                    );
                },
            );

        initDialog('approval-clarify', {
            openBtnId:
                'approval-clarify-btn',
        });
        $('#approval-clarify-confirm', document)
            ?.addEventListener(
                'click',
                () => {
                    showToast(
                        'Clarification'
                        + ' requested',
                        'info',
                    );
                    closeDialog(
                        'approval-clarify',
                    );
                },
            );

        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape') {
                    closeDialog(
                        'approval-reject',
                    );
                    closeDialog(
                        'approval-clarify',
                    );
                }
            },
        );
    }

    function mutateApprovalPage(
        idea: Idea,
        edge: EdgeData | null,
        id: string,
    ): void {
        const root = $('#wizard-root', document);
        if (!root) return;
        setHtml(
            root,
            buildApprovalPage(idea, edge),
        );
        bindApprovalEvents(
            idea,
            edge,
            id,
        );
    }

    const root = $('#wizard-root', document);
    if (!root) return;

    const result =
        await withLoadingState(
            root,
            buildSkeleton('detail', 4),
            () => Promise.all([
                getIdeaForApproval(id),
                getEdgeForApproval(id),
            ]),
            () => init(),
        );
    if (!result) return;
    const [idea, edge] = result;

    mutateApprovalPage(idea, edge, id);
}
