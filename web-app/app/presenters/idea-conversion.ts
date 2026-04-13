import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    displayText,
} from '../core';
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
} from '../icons';
import {
    type Idea,
    User,
} from '../adapters';

type ConversionField =
    | 'project-name'
    | 'project-lead'
    | 'start-date'
    | 'target-end-date'
    | 'budget'
    | 'impact'
    | 'success-criteria';

const REQUIRED_FIELDS:
    ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'impact',
];

const ALL_FIELDS:
    ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'impact',
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
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #leadOptions: LeadOption[];
    #fields: Record<
        ConversionField, string
    >;

    constructor(
        idea: Idea,
        users: User[],
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
        this.#fields = {
            'project-name': idea.titleText(),
            'project-lead': '',
            'start-date': '',
            'target-end-date': '',
            'budget': '',
            'impact': '',
            'success-criteria': '',
        };
    }

    syncFields(
        fields: Partial<Record<
            ConversionField, string
        >>,
    ): void {
        for (
            const [k, v] of
            Object.entries(fields)
        ) {
            if (v !== undefined) {
                this.#fields[
                    k as ConversionField
                ] = v.trim();
            }
        }
    }

    projectDetails(): Record<
        ConversionField, string
    > {
        return { ...this.#fields };
    }

    isReady(): boolean {
        return REQUIRED_FIELDS.every(
            f => this.#fields[f] !== '',
        );
    }

    fieldReady(
        field: ConversionField,
    ): boolean {
        return this.#fields[field] !== '';
    }

    completedCount(): number {
        return REQUIRED_FIELDS.filter(
            f => this.#fields[f] !== '',
        ).length;
    }

    requiredCount(): number {
        return REQUIRED_FIELDS.length;
    }

    #fieldCheck(
        field: ConversionField,
    ): SafeHtml {
        const isSet =
            this.#fields[field] !== '';
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
                    + 'var(--radius-full);'
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
                    <div style="${
                        'display:flex;'
                        + 'flex-direction:'
                        + 'column;'
                        + 'gap:1.25rem'
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
                            Cost
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
                        <div style="${
                            'position:'
                            + 'relative'
                        }">
                            <span style="${
                                'position:'
                                + 'absolute;'
                                + 'right:'
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
                            }">pts</span>
                            <input
                                class="input"
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
                                    f['impact']
                                }"
                                style="${
                                    'padding-'
                                    + 'right:'
                                    + '2.5rem'
                                }" />
                        </div>
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
