import {
    $, $input, $textarea,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import {
    navigateTo, initDialog, closeDialog,
} from '../app/core';
import {
    getIdeaForApproval,
    getIdea,
    putIdea,
} from '../app/adapters';
import {
    IdeaApprovalPresenter,
} from '../app/presenters/idea-approval';

async function saveIdea(
    id: string,
    title: string,
    description: string,
): Promise<void> {
    const existing = await getIdea(id);
    await putIdea(id, {
        ...existing,
        title,
        description,
    });
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const rawId = params?.['id'];
    if (!rawId) {
        navigateTo('idea-review-queue');
        return;
    }
    const id: string = rawId;

    let presenter:
        IdeaApprovalPresenter;

    function renderPage(): void {
        const root = $(
            '#approval-content',
            document,
        );
        if (!root) return;
        setHtml(
            root,
            presenter
                .buildApprovalPage(),
        );
        bindEvents();
    }

    function bindEvents(): void {
        $(
            '#approval-approve-btn',
            document,
        )?.addEventListener(
            'click',
            async () => {
                const existingIdea =
                    await getIdea(id);
                await putIdea(id, {
                    ...existingIdea,
                    status: 'approved',
                });
                showToast(
                    'Idea approved'
                    + ' successfully',
                    'success',
                );
                navigateTo(
                    'idea-review-queue',
                );
            },
        );

        $(
            '#approval-back-btn',
            document,
        )?.addEventListener(
            'click',
            () => navigateTo(
                'idea-review-queue',
            ),
        );

        $(
            '#approval-edit-btn',
            document,
        )?.addEventListener(
            'click',
            () => {
                presenter
                    .setEditing(true);
                renderPage();
            },
        );

        $(
            '#approval-cancel-edit-btn',
            document,
        )?.addEventListener(
            'click',
            () => {
                presenter
                    .setEditing(false);
                renderPage();
            },
        );

        $(
            '#approval-save-edit-btn',
            document,
        )?.addEventListener(
            'click',
            async () => {
                const title =
                    $input(
                        '#approval-edit'
                        + '-title',
                        document,
                    )!.value;
                const description =
                    $textarea(
                        '#approval-edit'
                        + '-description',
                        document,
                    )!.value;
                try {
                    await saveIdea(
                        id,
                        title,
                        description,
                    );
                } catch {
                    showToast(
                        'Failed to'
                        + ' save idea',
                        'error',
                    );
                    return;
                }
                showToast(
                    'Idea saved',
                    'success',
                );
                const updatedIdea =
                    await getIdeaForApproval(
                        id,
                    );
                presenter =
                    new IdeaApprovalPresenter(
                        updatedIdea,
                    );
                renderPage();
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
                const existingIdea =
                    await getIdea(id);
                await putIdea(id, {
                    ...existingIdea,
                    status: 'sent-back',
                });
                showToast(
                    'Idea sent back'
                    + ' for revision',
                    'info',
                );
                closeDialog(
                    'approval-reject',
                );
                navigateTo(
                    'idea-review-queue',
                );
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

        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape') {
                    closeDialog(
                        'approval-reject',
                    );
                    closeDialog(
                        'approval-clarify',
                    );
                }
            },
        );
    }

    const root = $(
        '#approval-content',
        document,
    );
    if (!root) return;

    const idea =
        await withLoadingState(
            root,
            buildSkeleton('detail', 4),
            () => getIdeaForApproval(id),
            () => init(),
        );
    if (!idea) return;

    presenter =
        new IdeaApprovalPresenter(idea);
    renderPage();
}
