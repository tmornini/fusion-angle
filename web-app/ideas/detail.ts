import {
    $, $input, $textarea,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    navigateTo, SECONDS_PER_DAY,
} from '../app/core';
import {
    getIdeaDetail,
    putIdea,
    type Idea,
} from '../app/adapters';
import {
    IdeaPresenter,
} from '../app/presenters';

function bindIdeaEvents(
    idea: Idea,
    ideaId: string,
    isEditing: boolean,
): void {
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
                const category =
                    $input(
                        '#idea-edit-category',
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
                const impact = Number(
                    $input(
                        '#idea-edit-impact',
                        document,
                    )!.value,
                );
                const duration = Number(
                    $input(
                        '#idea-edit-duration',
                        document,
                    )!.value,
                );
                const cost = Number(
                    $input(
                        '#idea-edit-cost',
                        document,
                    )!.value,
                );

                try {
                    await putIdea(ideaId, {
                        title,
                        description,
                        category,
                        problem_statement:
                            problemStatement,
                        proposed_solution:
                            proposedSolution,
                        expected_outcome:
                            expectedOutcome,
                        success_metrics:
                            successMetrics,
                        estimated_impact:
                            impact,
                        estimated_duration:
                            duration
                            * SECONDS_PER_DAY,
                        estimated_cost:
                            cost,
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

    $('#idea-review-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo(
                'approval-detail',
                { id: ideaId },
            ),
        );
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
