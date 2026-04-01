import {
    html, type SafeHtml, trusted,
} from '../safe-html';
import {
    iconTarget, iconTrendingUp,
    iconShield, iconPlus, iconTrash,
    iconCheck, iconAlertCircle,
    iconClock, iconUser, iconSave,
    iconArrowLeft,
} from '../icons';
import { displayText } from '../core';
import type {
    EdgeData,
} from '../adapters/helpers';
import type {
    Idea,
} from '../../../api/types';
import {
    isConfidenceLevel,
} from '../../../api/types';

const outcomeTemplates = [
    'Reduce operational cost',
    'Increase customer retention',
    'Improve delivery speed',
];

interface CompletionStatus {
    readonly hasOutcomes: boolean;
    readonly allOutcomesHaveMetrics: boolean;
    readonly hasImpact: boolean;
    readonly hasOwner: boolean;
    readonly hasConfidence: boolean;
    readonly completionPercent: number;
    readonly isComplete: boolean;
}

export class EdgeDetailPresenter {
    #edgeData: EdgeData;
    readonly #ideaTitle: string;
    readonly #ideaProblemStatement: string;
    readonly #ideaProposedSolution: string;
    readonly #ideaSubmittedBy: string;

    constructor(
        edgeData: EdgeData,
        idea: Idea,
    ) {
        this.#edgeData = edgeData;
        this.#ideaTitle = idea.title;
        this.#ideaProblemStatement =
            idea.problemStatement;
        this.#ideaProposedSolution =
            idea.proposedSolution;
        this.#ideaSubmittedBy =
            idea.submittedBy;
    }

