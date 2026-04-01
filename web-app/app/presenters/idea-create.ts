import {
    html, SafeHtml, trusted,
} from '../safe-html';
import {
    iconSparkles, iconArrowLeft,
    iconArrowRight, iconLightbulb,
    iconTarget, iconAlertCircle,
    iconTrendingUp, iconWand,
    iconCheck,
} from '../icons';

const STEPS = [
    {
        id: 1,
        title: 'The Problem',
        icon: iconAlertCircle,
        description:
            'What challenge are you'
            + ' trying to solve?',
    },
    {
        id: 2,
        title: 'The Solution',
        icon: iconLightbulb,
        description:
            'How will you address'
            + ' this problem?',
    },
    {
        id: 3,
        title: 'The Impact',
        icon: iconTrendingUp,
        description:
            'What value will this'
            + ' create?',
    },
];

interface FormData {
    title: string;
    problemStatement: string;
    proposedSolution: string;
    expectedOutcome: string;
    targetUsers: string;
    successMetrics: string;
}

const EMPTY_FORM: FormData = {
    title: '',
    problemStatement: '',
    proposedSolution: '',
    expectedOutcome: '',
    targetUsers: '',
    successMetrics: '',
};

export class IdeaCreatePresenter {
    #step = 1;
    #form: FormData = { ...EMPTY_FORM };

    nextStep(): boolean {
        if (!this.isStepComplete())
            return false;
        if (this.#step < STEPS.length) {
            this.#step++;
            return true;
        }
        return false;
    }

    prevStep(): boolean {
        if (this.#step > 1) {
            this.#step--;
            return true;
        }
        return false;
    }

    isFirstStep(): boolean {
        return this.#step === 1;
    }

    isLastStep(): boolean {
        return this.#step === STEPS.length;
    }

