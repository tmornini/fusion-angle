import {
    $, $input, $textarea,
} from '../app/dom';
import {
    setHtml,
} from '../app/safe-html';
import { navigateTo } from '../app/core';
import {
    putIdea,
    putIdeaSubmission,
} from '../app/adapters';
import {
    jsonArrayField,
} from '../../api/types';
import {
    IdeaCreatePresenter,
} from '../app/presenters';

export async function init():
    Promise<void> {
    const presenter =
        new IdeaCreatePresenter();

    function renderPage(): void {
        const root =
            $('#create-content', document);
        if (!root) return;
        setHtml(root, presenter.render());
        bindEvents();
    }

    function syncFormFields(): void {
        const step =
            presenter.currentStep();
        if (step === 1) {
            presenter.syncFields({
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
            });
        } else if (step === 2) {
            presenter.syncFields({
                proposedSolution:
                    $textarea(
                        '#idea-create'
                        + '-field'
                        + '-solution',
                        document,
                    )!.value,
            });
        } else if (step === 3) {
            presenter.syncFields({
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
            });
        }
    }

    function mutateNextButton(): void {
        const btn = $(
            '#idea-create-step-next',
            document,
        );
        if (
            btn instanceof
            HTMLButtonElement
        ) {
            btn.disabled =
                !presenter
                    .isStepComplete();
        }
    }

    function bindEvents(): void {
        const goBack = () => {
            syncFormFields();
            if (!presenter.prevStep()) {
                navigateTo('ideas');
                return;
            }
            renderPage();
        };

        $(
            '#idea-create-back-btn',
            document,
        )?.addEventListener(
            'click', goBack,
        );
        $(
            '#idea-create-step-back',
            document,
        )?.addEventListener(
            'click', goBack,
        );

        $(
            '#idea-create-step-next',
            document,
        )?.addEventListener(
            'click',
            async () => {
                syncFormFields();
                if (
                    !presenter.isLastStep()
                ) {
                    presenter.nextStep();
                    renderPage();
                    return;
                }
                const ideaId =
                    crypto.randomUUID();
                const fd =
                    presenter.formData();
                await putIdea(
                    ideaId,
                    {
                        title:
                            fd.title,
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
                navigateTo('ideas');
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
                        mutateNextButton();
                    },
                );
            });
    }

    renderPage();
}
