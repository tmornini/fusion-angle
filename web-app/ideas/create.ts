import {
    $, $input, $textarea,
    bindEnterToClick,
} from '../app/dom';
import {
    setHtml,
} from '../app/safe-html';
import { navigateTo } from '../app/core';
import {
    putIdea,
    putIdeaSubmission,
    jsonArrayField,
} from '../app/adapters';
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
            proposedSolution:
                $textarea(
                    '#idea-create'
                    + '-field'
                    + '-solution',
                    document,
                )!.value,
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

    function mutateSubmitButton(): void {
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
                    .isFormComplete();
        }
    }

    function bindEvents(): void {
        const goBack = () => {
            navigateTo('ideas');
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
                        target_users:
                            fd
                            .targetUsers,
                        proposed_solution:
                            fd
                            .proposedSolution,
                        expected_outcome:
                            fd
                            .expectedOutcome,
                        success_metrics:
                            fd
                            .successMetrics,
                        status:
                            'active',
                        position:
                            0,
                        readiness:
                            'incomplete',
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
                        mutateSubmitButton();
                    },
                );
            });

        const nextSel =
            '#idea-create-step-next';
        bindEnterToClick(
            '#idea-create-field-title',
            nextSel,
        );
    }

    renderPage();
}
