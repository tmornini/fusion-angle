import {
    html, SafeHtml, trusted,
} from '../safe-html.ts';
import {
    displayText,
} from '../core.ts';
import {
    iconDollarSign,
    iconArrowRight,
    iconArrowLeft,
    iconTarget,
    iconRocket,
    iconClock,
    iconCheckCircle2,
    iconTrendingUp,
} from '../icons.ts';
import { type Idea } from '../adapters/index.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    formatSigned,
} from '../scoring-format.ts';

export interface ObjectiveDefinition {
    name: string;
    description: string;
}

export type ConversionField =
    | 'project-name'
    | 'time-days'
    | 'cost'
    | 'success-criteria';

const REQUIRED_FIELDS:
    readonly ConversionField[] = [
    'project-name',
    'time-days',
    'cost',
    'success-criteria',
];

export const ALL_CONVERSION_FIELDS:
    readonly ConversionField[] = [
    'project-name',
    'time-days',
    'cost',
    'success-criteria',
];

export type ConversionFields = Record<
    ConversionField, string
>;

export interface ConversionDraft {
    readonly fields: ConversionFields;
    readonly baselines:
        ReadonlyMap<ObjectiveId, number>;
}

export function buildInitialConversionDraft(
    idea: Idea,
): ConversionDraft {
    return {
        fields: {
            'project-name': idea.titleText(),
            'time-days': '',
            'cost': '',
            'success-criteria': '',
        },
        baselines: new Map(),
    };
}

export function conversionRequiredCount(
    activeObjectiveCount: number,
): number {
    return REQUIRED_FIELDS.length
        + activeObjectiveCount;
}

export function conversionCompletedCount(
    draft: ConversionDraft,
): number {
    const filledFields = REQUIRED_FIELDS.filter(
        f => draft.fields[f] !== '',
    ).length;
    return filledFields + draft.baselines.size;
}

export function conversionIsReady(
    draft: ConversionDraft,
    activeObjectives: readonly Objective[],
): boolean {
    const allFieldsFilled = REQUIRED_FIELDS.every(
        f => draft.fields[f] !== '',
    );
    if (!allFieldsFilled) return false;
    return activeObjectives.every(
        o => draft.baselines.has(o.id),
    );
}

export function conversionFieldIsReady(
    draft: ConversionDraft,
    field: ConversionField,
): boolean {
    return draft.fields[field] !== '';
}

export class IdeaConversionPresenter {
    readonly #title: string;
    readonly #problemStatement: string;
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #draft: ConversionDraft;
    readonly #activeObjectives:
        readonly Objective[];
    readonly #defs: ReadonlyMap<
        ObjectiveId, ObjectiveDefinition
    >;

    constructor(
        idea: Idea,
        draft: ConversionDraft,
        activeObjectives: readonly Objective[],
        defs: ReadonlyMap<
            ObjectiveId, ObjectiveDefinition
        >,
    ) {
        this.#title = idea.titleText();
        this.#problemStatement =
            idea.problemStatementText();
        this.#targetUsers =
            idea.targetUsersText();
        this.#proposedSolution =
            idea.proposedSolutionText();
        this.#expectedOutcome =
            idea.expectedOutcomeText();
        this.#successMetrics =
            idea.successMetricsText();
        this.#draft = draft;
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
    }

