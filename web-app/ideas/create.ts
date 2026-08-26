import {
    $input, $required, $textarea,
    bindEnterToClick,
} from '../app/dom.ts';
import {
    setHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    sessionContext,
    getIdeaEntities,
    postIdeaCreation,
    putIdeaSubmission,
    generateIdentifier,
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
                if (
                    !ideaCreateDraftIsComplete(
                        formState,
                    )
                ) {
                    showToast(
                        'Title, problem,'
                            + ' solution, and'
                            + ' outcome are'
                            + ' required',
                        'error',
                    );
                    return;
                }
                const ctx = sessionContext();
                const ideaId =
                    generateIdentifier();
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
                    generateIdentifier(),
                    ideaId,
                );
                navigateTo('ideas');
            },
        );

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
