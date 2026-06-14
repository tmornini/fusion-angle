import {
    $required, isFormField,
} from '../app/dom.ts';
import {
    IdeaPresenter,
    IdeaEditPresenter,
    ideaDraftFromIdea,
    ideaPatchFromDraft,
    type IdeaFieldKey,
    type IdeaDraftFields,
} from '../app/presenters/index.ts';
import { showToast } from '../app/toast.ts';
import {
    createPageAbort,
    bindPageListeners,
} from '../app/page-lifecycle.ts';
import { reportFault } from '../app/error-helpers.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    navigateTo,
    trimStrings,
    openDialog,
    closeDialog,
    clickedOutside,
    parseDialogClick,
} from '../app/core.ts';
import {
    getIdea,
    postIdeaStateChange,
    putIdea,
    subscribeIdeaChanges,
    sessionContext,
    type IdeaWithSubmitter,
} from '../app/adapters/index.ts';

const { signal } = createPageAbort();

type PageState =
    | {
        kind: 'reading';
        view: IdeaWithSubmitter;
    }
    | {
        kind: 'editing';
        view: IdeaWithSubmitter;
        draft: IdeaDraftFields;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<IdeaFieldKey> =
    new Set([
        'title', 'problemStatement',
        'targetUsers', 'proposedSolution',
        'expectedOutcome', 'successMetrics',
    ]);

function isFieldKey(
    s: string | null,
): s is IdeaFieldKey {
    return s !== null
        && FIELDS.has(s as IdeaFieldKey);
}

type IdeaTransition =
    | 'in_review'
    | 'approved'
    | 'sent_back';

interface TransitionConfig {
    failureToast: string;
    successToast: string;
    successVariant: 'success' | 'info';
}

const TRANSITION_CONFIG:
    Record<IdeaTransition, TransitionConfig> = {
    'in_review': {
        failureToast: 'Failed to submit',
        successToast:
            'Submitted for review',
        successVariant: 'success',
    },
    'approved': {
        failureToast: 'Failed to approve',
        successToast:
            'Idea approved successfully',
        successVariant: 'success',
    },
    'sent_back': {
        failureToast: 'Failed to send back',
        successToast:
            'Idea sent back for revision',
        successVariant: 'info',
    },
};

async function transitionIdea(
    ideaId: string,
    toState: IdeaTransition,
): Promise<void> {
    if (!state) return;
    const ctx = sessionContext();
    const cfg = TRANSITION_CONFIG[toState]!;
    try {
        await postIdeaStateChange(
            ctx, ideaId, toState,
        );
    } catch (err) {
        reportFault(ctx, cfg.failureToast, err);
        return;
    }
    showToast(
        cfg.successToast,
        cfg.successVariant,
    );
    navigateTo('ideas');
}

function buildPresenter():
    IdeaPresenter | IdeaEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    const v = state.view;
    return state.kind === 'reading'
        ? new IdeaPresenter(
            v.idea,
            v.submitterName,
            v.submittedAt,
        )
        : new IdeaEditPresenter(
            v.idea, state.draft,
            v.submitterName,
            v.submittedAt,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const ideaId = params?.ideaId;
    if (!ideaId) {
        navigateTo('ideas');
        return;
    }

    const container = $required(
        '#idea-detail-content', document,
    );
    pageContainer = container;

    const ctx = sessionContext();
    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: () => getIdea(ctx, ideaId),
        retry: () => init(params),
        onData: view => {
            state = { kind: 'reading', view };
            buildPresenter()
                .renderShell(container);
            bindStableListeners(container);

            subscribeIdeaChanges(async () => {
                if (
                    !pageContainer || !state
                ) return;
                const fresh = await getIdea(
                    sessionContext(), ideaId,
                );
                state = {
                    kind: 'reading',
                    view: fresh,
                };
                rerender();
            });
        },
    });
}

function bindStableListeners(
    container: HTMLElement,
): void {
    bindPageListeners(container, {
        click: e => onClick(e),
        input: e => onInput(e),
        keydown: e => onContainerKeydown(e),
    }, signal);
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e),
        { signal },
    );
}

function onClick(
    e: MouseEvent,
): void {
    const target = e.target as Element | null;
    if (!target) return;

    if (
        target instanceof HTMLDialogElement
        && clickedOutside(target, e)
    ) {
        target.close();
        return;
    }

    const dialogIntent = parseDialogClick(target);
    if (dialogIntent) {
        if (dialogIntent.kind === 'open') {
            openDialog(dialogIntent.id);
        } else {
            closeDialog(dialogIntent.id);
        }
        return;
    }
    if (handleIdeaActions(target)) {
        return;
    }
}

function handleIdeaActions(
    target: Element,
): boolean {
    if (!state) return false;
    const actionEl = target.closest(
        '[data-idea-action]',
    );
    const action = actionEl?.getAttribute(
        'data-idea-action',
    );
    if (!action) return false;
    const ideaId = state.view.idea.idForLink();
    switch (action) {
        case 'back':
            navigateTo('ideas');
            return true;
        case 'edit':
            if (state.kind !== 'reading') {
                return true;
            }
            state = {
                kind: 'editing',
                view: state.view,
                draft: ideaDraftFromIdea(
                    state.view.idea,
                ),
            };
            rerender();
            return true;
        case 'cancel':
            if (state.kind !== 'editing') {
                return true;
            }
            state = {
                kind: 'reading',
                view: state.view,
            };
            rerender();
            return true;
        case 'save':
            void handleSave();
            return true;
        case 'convert':
            navigateTo('idea-convert', {
                ideaId, from: 'detail',
            });
            return true;
        case 'submit-review':
            void transitionIdea(
                ideaId, 'in_review',
            );
            return true;
        case 'approve':
            void transitionIdea(
                ideaId, 'approved',
            );
            return true;
        case 'send-back-confirm':
            void handleSendBackConfirm(ideaId);
            return true;
        default:
            return false;
    }
}

async function handleSendBackConfirm(
    ideaId: string,
): Promise<void> {
    closeDialog('approval-send-back');
    await transitionIdea(
        ideaId, 'sent_back',
    );
}

function onInput(
    e: Event,
): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target;
    if (!isFormField(target)) return;
    const field = target.getAttribute(
        'data-idea-field',
    );
    if (!isFieldKey(field)) return;
    state = {
        ...state,
        draft: {
            ...state.draft,
            [field]: target.value,
        },
    };
}

function onContainerKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    void handleSave();
}

function onDocumentKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Escape') return;
    if (!state || state.kind !== 'editing') {
        return;
    }
    e.preventDefault();
    state = {
        kind: 'reading',
        view: state.view,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const patch = ideaPatchFromDraft(
        state.draft,
    );
    const ideaId = state.view.idea.idForLink();
    const entity = state.view.entity;
    const ctx = sessionContext();
    try {
        await putIdea(ctx, ideaId, {
            ...entity,
            ...trimStrings(patch),
        });
    } catch (err) {
        log.error(
            'putIdea failed', 'ideas', err,
        );
        showToast(
            'Failed to save idea', 'error',
        );
        return;
    }
    showToast('Idea saved', 'success');
}