    syncFields(
        fields: Partial<FormData>,
    ): void {
        this.#form = {
            ...this.#form,
            ...fields,
        };
    }

    formData(): FormData {
        return { ...this.#form };
    }

    currentStep(): number {
        return this.#step;
    }

    isStepComplete(): boolean {
        switch (this.#step) {
            case 1:
                return this.#form
                    .title.trim() !== ''
                    && this.#form
                        .problemStatement
                        .trim() !== '';
            case 2:
                return this.#form
                    .proposedSolution
                    .trim() !== '';
            case 3:
                return this.#form
                    .expectedOutcome
                    .trim() !== '';
            default:
                return false;
        }
    }

    render(): SafeHtml {
        const step =
            STEPS[this.#step - 1]!;
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
                    }"
                    style="${'width:'
                        + '2.25rem;'
                        + 'height:'
                        + '2.25rem;'
                        + 'color:'
                        + 'hsl(var('
                        + '--primary'
                        + '-foreground'
                        + '))'}">
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
        <button
            class="${
                'btn btn-ghost'
                + ' btn-sm gap-2'
                + ' text-primary'
            }">
            ${iconWand(16, '')}
            <span
                class="hidden-mobile">
                Generate with AI
            </span>
            <span
                class="visible-mobile">
                AI
            </span>
        </button>
    </div>
    <div
        class="flex items-center
            justify-between mb-8"
        style="${'overflow-x:auto;'
            + 'padding-bottom:'
            + '0.5rem'}">
        ${this.#buildProgressSteps()}
    </div>
    <div class="card p-6"
        id=${'idea-create'
            + '-step-content'}>
        <div class="mb-6">
            <h2 class="${
                'text-2xl'
                + ' font-display'
                + ' font-bold'
                + ' mb-2'
            }">${
                step.title
            }</h2>
            <p class="text-muted">${
                step.description
            }</p>
        </div>
        ${this.#buildStepContent()}
        <div
            class="flex items-center
                justify-between gap-3
                mt-8 pt-6"
            style="${'border-top:'
                + '1px solid'
                + ' hsl(var('
                + '--border))'}">
            <button
                class="${
                    'btn btn-ghost'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-back'}>
                ${iconArrowLeft(16, '')}
                ${this.#step === 1
                    ? 'Cancel'
                    : 'Back'}
            </button>
            <span class="text-sm
                text-muted">
                Step
                ${this.#step}
                of ${STEPS.length}
            </span>
            <button
                class="${
                    'btn btn-hero'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-next'}
                ${trusted(
                    this.isStepComplete()
                        ? ''
                        : 'disabled',
                )}>
                ${this.#step === 3
                    ? html`${'Submit'
                        + ' Idea'}
                        ${iconCheck(16, '')}`
                    : html`Continue
                        ${iconArrowRight(
                            16, '',
                        )}`}
            </button>
        </div>
    </div>`;
    }

    #buildProgressSteps(): SafeHtml {
        return html`${STEPS.map(
            (step, index) => {
                const isCurrent =
                    this.#step
                    === step.id;
                const isCompleted =
                    this.#step
                    > step.id;
                const bgStyle =
                    isCompleted
                        ? 'background:'
                            + 'hsl(var('
                            + '--success));'
                            + 'color:hsl(var('
                            + '--success'
                            + '-foreground))'
                        : isCurrent
                            ? 'background:'
                                + 'hsl(var('
                                + '--primary'
                                + '));'
                                + 'color:'
                                + 'hsl(var('
                                + '--primary'
                                + '-foreground'
                                + '))'
                            : 'background:'
                                + 'hsl(var('
                                + '--muted));'
                                + 'color:'
                                + 'hsl(var('
                                + '--muted'
                                + '-foreground'
                                + '))';

                const isLast =
                    index
                    >= STEPS.length - 1;
                const connector = !isLast
                    ? html`<div
                        class="${
                            'hidden-mobile'
                        }"
                        style="${'flex:1;'
                            + 'height:'
                            + '0.25rem;'
                            + 'margin:'
                            + '0 1rem;'
                            + 'border-radius'
                            + ':9999px;'
                            + (isCompleted
                                ? 'background'
                                    + ':hsl(var('
                                    + '--success'
                                    + '))'
                                : 'background'
                                    + ':hsl(var('
                                    + '--muted'
                                    + '))'
                            )}">
                        </div>`
                    : html``;

                return html`
    <div
        class="flex items-center"
        style="${'flex-shrink:0'
            + (isLast
                ? ''
                : ';flex:1')}">
        <div class="flex flex-col
            items-center">
            <div style="${'width:3rem;'
                + 'height:3rem;'
                + 'border-radius:'
                + '0.75rem;'
                + 'display:flex;'
                + 'align-items:center;'
                + 'justify-content:'
                + 'center;'
                + bgStyle}">
                ${isCompleted
                    ? iconCheck(20, '')
                    : step.icon(20, '')}
            </div>
            <span
                class="mt-2 text-sm
                    font-medium"
                style="${'white-space:'
                    + 'nowrap;'
                    + 'color:'
                    + (this.#step
                        >= step.id
                        ? 'hsl(var('
                            + '--foreground'
                            + '))'
                        : 'hsl(var('
                            + '--muted'
                            + '-foreground'
                            + '))')}">
                ${step.title}
            </span>
        </div>
        ${connector}
    </div>`;
            },
        )}`;
    }

    #buildStepContent(): SafeHtml {
        if (this.#step === 1) {
            return this.#buildStep1();
        }
        if (this.#step === 2) {
            return this.#buildStep2();
        }
        return this.#buildStep3();
    }

    #buildStep1(): SafeHtml {
        return html`
    <div style="${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}">
        <div>
            <label class="label mb-2
                block font-medium">
                Give your idea a clear title
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-title'}
                placeholder="${'e.g.,'
                    + ' AI-Powered'
                    + ' Customer'
                    + ' Segmentation'}"
                value="${
                    this.#form.title
                }"
                style="${
                    'font-size:'
                    + '1.125rem;'
                    + 'padding:'
                    + '0.75rem 1rem'}"
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
            <textarea class="textarea"
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
                rows="5"
                style="resize:none">${
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
                <span class="text-muted"
                    style="${
                        'font-weight:'
                        + 'normal'}">
                    (optional)
                </span>
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-target'}
                placeholder="${'e.g.,'
                    + ' Sales team,'
                    + ' customers,'
                    + ' operations'
                    + ' managers'}"
                value="${
                    this.#form
                        .targetUsers
                }" />
        </div>
    </div>`;
    }

    #buildStep2(): SafeHtml {
        return html`
    <div style="${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}">
        <div>
            <label class="label mb-2
                block font-medium">
                How would you solve this?
            </label>
            <textarea class="textarea"
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
                rows="7"
                style="resize:none">${
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
        <div class="p-4 rounded-xl"
            style="${'background:'
                + 'hsl(var('
                + '--primary)/0.05);'
                + 'border:1px solid'
                + ' hsl(var('
                + '--primary)/0.1)'}">
            <div class="flex items-start
                gap-3">
                ${iconTarget(
                    20,
                    'text-primary',
                )}
                <div>
                    <p class="text-sm
                        font-medium mb-1">
                        Tip: Think scope
                    </p>
                    <p class="text-sm
                        text-muted">
                        ${'What is the smallest'
                            + ' version of this'
                            + ' idea'
                            + ' that could'
                            + ' prove value?'
                            + ' Starting small'
                            + ' often'
                            + ' leads to faster'
                            + ' wins.'}
                    </p>
                </div>
            </div>
        </div>
    </div>`;
    }

    #buildStep3(): SafeHtml {
        return html`
    <div style="${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}">
        <div>
            <label class="label mb-2
                block font-medium">
                ${'What outcome do'
                    + ' you expect?'}
            </label>
            <textarea class="textarea"
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
                rows="5"
                style="resize:none">${
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
                ${'How would you measure'
                    + ' success?'}
                <span class="text-muted"
                    style="${
                        'font-weight:'
                        + 'normal'}">
                    (optional)
                </span>
            </label>
            <textarea class="textarea"
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
                rows="4"
                style="resize:none">${
                    this.#form
                        .successMetrics
            }</textarea>
        </div>
        <div class="p-4 rounded-xl"
            style="${'background:'
                + 'hsl(var('
                + '--success-soft));'
                + 'border:1px solid'
                + ' hsl(var('
                + '--success)/0.2)'}">
            <div class="flex items-start
                gap-3">
                ${iconTrendingUp(
                    20,
                    'text-success',
                )}
                <div>
                    <p class="text-sm
                        font-medium mb-1">
                        ${'Next: Convert'
                            + ' to Project'}
                    </p>
                    <p class="text-sm
                        text-muted">
                        ${'After submitting,'
                            + ' you can'
                            + ' convert this'
                            + ' idea into a'
                            + ' project with'
                            + ' timeline,'
                            + ' budget, and'
                            + ' team details.'}
                    </p>
                </div>
            </div>
        </div>
    </div>`;
    }
}
