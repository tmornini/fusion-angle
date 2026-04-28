import {
    $, $input, $textarea,
    bindEnterToClick,
} from '../app/dom.ts';
import {
    setHtml,
} from '../app/safe-html.ts';
import { navigateTo } from '../app/core.ts';
import {
    postActivity,
    putIdea,
    putIdeaSubmission,
    jsonArrayField,
    generateId,
} from '../app/adapters/index.ts';
import {
    IdeaCreatePresenter,
    EMPTY_IDEA_CREATE_DRAFT,
    ideaCreateDraftIsComplete,
} from '../app/presenters/index.ts';
import type {
    IdeaCreateDraft,
} from '../app/presenters/index.ts';

export async function init():
    Promise<void> {
    let formState: IdeaCreateDraft = {
        ...EMPTY_IDEA_CREATE_DRAFT,
    };

    function renderPage(): void {
        const root =
            $('#create-content', document);
        if (!root) return;
        setHtml(
            root,
            new IdeaCreatePresenter(formState)
                .render(),
        );
        bindEvents();
    }

    function readFormFromDom(
    ): IdeaCreateDraft {
        return {
            title:
                $input(
                    '#idea-create'
                    + '-field-title',
                    document,
                )!.value.trim(),
            problemStatement:
                $textarea(
                    '#idea-create'
                    + '-field'
                    + '-problem',
                    document,
                )!.value.trim(),
            targetUsers:
                $input(
                    '#idea-create'
                    + '-field'
                    + '-target',
                    document,
                )!.value.trim(),
            proposedSolution:
                $textarea(
                    '#idea-create'
                    + '-field'
                    + '-solution',
                    document,
                )!.value.trim(),
            expectedOutcome:
                $textarea(
                    '#idea-create'
                    + '-field'
                    + '-outcome',
                    document,
                )!.value.trim(),
            successMetrics:
                $textarea(
                    '#idea-create'
                    + '-field'
                    + '-metrics',
                    document,
                )!.value.trim(),
        };
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
                !ideaCreateDraftIsComplete(
                    formState,
                );
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
                formState = readFormFromDom();
                const ideaId =
                    generateId();
                await putIdea(
                    ideaId,
                    {
                        title:
                            formState.title,
                        problem_statement:
                            formState
                            .problemStatement,
                        target_users:
                            formState
                            .targetUsers,
                        proposed_solution:
                            formState
                            .proposedSolution,
                        expected_outcome:
                            formState
                            .expectedOutcome,
                        success_metrics:
                            formState
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
                    generateId(),
                    ideaId,
                    'current',
                );
                await postActivity({
                    type: 'idea_created',
                    action:
                        'submitted new idea',
                    target: formState.title,
                    status: '',
                    feedback: '',
                });
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
                        formState =
                            readFormFromDom();
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
