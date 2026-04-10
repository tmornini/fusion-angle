import {
    $, $input, $textarea,
    bindEnterToClick,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    navigateTo,
    initDialog, closeDialog,
} from '../app/core';
import {
    getIdeaDetail,
    putIdea,
    type Idea,
} from '../app/adapters';
import {
    IdeaPresenter,
} from '../app/presenters';

let editEscapeHandler:
    ((e: KeyboardEvent) => void) | null
    = null;

function bindIdeaEvents(
    idea: Idea,
    ideaId: string,
    isEditing: boolean,
): void {
    if (editEscapeHandler) {
        document.removeEventListener(
            'keydown',
            editEscapeHandler,
        );
        editEscapeHandler = null;
    }
    if (isEditing) {
        editEscapeHandler = (
            e: KeyboardEvent,
        ) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                $(
                    '#idea-cancel-btn',
                    document,
                )?.click();
            }
        };
        document.addEventListener(
            'keydown',
            editEscapeHandler,
        );
        const saveSel = '#idea-save-btn';
        bindEnterToClick(
            '#idea-edit-title', saveSel,
        );
    }
    $('#idea-back-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('ideas'),
        );

    $('#idea-edit-btn', document)
        ?.addEventListener(
            'click',
            () => mutateIdeaPage(
                idea, ideaId, true,
            ),
        );

    $('#idea-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => mutateIdeaPage(
                idea, ideaId, false,
            ),
        );

    $('#idea-save-btn', document)
        ?.addEventListener(
            'click',
            async () => {
                const title =
                    $input(
                        '#idea-edit-title',
                        document,
                    )!.value;
                const description =
                    $textarea(
                        '#idea-edit-target-users',
                        document,
                    )!.value;
                const problemStatement =
                    $textarea(
                        '#idea-edit-problem',
                        document,
                    )!.value;
                const proposedSolution =
                    $textarea(
                        '#idea-edit-solution',
                        document,
                    )!.value;
                const expectedOutcome =
                    $textarea(
                        '#idea-edit-outcome',
                        document,
                    )!.value;
                const successMetrics =
                    $textarea(
                        '#idea-edit-metrics',
                        document,
                    )!.value;

                try {
                    await putIdea(ideaId, {
                        title,
                        description,
                        problem_statement:
                            problemStatement,
                        proposed_solution:
                            proposedSolution,
                        expected_outcome:
                            expectedOutcome,
                        success_metrics:
                            successMetrics,
                    });
                } catch {
                    showToast(
                        'Failed to save'
                        + ' idea',
                        'error',
                    );
                    return;
                }
                showToast(
                    'Idea saved',
                    'success',
                );
                const updated =
                    await getIdeaDetail(
                        ideaId,
                    );
                mutateIdeaPage(
                    updated,
                    ideaId,
                    false,
                );
            },
        );

    if (idea.isReviewable()) {
        bindApprovalEvents(ideaId);
    }
    $('#idea-convert-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-convert',
                { ideaId },
            ),
        );
    $(
        '#idea-submit-review-btn',
        document,
    )?.addEventListener(
        'click',
        async () => {
            try {
                await putIdea(ideaId, {
                    status: 'in-review',
                });
            } catch {
                showToast(
                    'Failed to submit',
                    'error',
                );
                return;
            }
            showToast(
                'Submitted for review',
                'success',
            );
            const updated =
                await getIdeaDetail(
                    ideaId,
                );
            mutateIdeaPage(
                updated, ideaId,
                false,
            );
        },
    );
}

function bindApprovalEvents(
    ideaId: string,
): void {
    $(
        '#approval-approve-btn',
        document,
    )?.addEventListener(
        'click',
        async () => {
            try {
                await putIdea(
                    ideaId,
                    { status: 'approved' },
                );
            } catch {
                showToast(
                    'Failed to approve',
                    'error',
                );
                return;
            }
            showToast(
                'Idea approved'
                + ' successfully',
                'success',
            );
            navigateTo('ideas');
        },
    );

    initDialog(
        'approval-reject',
        'approval-reject-btn',
    );
    $(
        '#approval-reject-confirm',
        document,
    )?.addEventListener(
        'click',
        async () => {
            try {
                await putIdea(
                    ideaId,
                    { status: 'sent-back' },
                );
            } catch {
                showToast(
                    'Failed to send back',
                    'error',
                );
                return;
            }
            showToast(
                'Idea sent back'
                + ' for revision',
                'info',
            );
            closeDialog(
                'approval-reject',
            );
            navigateTo('ideas');
        },
    );

    initDialog(
        'approval-clarify',
        'approval-clarify-btn',
    );
    $(
        '#approval-clarify-confirm',
        document,
    )?.addEventListener(
        'click',
        () => {
            showToast(
                'Clarification'
                + ' requested',
                'info',
            );
            closeDialog(
                'approval-clarify',
            );
        },
    );


}

function mutateIdeaPage(
    idea: Idea,
    ideaId: string,
    isEditing: boolean,
): void {
    const container = $(
        '#idea-detail-content', document,
    );
    if (!container) return;
    const presenter =
        new IdeaPresenter(idea);
    setHtml(
        container,
        presenter.buildDetailView(
            ideaId, isEditing,
        ),
    );
    bindIdeaEvents(
        idea, ideaId, isEditing,
    );
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const ideaId = params?.ideaId;
    if (!ideaId) { navigateTo('ideas'); return; }

    const container = $(
        '#idea-detail-content', document,
    );
    if (!container) return;

    const idea = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => getIdeaDetail(ideaId),
        () => init(params),
    );
    if (!idea) return;

    mutateIdeaPage(idea, ideaId, false);
}
