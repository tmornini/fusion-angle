import {
    $, $input, $textarea,
    bindEnterToClick,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import { log } from '../app/logger';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    navigateTo,
    trimStrings,
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

const escapeController =
    { current: new AbortController() };

function bindIdeaEvents(
    idea: Idea,
    isEditing: boolean,
): void {
    escapeController.current.abort();
    escapeController.current =
        new AbortController();
    if (isEditing) {
        document.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    $(
                        '#idea-cancel-btn',
                        document,
                    )?.click();
                }
            },
            {
                signal: escapeController
                    .current.signal,
            },
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
                idea, true,
            ),
        );

    $('#idea-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => mutateIdeaPage(
                idea, false,
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
                const problemStatement =
                    $textarea(
                        '#idea-edit-problem',
                        document,
                    )!.value;
                const targetUsers =
                    $input(
                        '#idea-edit-target',
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
                    await putIdea(
                        idea.id,
                        trimStrings({
                            title,
                            problem_statement:
                                problemStatement,
                            target_users:
                                targetUsers,
                            proposed_solution:
                                proposedSolution,
                            expected_outcome:
                                expectedOutcome,
                            success_metrics:
                                successMetrics,
                        }),
                    );
                } catch (err) {
                    log.error(
                        'putIdea failed',
                        'ideas',
                        err,
                    );
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
                        idea.id,
                    );
                mutateIdeaPage(
                    updated, false,
                );
            },
        );

    if (idea.isReviewable()) {
        bindApprovalEvents(idea.id);
    }
    $('#idea-convert-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo(
                'idea-convert',
                {
                    ideaId: idea.id,
                    from: 'detail',
                },
            ),
        );
    $(
        '#idea-submit-review-btn',
        document,
    )?.addEventListener(
        'click',
        async () => {
            try {
                await putIdea(idea.id, {
                    status: 'in-review',
                });
            } catch (err) {
                log.error(
                    'putIdea failed',
                    'ideas',
                    err,
                );
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
            navigateTo('ideas');
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
            } catch (err) {
                log.error(
                    'putIdea failed',
                    'ideas',
                    err,
                );
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
            } catch (err) {
                log.error(
                    'putIdea failed',
                    'ideas',
                    err,
                );
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

}

function mutateIdeaPage(
    idea: Idea,
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
            idea.id, isEditing,
        ),
    );
    bindIdeaEvents(idea, isEditing);
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

    mutateIdeaPage(idea, false);
}
