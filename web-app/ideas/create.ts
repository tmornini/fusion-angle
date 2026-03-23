import {
    $, $input, $textarea,
} from '../app/dom';
import {
    html, setHtml, SafeHtml,
} from '../app/safe-html';
import {
    iconSparkles, iconArrowLeft,
    iconArrowRight, iconLightbulb,
    iconTarget, iconAlertCircle,
    iconTrendingUp, iconWand, iconCheck,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    putIdea,
    putIdeaSubmission,
} from '../app/adapters';
import {
    jsonArrayField,
} from '../../api/types';

const steps = [
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

const emptyFormData = {
    title: '',
    problemStatement: '',
    proposedSolution: '',
    expectedOutcome: '',
    targetUsers: '',
    successMetrics: '',
};

interface State {
    currentStep: number;
    formData: typeof emptyFormData;
}

export async function init():
    Promise<void> {
    const state: State = {
        currentStep: 1,
        formData: { ...emptyFormData },
    };

    function isStepComplete(): boolean {
        switch (state.currentStep) {
            case 1:
                return state.formData
                    .title.trim() !== ''
                    && state.formData
                        .problemStatement
                        .trim() !== '';
            case 2:
                return state.formData
                    .proposedSolution
                    .trim() !== '';
            case 3:
                return state.formData
                    .expectedOutcome
                    .trim() !== '';
            default:
                return false;
        }
    }

    function buildProgressSteps():
        SafeHtml {
        return html`${steps.map(
            (step, index) => {
                const isCurrent =
                    state.currentStep
                    === step.id;
                const isCompleted =
                    state.currentStep
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
                    >= steps.length - 1;
                const connector = !isLast
                    ? html`<div
                        class="hidden-mobile"
                        style=${'flex:1;'
                            + 'height:'
                            + '0.25rem;'
                            + 'margin:'
                            + '0 1rem;'
                            + 'border-radius:'
                            + '9999px;'
                            + (isCompleted
                                ? 'background'
                                    + ':hsl(var('
                                    + '--success'
                                    + '))'
                                : 'background'
                                    + ':hsl(var('
                                    + '--muted'
                                    + '))'
                            )}>
                        </div>`
                    : html``;

                return html`
    <div
        class="flex items-center"
        style=${'flex-shrink:0'
            + (isLast
                ? ''
                : ';flex:1')}>
        <div class="flex flex-col
            items-center">
            <div style=${'width:3rem;'
                + 'height:3rem;'
                + 'border-radius:'
                + '0.75rem;'
                + 'display:flex;'
                + 'align-items:center;'
                + 'justify-content:'
                + 'center;'
                + bgStyle}>
                ${isCompleted
                    ? iconCheck(20, '')
                    : step.icon(20, '')}
            </div>
            <span
                class="mt-2 text-sm
                    font-medium"
                style=${'white-space:'
                    + 'nowrap;'
                    + 'color:'
                    + (state.currentStep
                        >= step.id
                        ? 'hsl(var('
                            + '--foreground'
                            + '))'
                        : 'hsl(var('
                            + '--muted'
                            + '-foreground'
                            + '))')}>
                ${step.title}
            </span>
        </div>
        ${connector}
    </div>`;
            },
        )}`;
    }

    function buildStepContent():
        SafeHtml {
        if (state.currentStep === 1) {
            return html`
    <div style=${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}>
        <div>
            <label class="label mb-2
                block font-medium">
                Give your idea a clear title
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-title'}
                placeholder=${'e.g.,'
                    + ' AI-Powered Customer'
                    + ' Segmentation'}
                value="${
                    state.formData.title
                }"
                style=${'font-size:1.125rem;'
                    + 'padding:0.75rem 1rem'}
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
                placeholder=${'Describe the'
                    + ' current pain point or'
                    + ' challenge. Who'
                    + ' experiences it? How'
                    + ' often? What is the'
                    + ' cost of not'
                    + ' solving it?'}
                rows="5"
                style="resize:none">${
                    state.formData
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
                    style=${'font-weight:'
                        + 'normal'}>
                    (optional)
                </span>
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-target'}
                placeholder=${'e.g.,'
                    + ' Sales team,'
                    + ' customers, operations'
                    + ' managers'}
                value="${
                    state.formData
                        .targetUsers
                }" />
        </div>
    </div>`;
        }
        if (state.currentStep === 2) {
            return html`
    <div style=${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}>
        <div>
            <label class="label mb-2
                block font-medium">
                How would you solve this?
            </label>
            <textarea class="textarea"
                id=${'idea-create'
                    + '-field-solution'}
                placeholder=${'Describe your'
                    + ' proposed approach.'
                    + ' What would change?'
                    + ' What technology or'
                    + ' process would'
                    + ' you use?'}
                rows="7"
                style="resize:none">${
                    state.formData
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
            style=${'background:'
                + 'hsl(var('
                + '--primary)/0.05);'
                + 'border:1px solid'
                + ' hsl(var('
                + '--primary)/0.1)'}>
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
        return html`
    <div style=${'display:flex;'
        + 'flex-direction:column;'
        + 'gap:1.5rem'}>
        <div>
            <label class="label mb-2
                block font-medium">
                ${'What outcome do'
                    + ' you expect?'}
            </label>
            <textarea class="textarea"
                id=${'idea-create'
                    + '-field-outcome'}
                placeholder=${'If this works,'
                    + ' what changes? Be'
                    + ' specific: revenue'
                    + ' impact, time saved,'
                    + ' errors reduced,'
                    + ' satisfaction'
                    + ' improved...'}
                rows="5"
                style="resize:none">${
                    state.formData
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
                    style=${'font-weight:'
                        + 'normal'}>
                    (optional)
                </span>
            </label>
            <textarea class="textarea"
                id=${'idea-create'
                    + '-field-metrics'}
                placeholder=${'e.g., 20%'
                    + ' reduction in'
                    + ' processing time, 15%'
                    + ' increase in conversion'
                    + ' rate, NPS improvement'
                    + ' of 10 points'}
                rows="4"
                style="resize:none">${
                    state.formData
                        .successMetrics
            }</textarea>
        </div>
        <div class="p-4 rounded-xl"
            style=${'background:'
                + 'hsl(var('
                + '--success-soft));'
                + 'border:1px solid'
                + ' hsl(var('
                + '--success)/0.2)'}>
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

    function buildWizardPage():
        SafeHtml {
        const step =
            steps[
                state.currentStep - 1
            ]!;
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
                    style=${'width:'
                        + '2.25rem;'
                        + 'height:'
                        + '2.25rem;'
                        + 'color:'
                        + 'hsl(var('
                        + '--primary'
                        + '-foreground'
                        + '))'}>
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
        style=${'overflow-x:auto;'
            + 'padding-bottom:'
            + '0.5rem'}>
        ${buildProgressSteps()}
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
        ${buildStepContent()}
        <div
            class="flex items-center
                justify-between gap-3
                mt-8 pt-6"
            style=${'border-top:'
                + '1px solid'
                + ' hsl(var('
                + '--border))'}>
            <button
                class="${
                    'btn btn-ghost'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-back'}>
                ${iconArrowLeft(16, '')}
                ${state.currentStep
                    === 1
                    ? 'Cancel'
                    : 'Back'}
            </button>
            <span class="text-sm
                text-muted">
                Step
                ${state.currentStep}
                of ${steps.length}
            </span>
            <button
                class="${
                    'btn btn-hero'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-next'}
                ${isStepComplete()
                    ? ''
                    : 'disabled'}>
                ${state.currentStep
                    === 3
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

    function mutateWizard() {
        const root = $('#create-content', document);
        if (root) {
            setHtml(
                root,
                buildWizardPage(),
            );
            bindWizardEvents();
        }
    }

    function syncFormFields() {
        if (state.currentStep === 1) {
            state.formData = {
                ...state.formData,
                title:
                    $input(
                        '#idea-create'
                        + '-field-title',
                        document,
                    )!.value,
                problemStatement:
                    $textarea(
                        '#idea-create'
                        + '-field'
                        + '-problem',
                        document,
                    )!.value,
                targetUsers:
                    $input(
                        '#idea-create'
                        + '-field'
                        + '-target',
                        document,
                    )!.value,
            };
        } else if (
            state.currentStep === 2
        ) {
            state.formData = {
                ...state.formData,
                proposedSolution:
                    $textarea(
                        '#idea-create'
                        + '-field'
                        + '-solution',
                        document,
                    )!.value,
            };
        } else if (
            state.currentStep === 3
        ) {
            state.formData = {
                ...state.formData,
                expectedOutcome:
                    $textarea(
                        '#idea-create'
                        + '-field'
                        + '-outcome',
                        document,
                    )!.value,
                successMetrics:
                    $textarea(
                        '#idea-create'
                        + '-field'
                        + '-metrics',
                        document,
                    )!.value,
            };
        }
    }

    function bindWizardEvents() {
        const goBack = () => {
            if (state.currentStep > 1) {
                syncFormFields();
                state.currentStep =
                    state.currentStep
                    - 1;
                mutateWizard();
            } else {
                navigateTo('ideas');
            }
        };

        $('#idea-create-back-btn', document)
            ?.addEventListener(
                'click',
                goBack,
            );
        $('#idea-create-step-back', document)
            ?.addEventListener(
                'click',
                goBack,
            );

        $('#idea-create-step-next', document)
            ?.addEventListener(
                'click',
                async () => {
                    syncFormFields();
                    if (
                        !isStepComplete()
                    ) {
                        return;
                    }
                    if (
                        state.currentStep
                        < 3
                    ) {
                        state.currentStep =
                            state
                            .currentStep
                            + 1;
                        mutateWizard();
                    } else {
                        const ideaId =
                            crypto
                            .randomUUID();
                        const fd =
                            state
                            .formData;
                        await putIdea(
                            ideaId,
                            {
                                title:
                                    fd
                                    .title,
                                problem_statement:
                                    fd
                                    .problemStatement,
                                proposed_solution:
                                    fd
                                    .proposedSolution,
                                expected_outcome:
                                    fd
                                    .expectedOutcome,
                                success_metrics:
                                    fd
                                    .successMetrics,
                                description:
                                    fd
                                    .targetUsers,
                                status:
                                    'active',
                                score: 0,
                                estimated_impact:
                                    0,
                                estimated_duration:
                                    0,
                                estimated_cost:
                                    0,
                                priority:
                                    0,
                                category:
                                    '',
                                readiness:
                                    'incomplete',
                                impact_label:
                                    '',
                                effort_label:
                                    '',
                                risks:
                                    jsonArrayField(
                                        [],
                                    ),
                                assumptions:
                                    jsonArrayField(
                                        [],
                                    ),
                                alignments:
                                    jsonArrayField(
                                        [],
                                    ),
                                effort_duration_estimate:
                                    '',
                                effort_team_size:
                                    '',
                                cost_estimate:
                                    '',
                                cost_breakdown:
                                    '',
                            },
                        );
                        await putIdeaSubmission(
                            ideaId,
                            'current',
                        );
                        navigateTo(
                            'ideas',
                        );
                    }
                },
            );

        const selector =
            '#idea-create'
            + '-step-content'
            + ' input,'
            + ' #idea-create'
            + '-step-content'
            + ' textarea';
        document
            .querySelectorAll<
                HTMLInputElement
                | HTMLTextAreaElement
            >(selector)
            .forEach(field => {
                field.addEventListener(
                    'input',
                    () => {
                        syncFormFields();
                        const nextBtn =
                            $(
                                '#idea'
                                + '-create'
                                + '-step'
                                + '-next', document,
                            );
                        if (
                            nextBtn
                            instanceof
                            HTMLButtonElement
                        ) {
                            nextBtn
                            .disabled =
                                !isStepComplete();
                        }
                    },
                );
            });
    }

    mutateWizard();
}
