import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    iconSparkles, iconArrowLeft,
    iconLightbulb, iconCheck,
} from '../icons';

interface FormData {
    title: string;
    problemStatement: string;
    targetUsers: string;
    proposedSolution: string;
    expectedOutcome: string;
    successMetrics: string;
}

const EMPTY_FORM: FormData = {
    title: '',
    problemStatement: '',
    targetUsers: '',
    proposedSolution: '',
    expectedOutcome: '',
    successMetrics: '',
};

export class IdeaCreatePresenter {
    #form: FormData = { ...EMPTY_FORM };

    syncFields(
        fields: Partial<FormData>,
    ): void {
        for (
            const [k, v] of
            Object.entries(fields)
        ) {
            if (v !== undefined) {
                this.#form[
                    k as keyof FormData
                ] = v.trim();
            }
        }
    }

    formData(): FormData {
        return { ...this.#form };
    }

    isFormComplete(): boolean {
        return this.#form
            .title !== ''
            && this.#form
                .problemStatement
                !== ''
            && this.#form
                .proposedSolution
                !== ''
            && this.#form
                .expectedOutcome
                !== '';
    }

    render(): SafeHtml {
        return html`
    <div class="${
        'flex items-center'
        + ' justify-between'
        + ' gap-4 mb-6'
    }">
        <div class="${
            'flex items-center gap-4'
        }">
            <button
                class="${
                    'btn btn-ghost'
                    + ' btn-icon'
                }"
                id=${'idea-create'
                    + '-back-btn'}>
                ${iconArrowLeft(20, '')}
            </button>
            <div class="${
                'flex items-center gap-3'
            }">
                <div
                    class="${
                        'gradient-hero'
                        + ' rounded-lg'
                        + ' flex'
                        + ' items-center'
                        + ' justify-center'
                        + ' idea-create-icon'
                    }">
                    ${iconSparkles(
                        20, '',
                    )}
                </div>
                <span class="${
                    'text-xl'
                    + ' font-display'
                    + ' font-bold'
                }">
                    New Idea
                </span>
            </div>
        </div>
    </div>
    <div class="card p-6"
        id=${'idea-create'
            + '-step-content'}>
        <div class="mb-6">
            <div class="${
                'flex items-center gap-3'
            }">
                ${iconLightbulb(
                    24, 'text-primary',
                )}
                <h2 class="${
                    'text-2xl'
                    + ' font-display'
                    + ' font-bold'
                }">Describe Your Idea</h2>
            </div>
        </div>
        ${this.#buildFormFields()}
        <div
            class="${
                'flex items-center'
                + ' justify-between gap-3'
                + ' mt-8 pt-6'
                + ' section-divider-top'
            }">
            <button
                class="${
                    'btn btn-ghost'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-back'}>
                ${iconArrowLeft(16, '')}
                Cancel
            </button>
            <button
                class="${
                    'btn btn-hero'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-next'}
                ${trusted(
                    this.isFormComplete()
                        ? ''
                        : 'disabled',
                )}>
                ${'Submit Idea'}
                ${iconCheck(16, '')}
            </button>
        </div>
    </div>`;
    }

    #buildFormFields(): SafeHtml {
        return html`
    <div class="flex flex-col gap-6">
        <div>
            <label class="label mb-2
                block font-medium">
                Give your idea a clear title
            </label>
            <input class="${
                'input input-large-title'
            }"
                id=${'idea-create'
                    + '-field-title'}
                placeholder="${'e.g.,'
                    + ' AI-Powered'
                    + ' Customer'
                    + ' Segmentation'}"
                value="${
                    this.#form.title
                }"
            />
            <p class="text-xs text-muted
                mt-1">
                Keep it short and descriptive
                &#8211; think of what you
                would search for
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium">
                ${'What problem does'
                    + ' this solve?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-problem'}
                placeholder="${
                    'Describe the'
                    + ' current pain'
                    + ' point or'
                    + ' challenge. Who'
                    + ' experiences it?'
                    + ' How often? What'
                    + ' is the cost of'
                    + ' not solving it?'
                }"
                rows="5">${
                    this.#form
                        .problemStatement
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                Focus on the impact &#8211;
                why does this matter to
                the business?
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium">
                ${'Who will benefit'
                    + ' from this?'}
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-target'}
                placeholder="${
                    'e.g., Sales'
                    + ' team,'
                    + ' customers,'
                    + ' operations'
                    + ' managers'
                }"
                value="${
                    this.#form.targetUsers
                }"
            />
            <p class="text-xs text-muted
                mt-1">
                ${'Identify the people'
                    + ' or teams who will'
                    + ' use this'}
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium">
                How would you solve this?
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-solution'}
                placeholder="${
                    'Describe your'
                    + ' proposed'
                    + ' approach.'
                    + ' What would'
                    + ' change? What'
                    + ' technology or'
                    + ' process would'
                    + ' you use?'
                }"
                rows="5">${
                    this.#form
                        .proposedSolution
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                You do not need all the
                answers &#8211; outline your
                best thinking
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium">
                ${'What outcome do'
                    + ' you expect?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-outcome'}
                placeholder="${
                    'If this works,'
                    + ' what changes?'
                    + ' Be specific:'
                    + ' revenue impact,'
                    + ' time saved,'
                    + ' errors reduced,'
                    + ' satisfaction'
                    + ' improved...'
                }"
                rows="5">${
                    this.#form
                        .expectedOutcome
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                ${'Think about what success'
                    + ' looks'
                    + ' like in 6-12 months'}
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium">
                ${'How would you'
                    + ' measure success?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-metrics'}
                placeholder="${
                    'e.g., 20%'
                    + ' reduction in'
                    + ' processing'
                    + ' time, 15%'
                    + ' increase in'
                    + ' conversion'
                    + ' rate, NPS'
                    + ' improvement'
                    + ' of 10 points'
                }"
                rows="4">${
                    this.#form
                        .successMetrics
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                ${'Define measurable'
                    + ' indicators of'
                    + ' success'}
            </p>
        </div>
    </div>`;
    }
}
