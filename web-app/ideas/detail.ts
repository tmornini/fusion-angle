import { $, $textarea } from '../app/dom.ts';
import {
    IdeaPresenter,
    IdeaEditPresenter,
    ideaDraftFromIdea,
    ideaPatchFromDraft,
    type IdeaFieldKey,
    type IdeaDraftFields,
} from '../app/presenters/index.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    navigateTo,
    trimStrings,
    openDialog,
    closeDialog,
} from '../app/core.ts';
import {
    getIdea,
    getIdeaEntity,
    postActivity,
    putIdea,
    subscribeToIdeaChanges,
    createFetchContext,
    type Idea,
} from '../app/adapters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

const NO_FEEDBACK = '';

type PageState =
    | {
        kind: 'reading';
        idea: Idea;
    }
    | {
        kind: 'editing';
        idea: Idea;
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
    | 'in-review'
    | 'approved'
    | 'sent-back';

interface TransitionConfig {
    failureToast: string;
    successToast: string;
    successVariant: 'success' | 'info';
    activityAction: string;
}

const TRANSITION_CONFIG:
    Record<IdeaTransition, TransitionConfig> = {
    'in-review': {
        failureToast: 'Failed to submit',
        successToast:
            'Submitted for review',
        successVariant: 'success',
        activityAction:
            'submitted idea for review',
    },
    'approved': {
        failureToast: 'Failed to approve',
        successToast:
            'Idea approved successfully',
        successVariant: 'success',
        activityAction: 'approved idea',
    },
    'sent-back': {
        failureToast: 'Failed to send back',
        successToast:
            'Idea sent back for revision',
        successVariant: 'info',
        activityAction:
            'sent idea back for revision',
    },
};

async function transitionIdea(
    ideaId: string,
    toStatus: IdeaTransition,
    feedback: string,
): Promise<void> {
    const cfg = TRANSITION_CONFIG[toStatus]!;
    let title = '';
    try {
        const entity =
            await getIdeaEntity(ideaId);
        title = entity.title;
        await putIdea(
            ideaId,
            { ...entity, status: toStatus },
        );
    } catch (err) {
        log.error(
            'putIdea failed', 'ideas', err,
        );
        showToast(cfg.failureToast, 'error');
        return;
    }
    await postActivity({
        type: 'status_changed',
        action: cfg.activityAction,
        target: title,
        status: toStatus,
        feedback,
    });
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
    return state.kind === 'reading'
        ? new IdeaPresenter(state.idea)
        : new IdeaEditPresenter(
            state.idea, state.draft,
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

    const container = $(
        '#idea-detail-content', document,
    );
    if (!container) return;
    pageContainer = container;

    const ctx = createFetchContext();
    const idea = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => getIdea(ideaId, ctx),
        () => init(params),
    );
    if (!idea) return;

    state = { kind: 'reading', idea };
    buildPresenter().renderShell(container);
    bindStableListeners(container);

    subscribeToIdeaChanges(async () => {
        if (!pageContainer || !state) return;
        const fresh = await getIdea(
            ideaId, createFetchContext(),
        );
        state = { kind: 'reading', idea: fresh };
        rerender();
    });
}

function bindStableListeners(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click', e => onClick(e),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
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

    if (handleDialogClicks(target)) return;
    if (handleIdeaActions(target)) {
        return;
    }
}

function handleDialogClicks(
    target: Element,
): boolean {
    if (target.classList.contains(
        'dialog-backdrop',
    )) {
        const id = target.getAttribute(
            'data-dialog-id',
        );
        if (id) closeDialog(id);
        return true;
    }
    const openEl = target.closest(
        '[data-dialog-open]',
    );
    if (openEl) {
        const id = openEl.getAttribute(
            'data-dialog-open',
        );
        if (id) openDialog(id);
        return true;
    }
    const cancelEl = target.closest(
        '[data-dialog-cancel]',
    );
    if (cancelEl) {
        const id = cancelEl.getAttribute(
            'data-dialog-cancel',
        );
        if (id) closeDialog(id);
        return true;
    }
    return false;
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
    const ideaId = state.idea.idForLink();
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
                idea: state.idea,
                draft: ideaDraftFromIdea(
                    state.idea,
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
                idea: state.idea,
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
                ideaId, 'in-review',
                NO_FEEDBACK,
            );
            return true;
        case 'approve':
            void transitionIdea(
                ideaId, 'approved',
                NO_FEEDBACK,
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
    const ta = $textarea(
        '#approval-send-back-feedback',
        document,
    );
    if (!ta) {
        throw new Error(
            'Required:'
            + ' #approval-send-back-feedback',
        );
    }
    const feedback = ta.value.trim();
    closeDialog('approval-send-back');
    await transitionIdea(
        ideaId, 'sent-back', feedback,
    );
}

function onInput(
    e: Event,
): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    if (!target) return;
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
        idea: state.idea,
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
    const ideaId = state.idea.idForLink();
    try {
        const entity = await getIdeaEntity(
            ideaId,
        );
        await putIdea(ideaId, {
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