    addOutcome(
        description = '',
    ): void {
        this.#edgeData = {
            ...this.#edgeData,
            outcomes: [
                ...this.#edgeData
                    .outcomes,
                {
                    id: crypto
                        .randomUUID(),
                    description,
                    metrics: [],
                },
            ],
        };
    }

    removeOutcome(
        outcomeId: string,
    ): void {
        this.#edgeData = {
            ...this.#edgeData,
            outcomes:
                this.#edgeData
                    .outcomes
                    .filter(
                        o => o.id
                            !== outcomeId,
                    ),
        };
    }

    addMetric(
        outcomeId: string,
    ): void {
        this.#edgeData = {
            ...this.#edgeData,
            outcomes:
                this.#edgeData
                    .outcomes
                    .map(
                        o => o.id
                            !== outcomeId
                            ? o
                            : {
                                ...o,
                                metrics: [
                                    ...o.metrics,
                                    {
                                        id: crypto
                                            .randomUUID(),
                                        name: '',
                                        target: '',
                                        unit: '',
                                        current: '',
                                    },
                                ],
                            },
                    ),
        };
    }

    removeMetric(
        outcomeId: string,
        metricId: string,
    ): void {
        this.#edgeData = {
            ...this.#edgeData,
            outcomes:
                this.#edgeData
                    .outcomes
                    .map(
                        o => o.id
                            !== outcomeId
                            ? o
                            : {
                                ...o,
                                metrics:
                                    o.metrics
                                        .filter(
                                            m =>
                                                m.id
                                                !== metricId,
                                        ),
                            },
                    ),
        };
    }

    syncFromForm(
        formData: {
            confidence:
                string | undefined;
            owner:
                string | undefined;
            shortTerm:
                string | undefined;
            midTerm:
                string | undefined;
            longTerm:
                string | undefined;
            outcomes:
                Array<{
                    id: string;
                    description: string;
                    metrics: Array<{
                        id: string;
                        name: string;
                        target: string;
                        unit: string;
                        current: string;
                    }>;
                }> | undefined;
        },
    ): void {
        const ed = this.#edgeData;
        const confValue =
            formData.confidence;
        const confidence =
            confValue !== undefined
            && isConfidenceLevel(confValue)
                ? confValue
                : ed.confidence;
        const descMap =
            new Map<string, string>();
        const metricMap =
            new Map<
                string,
                Record<string, string>
            >();
        if (formData.outcomes) {
            for (
                const o of formData.outcomes
            ) {
                descMap.set(
                    o.id, o.description,
                );
                for (const m of o.metrics) {
                    metricMap.set(m.id, {
                        name: m.name,
                        target: m.target,
                        unit: m.unit,
                        current: m.current,
                    });
                }
            }
        }
        this.#edgeData = {
            ...ed,
            impact: {
                shortTerm:
                    formData.shortTerm
                    ?? ed.impact.shortTerm,
                midTerm:
                    formData.midTerm
                    ?? ed.impact.midTerm,
                longTerm:
                    formData.longTerm
                    ?? ed.impact.longTerm,
            },
            confidence,
            owner:
                formData.owner
                ?? ed.owner,
            outcomes:
                ed.outcomes.map(
                    outcome => ({
                        ...outcome,
                        description:
                            descMap.get(
                                outcome.id,
                            )
                            ?? outcome
                                .description,
                        metrics:
                            outcome.metrics
                                .map(
                                    metric => {
                                        const mu =
                                            metricMap
                                                .get(
                                                    metric
                                                        .id,
                                                );
                                        if (!mu) {
                                            return metric;
                                        }
                                        return {
                                            ...metric,
                                            ...mu,
                                        };
                                    },
                                ),
                    }),
                ),
        };
    }

    getEdgeDataForSave(): EdgeData {
        return this.#edgeData;
    }

    computeCompletion(): CompletionStatus {
        const ed = this.#edgeData;
        const hasOutcomes =
            ed.outcomes.length > 0;
        const allOutcomesHaveMetrics =
            hasOutcomes
            && ed.outcomes.every(
                outcome =>
                    outcome.metrics.length > 0,
            );
        const hasImpact =
            ed.impact.shortTerm !== ''
            || ed.impact.midTerm !== ''
            || ed.impact.longTerm !== '';
        const hasOwner =
            ed.owner !== null
            && ed.owner.trim() !== '';
        const hasConfidence =
            ed.confidence.length > 0;
        const completionPercent = [
            hasOutcomes,
            allOutcomesHaveMetrics,
            hasImpact,
            hasOwner,
            hasConfidence,
        ].filter(Boolean).length * 20;
        const isComplete =
            hasOutcomes
            && allOutcomesHaveMetrics
            && hasImpact
            && hasOwner;
        return {
            hasOutcomes,
            allOutcomesHaveMetrics,
            hasImpact,
            hasOwner,
            hasConfidence,
            completionPercent,
            isComplete,
        };
    }

    #buildCompletionIcon(
        satisfied: boolean,
    ): SafeHtml {
        return satisfied
            ? html`<span
                style="${
                    'color:'
                    + 'hsl(var(--success))'
                }">${iconCheck(14, '')}</span>`
            : html`<span
                style="${
                    'color:hsl(var('
                    + '--muted-foreground))'
                }">${
                    iconAlertCircle(14, '')
                }</span>`;
    }

    #buildOutcomesHtml(): SafeHtml {
        const ed = this.#edgeData;
        if (ed.outcomes.length === 0) {
            return html`
            <div class="${
                'text-center p-8'
            }"
                style="${
                    'border:2px dashed '
                    + 'hsl(var(--border));'
                    + 'border-radius:'
                    + 'var(--radius-lg)'
                }">
                ${iconTarget(
                    40, 'text-muted',
                )}
                <p class="${
                    'text-sm text-muted '
                    + 'mb-4 mt-3'
                }">No outcomes defined
                    yet</p>
                <div class="${
                    'flex flex-wrap '
                    + 'justify-center '
                    + 'gap-2'
                }">
                    ${outcomeTemplates.map(
                        template => html`
                    <button
                        class="${
                            'btn btn-outline'
                            + ' btn-sm text-xs'
                        }"
                        data-add-template="${
                            template
                        }">${
                            template
                    }</button>`,
                    )}
                </div>
            </div>`;
        }
        return html`${ed.outcomes.map(
            (outcome, idx) => html`
            <div class="${
                'p-4 rounded-lg'
            }"
                style="${
                    'background:'
                    + 'hsl(var(--muted)'
                    + '/0.3);'
                    + 'border:1px solid '
                    + 'hsl(var(--border))'
                }">
                <div class="${
                    'flex items-start '
                    + 'gap-3 mb-3'
                }">
                    <div style="${
                        'width:1.5rem;'
                        + 'height:1.5rem;'
                        + 'border-radius:'
                        + '9999px;'
                        + 'background:'
                        + 'hsl(var(--primary)'
                        + '/0.1);'
                        + 'display:flex;'
                        + 'align-items:center;'
                        + 'justify-content:'
                        + 'center;'
                        + 'font-size:0.75rem;'
                        + 'font-weight:600;'
                        + 'color:'
                        + 'hsl(var(--primary));'
                        + 'flex-shrink:0'
                    }">${idx + 1}</div>
                    <input class="input"
                        style="flex:1"
                        value="${
                            outcome.description
                        }"
                        placeholder="${
                            'Describe the '
                            + 'business '
                            + 'outcome...'
                        }"
                        data-outcome-description="${
                            outcome.id
                        }" />
                    <button class="${
                        'btn btn-ghost '
                        + 'btn-icon btn-sm'
                    }"
                        data-remove-outcome="${
                            outcome.id
                        }">${
                            iconTrash(16, '')
                    }</button>
                </div>
                <div style="${
                    'padding-left:2.25rem'
                }">
                    <div class="${
                        'flex items-center '
                        + 'justify-between '
                        + 'mb-2'
                    }">
                        <span class="${
                            'text-xs '
                            + 'font-medium '
                            + 'text-muted'
                        }">Success
                            Metrics</span>
                        <button class="${
                            'btn btn-ghost '
                            + 'btn-xs gap-1'
                        }"
                            data-add-metric="${
                                outcome.id
                            }">${
                                iconPlus(12, '')
                            } Add Metric
                        </button>
                    </div>
                    ${this.#buildMetrics(
                        outcome,
                    )}
                </div>
            </div>`,
        )}`;
    }

    #buildMetrics(
        outcome: EdgeData['outcomes'][0],
    ): SafeHtml {
        if (outcome.metrics.length === 0) {
            return html`<p class="${
                'text-xs '
                + 'text-muted'
            }"
                style="${
                    'font-style:'
                    + 'italic'
                }">Add at least
                one metric to
                measure this
                outcome</p>`;
        }
        return html`${
            outcome.metrics.map(
                metric => html`
        <div class="${
            'p-2 rounded '
            + 'mb-2'
        }"
            style="${
                'background:'
                + 'hsl(var('
                + '--background'
                + '));'
                + 'border:'
                + '1px solid '
                + 'hsl(var('
                + '--border))'
            }">
            <div class="${
                'flex '
                + 'items-center'
                + ' gap-2'
            }">
                <input
                    class="${
                        'input'
                    }"
                    style="${
                        'flex:1;'
                        + 'height'
                        + ':2rem;'
                        + 'font-'
                        + 'size:'
                        + '0.875'
                        + 'rem'
                    }"
                    value="${
                        metric
                            .name
                    }"
                    placeholder="${
                        'Metric'
                        + ' name'
                    }"
                    data-outcome-id="${
                        outcome
                            .id
                    }"
                    data-metric-id="${
                        metric
                            .id
                    }"
                    data-metric-field="${
                        'name'
                    }"
                    />
                <input
                    class="${
                        'input'
                    }"
                    style="${
                        'width:'
                        + '5rem;'
                        + 'height'
                        + ':2rem;'
                        + 'font-'
                        + 'size:'
                        + '0.875'
                        + 'rem'
                    }"
                    value="${
                        metric
                            .target
                    }"
                    placeholder="${
                        'Target'
                    }"
                    data-outcome-id="${
                        outcome
                            .id
                    }"
                    data-metric-id="${
                        metric
                            .id
                    }"
                    data-metric-field="${
                        'target'
                    }"
                    />
                <input
                    class="${
                        'input'
                    }"
                    style="${
                        'width:'
                        + '4rem;'
                        + 'height'
                        + ':2rem;'
                        + 'font-'
                        + 'size:'
                        + '0.875'
                        + 'rem'
                    }"
                    value="${
                        metric
                            .unit
                    }"
                    placeholder="${
                        'Unit'
                    }"
                    data-outcome-id="${
                        outcome
                            .id
                    }"
                    data-metric-id="${
                        metric
                            .id
                    }"
                    data-metric-field="${
                        'unit'
                    }"
                    />
                <button
                    class="${
                        'btn '
                        + 'btn-'
                        + 'ghost'
                        + ' btn-'
                        + 'icon '
                        + 'btn-xs'
                    }"
                    data-action="${
                        'remove'
                        + '-metric'
                    }"
                    data-outcome-id="${
                        outcome
                            .id
                    }"
                    data-metric-id="${
                        metric
                            .id
                    }">${
                        iconTrash(
                            14, '',
                        )
                }</button>
            </div>
        </div>`)
        }`;
    }

    #buildProgress(
        completion: CompletionStatus,
    ): SafeHtml {
        return html`
        <div class="card p-4 mb-6">
            <div class="${
                'flex items-center '
                + 'justify-between mb-2'
            }">
                <span class="${
                    'text-sm font-medium'
                }">Completion</span>
                <span class="${
                    'text-sm text-muted'
                }">${
                    completion
                        .completionPercent
                }%
                </span>
            </div>
            <div class="progress"><div
                class="progress-fill"
                style="width:${
                    completion
                        .completionPercent
                }%"
                ></div></div>
            <div class="${
                'flex flex-wrap '
                + 'gap-3 mt-3'
            }">
                <div class="${
                    'flex items-center '
                    + 'gap-1 text-xs'
                }">${
                    this.#buildCompletionIcon(
                        completion.hasOutcomes,
                    )
                } <span class="${
                    completion.hasOutcomes
                        ? 'text-success'
                        : 'text-muted'
                }">Outcomes</span></div>
                <div class="${
                    'flex items-center '
                    + 'gap-1 text-xs'
                }">${
                    this.#buildCompletionIcon(
                        completion
                            .allOutcomesHaveMetrics
                        && completion
                            .hasOutcomes,
                    )
                } <span class="${
                    completion
                        .allOutcomesHaveMetrics
                    && completion.hasOutcomes
                        ? 'text-success'
                        : 'text-muted'
                }">Metrics</span></div>
                <div class="${
                    'flex items-center '
                    + 'gap-1 text-xs'
                }">${
                    this.#buildCompletionIcon(
                        completion.hasImpact,
                    )
                } <span class="${
                    completion.hasImpact
                        ? 'text-success'
                        : 'text-muted'
                }">Impact</span></div>
                <div class="${
                    'flex items-center '
                    + 'gap-1 text-xs'
                }">${
                    this.#buildCompletionIcon(
                        completion.hasOwner,
                    )
                } <span class="${
                    completion.hasOwner
                        ? 'text-success'
                        : 'text-muted'
                }">Owner</span></div>
            </div>
        </div>`;
    }

    #buildIdeaSummary(): SafeHtml {
        return html`
            <div>
                <div class="card p-5"
                    style="${
                        'position:sticky;'
                        + 'top:1.5rem'
                    }">
                    <h3 class="${
                        'font-display '
                        + 'font-semibold '
                        + 'mb-4 '
                        + 'flex items-center'
                        + ' gap-2'
                    }">${iconTarget(
                        20, 'text-primary',
                    )} Linked Idea</h3>
                    <h4 class="${
                        'font-medium mb-3'
                    }">${
                        this.#ideaTitle
                    }</h4>
                    <p class="${
                        'text-xs '
                        + 'text-muted mb-1'
                    }">Problem</p>
                    <p class="${
                        'text-sm mb-3'
                    }">${
                        this
                            .#ideaProblemStatement
                    }</p>
                    <p class="${
                        'text-xs '
                        + 'text-muted mb-1'
                    }">Solution</p>
                    <p class="${
                        'text-sm mb-3'
                    }">${
                        this
                            .#ideaProposedSolution
                    }</p>
                    <div style="${
                        'padding-top:0.75rem;'
                        + 'border-top:'
                        + '1px solid '
                        + 'hsl(var(--border))'
                    }">
                        <p class="${
                            'text-xs '
                            + 'text-muted mb-1'
                        }">Submitted by</p>
                        <p class="text-sm"
                            >${
                                displayText(
                                    this
                                    .#ideaSubmittedBy,
                                )
                        }</p>
                    </div>
                </div>
            </div>`;
    }

    #buildImpactSection(): SafeHtml {
        const ed = this.#edgeData;
        return html`
                <div class="card p-5">
                    <h3 class="${
                        'font-display '
                        + 'font-semibold '
                        + 'mb-4 '
                        + 'flex items-center'
                        + ' gap-2'
                    }">${iconTrendingUp(
                        20, 'text-primary',
                    )} Expected Impact</h3>
                    <div class="${
                        'impact-grid'
                    }">
                        <div>
                            <label class="${
                                'label text-xs'
                                + ' text-muted '
                                + 'mb-2 flex '
                                + 'items-center'
                                + ' gap-1'
                            }">${
                                iconClock(14, '')
                            } Short-term
                                (0-3
                                months)</label>
                            <textarea
                                class="${
                                    'textarea '
                                    + 'text-sm'
                                }"
                                rows="4"
                                id="${
                                    'edge-'
                                    + 'impact-'
                                    + 'short-term'
                                }"
                                placeholder="${
                                    'Expected '
                                    + 'impact in'
                                    + ' the first'
                                    + ' 3 '
                                    + 'months...'
                                }">${
                                    ed
                                        .impact
                                        .shortTerm
                            }</textarea>
                        </div>
                        <div>
                            <label class="${
                                'label text-xs'
                                + ' text-muted '
                                + 'mb-2 flex '
                                + 'items-center'
                                + ' gap-1'
                            }">${
                                iconClock(14, '')
                            } Mid-term
                                (3-12
                                months)</label>
                            <textarea
                                class="${
                                    'textarea '
                                    + 'text-sm'
                                }"
                                rows="4"
                                id="${
                                    'edge-'
                                    + 'impact-'
                                    + 'mid-term'
                                }"
                                placeholder="${
                                    'Expected '
                                    + 'impact '
                                    + 'over '
                                    + '3-12 '
                                    + 'months...'
                                }">${
                                    ed
                                        .impact
                                        .midTerm
                            }</textarea>
                        </div>
                        <div>
                            <label class="${
                                'label text-xs'
                                + ' text-muted '
                                + 'mb-2 flex '
                                + 'items-center'
                                + ' gap-1'
                            }">${
                                iconClock(14, '')
                            } Long-term
                                (12+
                                months)</label>
                            <textarea
                                class="${
                                    'textarea '
                                    + 'text-sm'
                                }"
                                rows="4"
                                id="${
                                    'edge-'
                                    + 'impact-'
                                    + 'long-term'
                                }"
                                placeholder="${
                                    'Expected '
                                    + 'impact '
                                    + 'after '
                                    + '12 '
                                    + 'months...'
                                }">${
                                    ed
                                        .impact
                                        .longTerm
                            }</textarea>
                        </div>
                    </div>
                </div>`;
    }

    #buildConfidenceSection(): SafeHtml {
        const ed = this.#edgeData;
        return html`
                <div class="card p-5">
                    <h3 class="${
                        'font-display '
                        + 'font-semibold '
                        + 'mb-4 '
                        + 'flex items-center'
                        + ' gap-2'
                    }">${iconShield(
                        20, 'text-primary',
                    )} Confidence
                        &amp; Ownership</h3>
                    <div style="${
                        'display:grid;'
                        + 'grid-template-'
                        + 'columns:'
                        + '1fr 1fr;gap:1rem'
                    }">
                        <div>
                            <label class="${
                                'label text-xs'
                                + ' text-muted '
                                + 'mb-2 block'
                            }">Confidence
                                Level</label>
                            <select
                                class="input"
                                id="${
                                    'edge-'
                                    + 'confidence'
                                    + '-select'
                                }">
                                <option
                                    value=""
                                    >Select
                                    confidence
                                    level
                                </option>
                                <option
                                    value="${
                                        'high'
                                    }"
                                    ${trusted(
                                        ed
                                            .confidence
                                            === 'high'
                                            ? 'selected'
                                            : '',
                                    )}>High -
                                    Strong
                                    evidence
                                </option>
                                <option
                                    value="${
                                        'medium'
                                    }"
                                    ${trusted(
                                        ed
                                            .confidence
                                            === 'medium'
                                            ? 'selected'
                                            : '',
                                    )}>Medium -
                                    Some
                                    uncertainty
                                </option>
                                <option
                                    value="${
                                        'low'
                                    }"
                                    ${trusted(
                                        ed
                                            .confidence
                                            === 'low'
                                            ? 'selected'
                                            : '',
                                    )}>Low -
                                    Significant
                                    unknowns
                                </option>
                            </select>
                        </div>
                        <div>
                            <label class="${
                                'label text-xs'
                                + ' text-muted '
                                + 'mb-2 flex '
                                + 'items-center'
                                + ' gap-1'
                            }">${
                                iconUser(14, '')
                            } Edge
                                Owner</label>
                            <input
                                class="input"
                                id="${
                                    'edge-'
                                    + 'owner-'
                                    + 'input'
                                }"
                                placeholder="${
                                    'Who owns '
                                    + 'this Edge'
                                    + ' definition'
                                    + '?'
                                }"
                                value="${
                                    ed.owner
                                }" />
                        </div>
                    </div>
                </div>`;
    }

    #buildWarningCard(
        completion: CompletionStatus,
    ): SafeHtml {
        if (completion.isComplete) {
            return html``;
        }
        return html`
                <div class="card p-4"
                    style="${
                        'border-color:'
                        + 'hsl(var(--warning)'
                        + '/0.3);'
                        + 'background:'
                        + 'hsl(var('
                        + '--warning-soft))'
                    }">
                    <div class="${
                        'flex items-start '
                        + 'gap-3'
                    }">
                        ${iconAlertCircle(
                            20, 'text-warning',
                        )}
                        <div>
                            <p class="${
                                'font-medium'
                            }"
                                style="${
                                    'color:'
                                    + 'hsl(var('
                                    + '--warning'
                                    + '))'
                                }">Complete
                                all required
                                fields to
                                proceed</p>
                            <ul class="${
                                'text-sm mt-1'
                            }"
                                style="${
                                    'color:'
                                    + 'hsl(var('
                                    + '--warning'
                                    + ')/0.8)'
                                }">
                                ${!completion
                                    .hasOutcomes
                                    ? html`<li>${
                                        '\u2022 Add'
                                        + ' at '
                                        + 'least'
                                        + ' one '
                                        + 'business'
                                        + ' outcome'
                                    }</li>`
                                    : html``}
                                ${completion
                                    .hasOutcomes
                                    && !completion
                                        .allOutcomesHaveMetrics
                                    ? html`<li>${
                                        '\u2022 Add'
                                        + ' at '
                                        + 'least'
                                        + ' one '
                                        + 'metric'
                                        + ' to '
                                        + 'each '
                                        + 'outcome'
                                    }</li>`
                                    : html``}
                                ${!completion
                                    .hasImpact
                                    ? html`<li>${
                                        '\u2022 '
                                        + 'Describe'
                                        + ' expected'
                                        + ' impact'
                                    }</li>`
                                    : html``}
                                ${!completion
                                    .hasOwner
                                    ? html`<li>${
                                        '\u2022 '
                                        + 'Assign'
                                        + ' an '
                                        + 'owner'
                                    }</li>`
                                    : html``}
                            </ul>
                        </div>
                    </div>
                </div>`;
    }

    buildDetailView(
        ideaId: string,
    ): SafeHtml {
        void ideaId;
        const completion =
            this.computeCompletion();
        const statusLabel =
            completion.isComplete
                ? 'Complete'
                : completion
                    .completionPercent > 0
                    ? 'In Progress'
                    : 'Incomplete';
        const statusClassName =
            completion.isComplete
                ? 'badge-success'
                : completion
                    .completionPercent > 0
                    ? 'badge-warning'
                    : 'badge-error';

        return html`
    <div>
        <div class="${
            'flex items-center '
            + 'justify-between gap-4 mb-6'
        }">
            <div class="${
                'flex items-center gap-4'
            }">
                <button class="${
                    'btn btn-ghost btn-icon'
                }"
                    id="edge-back-btn"
                    >${
                        iconArrowLeft(20, '')
                }</button>
                <div>
                    <div class="${
                        'badge badge-primary '
                        + 'text-sm mb-2'
                    }">${
                        iconTarget(14, '')
                    } Business Case
                        Definition</div>
                    <div class="${
                        'flex items-center '
                        + 'gap-3 mb-1'
                    }">
                        <h1 class="${
                            'text-2xl '
                            + 'font-display '
                            + 'font-bold'
                        }">Edge</h1>
                        <span class="${
                            'badge '
                            + statusClassName
                        }">${
                            statusLabel
                        }</span>
                    </div>
                    <p class="${
                        'text-sm text-muted'
                    }">Define outcomes,
                        metrics, and
                        expected impact</p>
                </div>
            </div>
            <button class="${
                'btn btn-hero gap-2'
            }"
                id="edge-save-btn">
                ${iconSave(16, '')
                } Save &amp; Continue
            </button>
        </div>

        ${this.#buildProgress(completion)}

        <div class="edge-grid">
            ${this.#buildIdeaSummary()}

            <div style="${
                'display:flex;'
                + 'flex-direction:column;'
                + 'gap:1.5rem'
            }">
                <div class="card p-5">
                    <div class="${
                        'flex items-center '
                        + 'justify-between '
                        + 'mb-4'
                    }">
                        <h3 class="${
                            'font-display '
                            + 'font-semibold '
                            + 'flex '
                            + 'items-center '
                            + 'gap-2'
                        }">${iconTarget(
                            20,
                            'text-primary',
                        )} Business
                            Outcomes</h3>
                        <button class="${
                            'btn btn-outline '
                            + 'btn-sm gap-1'
                        }"
                            id="${
                                'edge-add'
                                + '-outcome'
                            }">${
                                iconPlus(16, '')
                            } Add
                            Outcome</button>
                    </div>
                    <div id="${
                        'edge-outcomes'
                    }">${
                        this.#buildOutcomesHtml()
                    }</div>
                </div>

                ${this.#buildImpactSection()}

                ${this.#buildConfidenceSection()}

                ${this.#buildWarningCard(
                    completion,
                )}
            </div>
        </div>
    </div>`;
    }
}
