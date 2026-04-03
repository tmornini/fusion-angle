import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    iconClock,
    iconDollarSign,
    iconTrendingUp,
    iconArrowRight,
    iconArrowLeft,
    iconTarget,
    iconRocket,
    iconCalendar,
    iconUsers,
    iconFolderKanban,
    iconCheckCircle2,
} from '../icons';
import type {
    Idea,
} from '../../../api/types';
import {
    User,
} from '../../../api/types';

type ConversionField =
    | 'project-name'
    | 'project-lead'
    | 'start-date'
    | 'target-end-date'
    | 'budget'
    | 'priority'
    | 'success-criteria';

const REQUIRED_FIELDS:
    ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'priority',
];

const ALL_FIELDS:
    ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'priority',
    'success-criteria',
];

interface LeadOption {
    readonly id: string;
    readonly fullName: string;
    readonly role: string;
}

export class IdeaConversionPresenter {
    readonly #title: string;
    readonly #problemStatement: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #estimatedDuration: string;
    readonly #estimatedCost: string;
    readonly #leadOptions: LeadOption[];
    #fields: Record<
        ConversionField, string
    >;

    constructor(
        idea: Idea,
        estimatedDuration: string,
        estimatedCost: string,
        users: User[],
    ) {
        this.#title = idea.title;
        this.#problemStatement =
            idea.problemStatement;
        this.#proposedSolution =
            idea.proposedSolution;
        this.#expectedOutcome =
            idea.expectedOutcome;
        this.#estimatedDuration =
            estimatedDuration;
        this.#estimatedCost =
            estimatedCost;
        this.#leadOptions = users
            .filter(u => u.isActive())
            .map(u => ({
                id: u.id,
                fullName: u.fullName(),
                role: u.role,
            }));
        this.#fields = {
            'project-name': idea.title,
            'project-lead': '',
            'start-date': '',
            'target-end-date': '',
            'budget': '',
            'priority': '',
            'success-criteria': '',
        };
    }

    syncFields(
        fields: Partial<Record<
            ConversionField, string
        >>,
    ): void {
        this.#fields = {
            ...this.#fields,
            ...fields,
        };
    }

    projectDetails(): Record<
        ConversionField, string
    > {
        return { ...this.#fields };
    }

    isReady(): boolean {
        return REQUIRED_FIELDS.every(
            f => this.#fields[f].trim(),
        );
    }

    fieldReady(
        field: ConversionField,
    ): boolean {
        return !!this.#fields[field]
            .trim();
    }

    completedCount(): number {
        return REQUIRED_FIELDS.filter(
            f => this.#fields[f].trim(),
        ).length;
    }

    requiredCount(): number {
        return REQUIRED_FIELDS.length;
    }

    #fieldCheck(
        field: ConversionField,
    ): SafeHtml {
        const isSet =
            this.#fields[field].trim();
        return html`<span
            id="check-${field}"
            style="${'color:'
                + 'hsl(var('
                + '--success));'
                + (isSet
                    ? ''
                    : 'display:none')}">
            ${iconCheckCircle2(16, '')}
        </span>`;
    }

    render(): SafeHtml {
        const completed =
            this.completedCount();
        const required =
            REQUIRED_FIELDS.length;
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
                            + ' justify-'
                            + 'center'
                        }"
                        style="${
                            'width:'
                            + '2.25rem;'
                            + 'height:'
                            + '2.25rem;'
                            + 'color:'
                            + 'hsl(var('
                            + '--primary'
                            + '-foreground'
                            + '))'
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
                <div style="${
                    'width:'
                    + '6rem;'
                    + 'height:0.5rem;'
                    + 'background:'
                    + 'hsl(var(--muted)'
                    + ');'
                    + 'border-radius:'
                    + '9999px;'
                    + 'overflow:'
                    + 'hidden'
                }">
                    <div
                        id=${'convert'
                            + '-progress'
                            + '-fill'}
                        style="${
                        'height:100%;'
                        + 'background:'
                        + 'hsl(var('
                        + '--success));'
                        + 'transition:'
                        + 'width 0.3s;'
                        + 'width:'
                        + percent
                        + '%'
                    }"></div>
                </div>
            </div>
        </div>
            <div class="convert-grid"
                style="${
                    'grid-template-'
                    + 'columns:'
                    + '2fr 3fr;'
                    + 'gap:2rem'
                }">
                ${this.#buildSummary()}
                ${this.#buildForm()}
            </div>`;
    }

    #buildSummary(): SafeHtml {
        return html`
            <div>
                <div class="card p-6"
                    style="${
                        'position:'
                        + 'sticky;'
                        + 'top:6rem'
                    }">
                    <div class="${
                        'flex items-center'
                        + ' gap-2 text-sm'
                        + ' font-medium'
                        + ' text-muted'
                        + ' mb-4'
                    }">
                        ${iconFolderKanban(
                            16, '',
                        )}
                        Idea Summary
                    </div>
                    <h2 class="${
                        'text-xl'
                        + ' font-display'
                        + ' font-bold'
                        + ' mb-4'
                    }">${
                        this.#title
                    }</h2>
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:1rem;'
                        + 'margin-bottom:'
                        + '1.5rem'
                    }">
                        <div>
                            <h4 class="${
                                'text-sm'
                                + ' font-medium'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                Problem
                            </h4>
                            <p class="${
                                'text-sm'
                            }">${
                                this
                                .#problemStatement
                            }</p>
                        </div>
                        <div>
                            <h4 class="${
                                'text-sm'
                                + ' font-medium'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                Solution
                            </h4>
                            <p class="${
                                'text-sm'
                            }">${
                                this
                                .#proposedSolution
                            }</p>
                        </div>
                        <div>
                            <h4 class="${
                                'text-sm'
                                + ' font-medium'
                                + ' text-muted'
                                + ' mb-1'
                            }">
                                ${'Expected'
                                    + ' Outcome'}
                            </h4>
                            <p class="${
                                'text-sm'
                            }">${
                                this
                                .#expectedOutcome
                            }</p>
                        </div>
                    </div>
                    <div style="${
                        'border-top:'
                        + '1px solid'
                        + ' hsl(var('
                        + '--border));'
                        + 'padding-top:'
                        + '1rem;'
                        + 'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:0.75rem'
                    }">
                        ${this.#buildMetric(
                            iconClock(16, ''),
                            'Est. Time',
                            this
                            .#estimatedDuration,
                            '',
                        )}
                        ${this.#buildMetric(
                            iconDollarSign(
                                16, '',
                            ),
                            'Est. Cost',
                            this
                            .#estimatedCost,
                            '',
                        )}
                    </div>
                </div>
            </div>`;
    }

    #buildMetric(
        icon: SafeHtml,
        label: string,
        value: string | number,
        style: string,
    ): SafeHtml {
        return html`
        <div class="flex
            items-center
            justify-between">
            <span class="${
                'flex items-center'
                + ' gap-2 text-muted'
            }">
                ${icon}
                <span class="${
                    'text-sm'
                }">
                    ${label}
                </span>
            </span>
            <span
                class="${
                    'font-medium'
                }"
                style="${style}">${
                value
            }</span>
        </div>`;
    }

    #buildForm(): SafeHtml {
        return html`
            <div style="${
                'display:flex;'
                + 'flex-direction:'
                + 'column;'
                + 'gap:1.5rem'
            }">
                ${this.#buildRequired()}
                ${this.#buildOptional()}
                ${this.#buildConfirm()}
            </div>`;
    }

    #buildRequired(): SafeHtml {
        const f = this.#fields;
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
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:1.5rem'
                }">
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
                                f[
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
                                o => html`
                            <option
                                value="${o.id}"
                                ${trusted(
                                    o.id ===
                                    f[
                                    'project-lead'
                                    ]
                                        ? 'selected'
                                        : '',
                                )}>
                                ${o.fullName}
                                - ${o.role}
                            </option>`)}
                        </select>
                    </div>
                    <div style="${
                        'display:grid;'
                        + 'grid-template-'
                        + 'columns:'
                        + '1fr 1fr;'
                        + 'gap:1rem'
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
                                    f[
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
                                    f[
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
                            ${'Allocated'
                                + ' Budget'}
                            ${this.#fieldCheck(
                                'budget',
                            )}
                        </label>
                        <div style="${
                            'position:'
                            + 'relative'
                        }">
                            <span style="${
                                'position:'
                                + 'absolute;'
                                + 'left:'
                                + '0.75rem;'
                                + 'top:50%;'
                                + 'transform:'
                                + 'translateY'
                                + '(-50%);'
                                + 'color:'
                                + 'hsl(var('
                                + '--muted-'
                                + 'foreground'
                                + '));'
                                + 'pointer-'
                                + 'events:'
                                + 'none'
                            }">$</span>
                            <input
                                class="input"
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
                                    f['budget']
                                }"
                                style="${
                                    'padding-'
                                    + 'left:'
                                    + '1.75rem'
                                }" />
                        </div>
                        <p class="${
                            'text-xs'
                            + ' text-muted'
                            + ' mt-1'
                        }">
                            AI estimate:
                            ${this
                            .#estimatedCost}
                        </p>
                    </div>
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                            + ' flex'
                            + ' items-center'
                            + ' gap-2'
                        }">
                            Priority Level
                            ${this.#fieldCheck(
                                'priority',
                            )}
                        </label>
                        <select
                            class="input"
                            id="${
                                'convert'
                                + '-priority'
                            }">
                            <option value="">
                                ${'How urgent'
                                    + ' is this'
                                    + ' project?'}
                            </option>
                            <option
                                value="${
                                    'critical'
                                }"
                                ${trusted(
                                    f[
                                    'priority'
                                    ] ===
                                    'critical'
                                    ? 'selected'
                                    : '',
                                )}>
                                ${'Critical'
                                    + ' - Must'
                                    + ' start'
                                    + ' immediately'}
                            </option>
                            <option
                                value="high"
                                ${trusted(
                                    f[
                                    'priority'
                                    ] ===
                                    'high'
                                    ? 'selected'
                                    : '',
                                )}>
                                ${'High'
                                    + ' - Start'
                                    + ' within'
                                    + ' 2 weeks'}
                            </option>
                            <option
                                value="medium"
                                ${trusted(
                                    f[
                                    'priority'
                                    ] ===
                                    'medium'
                                    ? 'selected'
                                    : '',
                                )}>
                                ${'Medium'
                                    + ' - Start'
                                    + ' within'
                                    + ' 1 month'}
                            </option>
                            <option
                                value="low"
                                ${trusted(
                                    f[
                                    'priority'
                                    ] ===
                                    'low'
                                    ? 'selected'
                                    : '',
                                )}>
                                ${'Low - Can'
                                    + ' wait for'
                                    + ' capacity'}
                            </option>
                        </select>
                    </div>
                </div>
            </div>`;
    }

    #buildOptional(): SafeHtml {
        const f = this.#fields;
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
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:1.5rem'
                }">
                    <div>
                        <label class="${
                            'label mb-2'
                            + ' font-medium'
                        }">
                            ${'Success'
                                + ' Criteria'}
                        </label>
                        <textarea
                            class="textarea"
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
                            rows="4"
                            style="${
                                'resize:none'
                            }">${
                            f[
                            'success-criteria'
                            ]
                        }</textarea>
                    </div>
                </div>
            </div>`;
    }

    #buildConfirm(): SafeHtml {
        const isReady = this.isReady();
        const remaining =
            REQUIRED_FIELDS.length
            - this.completedCount();
        return html`
            <div class="card p-6"
                id=${'convert'
                    + '-confirm'
                    + '-section'}
                style="${'border:'
                    + '2px solid '
                    + (isReady
                        ? 'hsl(var('
                            + '--success)'
                            + ' / 0.3)'
                        : 'transparent')
                    + ';'
                    + (isReady
                        ? 'background:'
                            + 'hsl(var('
                            + '--success)'
                            + ' / 0.05)'
                        : '')}">
                <div class="flex
                    items-start gap-4">
                    <div
                        id=${'convert'
                            + '-confirm'
                            + '-icon'}
                        style="${
                        'width:3rem;'
                        + 'height:3rem;'
                        + 'border-radius:'
                        + '0.75rem;'
                        + 'display:flex;'
                        + 'align-items:'
                        + 'center;'
                        + 'justify-'
                        + 'content:'
                        + 'center;'
                        + (isReady
                            ? 'background:'
                                + 'hsl(var('
                                + '--success'
                                + '));'
                                + 'color:'
                                + 'hsl(var('
                                + '--success-'
                                + 'foreground'
                                + '))'
                            : 'background:'
                                + 'hsl(var('
                                + '--muted));'
                                + 'color:'
                                + 'hsl(var('
                                + '--muted-'
                                + 'foreground'
                                + '))')
                    }">
                        ${iconRocket(24, '')}
                    </div>
                    <div style="flex:1">
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
