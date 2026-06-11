import {
    $, $$, $input, $required, $textarea,
    bindEnterToClick,
} from '../app/dom.ts';
import {
    setHtml,
} from '../app/safe-html.ts';
import { navigateTo } from '../app/core.ts';
import {
    sessionContext,
    getIdeaEntities,
    postIdeaCreation,
    putIdeaSubmission,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';
import {
    nextPosition,
} from '../app/drag-reorder-positions.ts';
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
        const root = $required(
            '#create-content', document,
        );
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

        $required(
            '#idea-create-back-btn',
            document,
        ).addEventListener(
            'click', goBack,
        );
        $required(
            '#idea-create-step-back',
            document,
        ).addEventListener(
            'click', goBack,
        );

        $required(
            '#idea-create-step-next',
            document,
        ).addEventListener(
            'click',
            async () => {
                formState = readFormFromDom();
                const ctx = sessionContext();
                const ideaId =
                    generateCryptoSafeBase62();
                const existing =
                    await getIdeaEntities(ctx);
                const position = nextPosition(
                    existing.map(r => r.position),
                );
                await postIdeaCreation(
                    ctx,
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
                        position,
                    },
                    'active',
                );
                await putIdeaSubmission(
                    ctx,
                    generateCryptoSafeBase62(),
                    ideaId,
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
        $$(selector, document)
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
            document,
        );
    }

    renderPage();
}