    #fieldCheck(
        field: ConversionField,
    ): SafeHtml {
        const isSet =
            conversionFieldIsReady(
                this.#draft, field,
            );
        return html`<span
            id="check-${field}"
            class="field-check"
            data-ready="${
                isSet ? 'true' : 'false'
            }">
            ${iconCheckCircle2(16, '')}
        </span>`;
    }

    #baselineCheck(
        objectiveId: ObjectiveId,
    ): SafeHtml {
        const isSet = this.#draft.baselines
            .has(objectiveId);
        return html`<span
            id="check-baseline-${objectiveId}"
            class="field-check"
            data-ready="${
                isSet ? 'true' : 'false'
            }">
            ${iconCheckCircle2(16, '')}
        </span>`;
    }

    render(): SafeHtml {
        const completed =
            conversionCompletedCount(
                this.#draft,
            );
        const required =
            conversionRequiredCount(
                this.#activeObjectives.length,
            );
        const percent =
            (completed / required)
            * 100;

        return html`
        <div class="${
            'flex items-center'
            + ' justify-between'
            + ' gap-4 mb-6'
        }">
            <div class="${
                'flex items-center'
                + ' gap-4'
            }">
                <button
                    class="${
                        'btn btn-ghost'
                        + ' btn-icon'
                    }"
                    id=${'convert'
                        + '-back-to'
                        + '-ideas'}>
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="flex
                    items-center gap-3">
                    <div
                        class="${
                            'gradient-hero'
                            + ' rounded-lg'
                            + ' flex'
                            + ' items-center'
                            + ' justify-center'
                            + ' convert-icon'
                        }">
                        ${iconRocket(20, '')}
                    </div>
                    <span class="${
                        'text-xl'
                        + ' font-display'
                        + ' font-bold'
                    }">
                        ${'Convert to'
                            + ' Project'}
                    </span>
                </div>
            </div>
            <div class="${
                'hidden-mobile'
                + ' flex items-center'
                + ' gap-2'
                + ' text-sm'
            }">
                <span
                    id=${'convert'
                        + '-progress'
                        + '-text'}
                    class="${
                    'text-muted'
                }">${
                    completed
                }/${
                    required
                } required fields${
                    ''
                }</span>
                <div class="${
                    'convert-progress-bar'
                }">
                    <div
                        id=${'convert'
                            + '-progress'
                            + '-fill'}
                        class="${
                            'convert-progress-fill'
                        }"
                        style="${
                            '--convert-progress:'
                            + percent + '%'
                        }"></div>
                </div>
            </div>
        </div>
            <div class="${
                'convert-grid'
                + ' convert-grid-2-3'
            }">
                ${this.#buildSummary()}
                ${this.#buildForm()}
            </div>`;
    }

    #buildSummary(): SafeHtml {
        return html`
            <div>
                <div class="${
                    'card p-6'
                    + ' convert-summary-sticky'
                }">
                    <h2 class="${
                        'text-lg'
                        + ' font-display'
                        + ' font-semibold'
                        + ' mb-4'
                    }">
                        ${'Problem'
                            + ' & Solution'}
                    </h2>
                    <p class="${
                        'text-xl'
                        + ' font-display'
                        + ' font-bold'
                        + ' mb-4'
                    }">${
                        this.#title
                    }</p>
                    <div class="${
                        'flex flex-col gap-5'
                    }">
                        <div>
                            <p class="${
                                'text-xs'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Problem'
                                + ' Statement'}
                            </p>
                            <p class="${
                                'text-sm'
                            }">${
                                displayText(
                                this
                                .#problemStatement
                                )
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-xs'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Target'
                                + ' Users'}
                            </p>
                            <p class="${
                                'text-sm'
                            }">${
                                displayText(
                                this
                                .#targetUsers
                                )
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-xs'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Proposed'
                                + ' Solution'}
                            </p>
                            <p class="${
                                'text-sm'
                            }">${
                                displayText(
                                this
                                .#proposedSolution
                                )
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-xs'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Expected'
                                + ' Outcome'}
                            </p>
                            <p class="${
                                'text-sm'
                            }">${
                                displayText(
                                this
                                .#expectedOutcome
                                )
                            }</p>
                        </div>
                        <div>
                            <p class="${
                                'text-xs'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Success'
                                + ' Metrics'}
                            </p>
                            <p class="${
                                'text-sm'
                            }">${
                                displayText(
                                this
                                .#successMetrics
                                )
                            }</p>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    #buildForm(): SafeHtml {
        return html`
            <div class="stack-lg">
                ${this.#buildRequired()}
                ${this.#buildScores()}
                ${this.#buildConfirm()}
            </div>`;
    }

    #buildRequired(): SafeHtml {
        const fields = this.#draft.fields;
        return html`
            <div class="card p-6">
                <div class="flex
                    items-center
                    gap-2 mb-6">
                    ${iconTarget(
                        20,
                        'text-primary',
                    )}
                    <span class="${
                        'font-medium'
                    }">
                        Project Details
                    </span>
                </div>
                <div class="stack-lg">
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                            + ' flex'
                            + ' items-center'
                            + ' gap-2'
                        }"
                            for="${
                                'convert-project'
                                + '-name'
                            }">
                            Project Name
                            ${this.#fieldCheck(
                                'project-name',
                            )}
                        </label>
                        <input
                            class="input"
                            id=${'convert'
                                + '-project'
                                + '-name'}
                            value="${
                                fields[
                                'project-name'
                                ]
                            }"
                            placeholder="${
                                'Give your'
                                + ' project'
                                + ' a clear'
                                + ' name'
                            }"
                        />
                    </div>
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                            + ' flex'
                            + ' items-center'
                            + ' gap-2'
                        }"
                            for="${
                                'convert-time'
                                + '-days'
                            }">
                            ${iconClock(
                                16,
                                'text-muted',
                            )}
                            Time
                            ${this.#fieldCheck(
                                'time-days',
                            )}
                        </label>
                        <div class="${
                            'input-prefix-wrap'
                        }">
                            <span class="${
                                'input-suffix-symbol'
                            }">days</span>
                            <input
                                class="${
                                    'input'
                                    + ' input-with'
                                    + '-suffix'
                                }"
                                type="text"
                                inputmode="${
                                    'numeric'
                                }"
                                id="${
                                    'convert'
                                    + '-time-days'
                                }"
                                placeholder="${
                                    'Enter'
                                    + ' duration'
                                    + ' in days'
                                }"
                                value="${
                                    fields[
                                    'time-days'
                                    ]
                                }" />
                        </div>
                    </div>
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                            + ' flex'
                            + ' items-center'
                            + ' gap-2'
                        }"
                            for="convert-cost">
                            ${iconDollarSign(
                                16,
                                'text-muted',
                            )}
                            Cost
                            ${this.#fieldCheck(
                                'cost',
                            )}
                        </label>
                        <div class="${
                            'input-prefix-wrap'
                        }">
                            <span class="${
                                'input-prefix-symbol'
                            }">$</span>
                            <input
                                class="${
                                    'input'
                                    + ' input-with'
                                    + '-prefix'
                                }"
                                type="text"
                                inputmode="${
                                    'numeric'
                                }"
                                id="${
                                    'convert'
                                    + '-cost'
                                }"
                                placeholder="${
                                    'Enter'
                                    + ' cost'
                                    + ' amount'
                                }"
                                value="${
                                    fields['cost']
                                }" />
                        </div>
                    </div>
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                            + ' flex'
                            + ' items-center'
                            + ' gap-2'
                        }"
                            for="${
                                'convert-success'
                                + '-criteria'
                            }">
                            Success Criteria
                            ${this.#fieldCheck(
                                'success-criteria',
                            )}
                        </label>
                        <textarea
                            class="${
                                'textarea'
                                + ' resize-none'
                            }"
                            id=${'convert'
                                + '-success'
                                + '-criteria'}
                            placeholder="${
                                'How will you'
                                + ' know when'
                                + ' this'
                                + ' project is'
                                + ' complete'
                                + ' and'
                                + ' successful?'
                            }"
                            rows="4">${
                            fields[
                            'success-criteria'
                            ]
                        }</textarea>
                    </div>
                </div>
            </div>`;
    }

    #buildScores(): SafeHtml {
        if (
            this.#activeObjectives.length === 0
        ) {
            return this.#buildScoresEmpty();
        }
        return html`
            <div class="card p-6"
                id="convert-scores-section">
                <div class="flex
                    items-center
                    gap-2 mb-6">
                    ${iconTrendingUp(
                        20,
                        'text-primary',
                    )}
                    <span class="${
                        'font-medium'
                    }">
                        Scores
                    </span>
                </div>
                ${this.#activeObjectives.map(
                    o => this.#baselineRow(o),
                )}
            </div>`;
    }

    #buildScoresEmpty(): SafeHtml {
        return html`
            <div class="card p-6"
                id="convert-scores-section">
                <div class="flex
                    items-center
                    gap-2 mb-6">
                    ${iconTrendingUp(
                        20,
                        'text-primary',
                    )}
                    <span class="${
                        'font-medium'
                    }">
                        Scores
                    </span>
                </div>
                <div class="empty-banner">
                    ${'No active objectives yet.'
                        + ' Convert this idea now'
                        + ' and it will not be'
                        + ' baseline-scored;'
                        + ' add objectives in the'
                        + ' Organization page and'
                        + ' reviewers can score'
                        + ' this project later'
                        + ' from project detail.'}
                </div>
                <div class="flex gap-3 mt-4">
                    <button
                        class="${
                            'btn btn-ghost gap-2'
                        }"
                        id="convert-open-organization">
                        Open Organization
                    </button>
                </div>
            </div>`;
    }

    #baselineRow(obj: Objective): SafeHtml {
        const def = this.#defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing`
                + ` for ${obj.id}`,
            );
        }
        const stored = this.#draft.baselines
            .get(obj.id);
        const isSet = stored !== undefined;
        const value = stored ?? 0;
        const display = isSet
            ? formatSigned(stored)
            : '—';
        return html`
            <div class="convert-scores-row"
                data-objective-id="${obj.id}"
                data-touched="${
                    isSet ? 'true' : 'false'
                }">
                <label class="${
                    'label'
                    + ' font-medium'
                    + ' flex'
                    + ' items-center'
                    + ' gap-2'
                }"
                    for="${
                        'convert-baseline-'
                        + obj.id
                    }">
                    ${def.name}
                    ${this.#baselineCheck(
                        obj.id,
                    )}
                </label>
                <input type="range"
                    min="-100" max="100"
                    step="1"
                    id="${
                        'convert-baseline-'
                        + obj.id
                    }"
                    value="${value}"
                    data-initial-value="${value}"
                    data-objective-id="${obj.id}"
                    class="baseline-slider">
                <span class="slider-value">
                    ${display}
                </span>
            </div>`;
    }

    #buildConfirm(): SafeHtml {
        const isReady = conversionIsReady(
            this.#draft,
            this.#activeObjectives,
        );
        const remaining =
            conversionRequiredCount(
                this.#activeObjectives.length,
            )
            - conversionCompletedCount(
                this.#draft,
            );
        return html`
            <div class="${
                'card p-6'
                + ' convert-confirm-section'
            }"
                id=${'convert'
                    + '-confirm'
                    + '-section'}
                data-ready="${
                    isReady ? 'true' : 'false'
                }">
                <div class="flex
                    items-start gap-4">
                    <div
                        id=${'convert'
                            + '-confirm'
                            + '-icon'}
                        class="${
                            'convert-confirm-icon'
                        }"
                        data-ready="${
                            isReady
                                ? 'true'
                                : 'false'
                        }">
                        ${iconRocket(24, '')}
                    </div>
                    <div class="flex-1">
                        <h3
                            id=${'convert'
                                + '-confirm'
                                + '-heading'}
                            class="${
                                'font-semibold'
                                + ' mb-1'
                            }">
                            ${isReady
                                ? 'Ready to'
                                    + ' Create'
                                    + ' Project'
                                : 'Complete'
                                    + ' Required'
                                    + ' Fields'}
                        </h3>
                        <p
                            id=${'convert'
                                + '-confirm'
                                + '-sub'}
                            class="${
                            'text-sm'
                            + ' text-muted'
                            + ' mb-4'
                        }">
                            ${isReady
                                ? 'All required'
                                    + ' info has'
                                    + ' been'
                                    + ' provided.'
                                    + ' Click'
                                    + ' below to'
                                    + ' create'
                                    + ' this'
                                    + ' project.'
                                : `${
                                    remaining
                                } required${
                                    ' '
                                }field${
                                    remaining > 1
                                        ? 's'
                                        : ''
                                } remaining`}
                        </p>
                        <div class="${
                            'flex gap-3'
                        }">
                            <button
                                class="${
                                    'btn'
                                    + ' btn-ghost'
                                }"
                                id=${
                                    'convert'
                                    + '-back'
                                    + '-to'
                                    + '-ideas-2'
                                }>
                                ${iconArrowLeft(
                                    16, '',
                                )}
                                ${'Back to'
                                    + ' Ideas'}
                            </button>
                            <button
                                class="${
                                    'btn'
                                    + ' btn-hero'
                                    + ' gap-2'
                                }"
                                id=${
                                    'convert'
                                    + '-submit'
                                    + '-btn'
                                }
                                ${trusted(
                                    isReady
                                        ? ''
                                        : 'disabled',
                                )}>
                                ${'Create'
                                    + ' Project'}
                                ${iconArrowRight(
                                    16, '',
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    }
}
