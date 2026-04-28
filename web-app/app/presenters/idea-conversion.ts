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
    iconCalendar,
    iconUsers,
    iconTrendingUp,
    iconCheckCircle2,
} from '../icons.ts';
import {
    type Idea,
    User,
} from '../adapters/index.ts';

export type ConversionField =
    | 'project-name'
    | 'project-lead'
    | 'start-date'
    | 'target-end-date'
    | 'budget'
    | 'impact'
    | 'success-criteria';

const REQUIRED_FIELDS:
    readonly ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'impact',
];

export const ALL_CONVERSION_FIELDS:
    readonly ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'impact',
    'success-criteria',
];

export type ConversionFields = Record<
    ConversionField, string
>;

export function buildInitialConversionFields(
    idea: Idea,
): ConversionFields {
    return {
        'project-name': idea.titleText(),
        'project-lead': '',
        'start-date': '',
        'target-end-date': '',
        'budget': '',
        'impact': '',
        'success-criteria': '',
    };
}

export function conversionRequiredCount(
): number {
    return REQUIRED_FIELDS.length;
}

export function conversionCompletedCount(
    fields: ConversionFields,
): number {
    return REQUIRED_FIELDS.filter(
        f => fields[f] !== '',
    ).length;
}

export function conversionIsReady(
    fields: ConversionFields,
): boolean {
    return REQUIRED_FIELDS.every(
        f => fields[f] !== '',
    );
}

export function conversionFieldIsReady(
    fields: ConversionFields,
    field: ConversionField,
): boolean {
    return fields[field] !== '';
}

interface LeadOption {
    readonly id: string;
    readonly fullName: string;
    readonly role: string;
}

function buildLeadOption(
    option: LeadOption,
    selectedId: string,
): SafeHtml {
    const sel = option.id === selectedId
        ? 'selected'
        : '';
    return html`<option
        value="${option.id}"
        ${trusted(sel)}>
        ${option.fullName} - ${option.role}
    </option>`;
}

export class IdeaConversionPresenter {
    readonly #title: string;
    readonly #problemStatement: string;
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #leadOptions: LeadOption[];
    readonly #fields: ConversionFields;

    constructor(
        idea: Idea,
        users: User[],
        fields: ConversionFields,
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
        this.#leadOptions = users
            .filter(u => u.isActive())
            .map(u => ({
                id: u.idForLink(),
                fullName: u.fullName(),
                role: u.roleLabel(),
            }));
        this.#fields = fields;
    }

    #fieldCheck(
        field: ConversionField,
    ): SafeHtml {
        const isSet =
            conversionFieldIsReady(
                this.#fields, field,
            );
        const cls = isSet
            ? 'field-check'
            : 'field-check hidden';
        return html`<span
            id="check-${field}"
            class="${cls}">
            ${iconCheckCircle2(16, '')}
        </span>`;
    }

    render(): SafeHtml {
        const completed =
            conversionCompletedCount(
                this.#fields,
            );
        const required =
            conversionRequiredCount();
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
                ${this.#buildOptional()}
                ${this.#buildConfirm()}
            </div>`;
    }

    #buildRequired(): SafeHtml {
        const fields = this.#fields;
        const lo = this.#leadOptions;
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
                        }">
                            Project Lead
                            ${this.#fieldCheck(
                                'project-lead',
                            )}
                        </label>
                        <select
                            class="input"
                            id=${'convert'
                                + '-project'
                                + '-lead'}>
                            <option
                                value="">
                                ${'Who will'
                                    + ' own'
                                    + ' this'
                                    + ' project?'}
                            </option>
                            ${lo.map(
                                o => buildLeadOption(
                                    o,
                                    fields[
                                        'project-lead'
                                    ],
                                ),
                            )}
                        </select>
                    </div>
                    <div class="${
                        'grid grid-cols-2 gap-4'
                    }">
                        <div>
                            <label class="${
                                'label mb-2'
                                + ' font-medium'
                                + ' flex'
                                + ' items-center'
                                + ' gap-2'
                            }">
                                ${iconCalendar(
                                    16,
                                    'text-muted',
                                )}
                                Start Date
                                ${this
                                .#fieldCheck(
                                'start-date',
                                )}
                            </label>
                            <input
                                class="input"
                                type="date"
                                id=${'convert'
                                    + '-start'
                                    + '-date'}
                                value="${
                                    fields[
                                    'start-date'
                                    ]
                                }" />
                        </div>
                        <div>
                            <label class="${
                                'label mb-2'
                                + ' font-medium'
                                + ' flex'
                                + ' items-center'
                                + ' gap-2'
                            }">
                                ${iconTarget(
                                    16,
                                    'text-muted',
                                )}
                                ${'Target End'
                                    + ' Date'}
                                ${this
                                .#fieldCheck(
                                'target-end-date',
                                )}
                            </label>
                            <input
                                class="input"
                                type="date"
                                id=${'convert'
                                    + '-target'
                                    + '-end'
                                    + '-date'}
                                value="${
                                    fields[
                                    'target-end-date'
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
                        }">
                            ${iconDollarSign(
                                16,
                                'text-muted',
                            )}
                            Cost
                            ${this.#fieldCheck(
                                'budget',
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
                                    + '-budget'
                                }"
                                placeholder="${
                                    'Enter'
                                    + ' budget'
                                    + ' amount'
                                }"
                                value="${
                                    fields['budget']
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
                        }">
                            ${iconTrendingUp(
                                16,
                                'text-muted',
                            )}
                            Impact
                            ${this.#fieldCheck(
                                'impact',
                            )}
                        </label>
                        <div class="${
                            'input-prefix-wrap'
                        }">
                            <span class="${
                                'input-suffix-symbol'
                            }">pts</span>
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
                                    + '-impact'
                                }"
                                placeholder="${
                                    'Enter'
                                    + ' impact'
                                    + ' points'
                                }"
                                value="${
                                    fields['impact']
                                }" />
                        </div>
                    </div>
                </div>
            </div>`;
    }

    #buildOptional(): SafeHtml {
        const fields = this.#fields;
        return html`
            <div class="card p-6">
                <div class="flex
                    items-center
                    gap-2 mb-6">
                    ${iconUsers(
                        20,
                        'text-primary',
                    )}
                    <span class="${
                        'font-medium'
                    }">
                        ${'Additional'
                            + ' Details'}
                    </span>
                    <span class="${
                        'text-xs'
                        + ' text-muted'
                    }">
                        (Optional)
                    </span>
                </div>
                <div class="stack-lg">
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                        }">
                            ${'Success'
                                + ' Criteria'}
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

    #buildConfirm(): SafeHtml {
        const isReady = conversionIsReady(
            this.#fields,
        );
        const remaining =
            conversionRequiredCount()
            - conversionCompletedCount(
                this.#fields,
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
