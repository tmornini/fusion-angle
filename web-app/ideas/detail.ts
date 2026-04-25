import { $, $textarea } from '../app/dom';
import {
    IdeaPresenter,
    type IdeaFieldKey,
} from '../app/presenters';
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
    openDialog,
    closeDialog,
} from '../app/core';
import {
    getIdea,
    getIdeaEntity,
    postActivity,
    putIdea,
    ideaChanged,
} from '../app/adapters';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter: IdeaPresenter | null = null;
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
    feedback?: string,
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
        feedback: feedback ?? '',
    });
    showToast(
        cfg.successToast,
        cfg.successVariant,
    );
    navigateTo('ideas');
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

    const idea = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => getIdea(ideaId),
        () => init(params),
    );
    if (!idea) return;

    presenter = new IdeaPresenter(idea);
    presenter.renderShell(container);
    bindStableListeners(container, presenter);

    ideaChanged.subscribe(async () => {
        if (!presenter || !pageContainer) {
            return;
        }
        const fresh = await getIdea(ideaId);
        presenter.update(fresh);
        presenter.renderUpdate(pageContainer);
    });
}

function bindStableListeners(
    container: HTMLElement,
    p: IdeaPresenter,
): void {
    container.addEventListener(
        'click', e => onClick(e, container, p),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e, p),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e, container, p),
        { signal },
    );
}

function onClick(
    e: MouseEvent,
    container: HTMLElement,
    p: IdeaPresenter,
): void {
    const target = e.target as Element | null;
    if (!target) return;

    if (handleDialogClicks(target)) return;
    if (handleIdeaActions(target, container, p)) {
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
    container: HTMLElement,
    p: IdeaPresenter,
): boolean {
    const actionEl = target.closest(
        '[data-idea-action]',
    );
    const action = actionEl?.getAttribute(
        'data-idea-action',
    );
    if (!action) return false;
    const ideaId = p.idForLink();
    switch (action) {
        case 'back':
            navigateTo('ideas');
            return true;
        case 'edit':
            p.beginEdit();
            p.renderUpdate(container);
            return true;
        case 'cancel':
            p.cancelEdit();
            p.renderUpdate(container);
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
    const ta = $textarea(
        '#approval-send-back-feedback',
        document,
    );
    const feedback =
        ta?.value.trim() || undefined;
    closeDialog('approval-send-back');
    await transitionIdea(
        ideaId, 'sent-back', feedback,
    );
}

function onInput(
    e: Event,
    p: IdeaPresenter,
): void {
    const target = e.target as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-idea-field',
    );
    if (!isFieldKey(field)) return;
    p.setDraftField(field, target.value);
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
    container: HTMLElement,
    p: IdeaPresenter,
): void {
    if (e.key !== 'Escape') return;
    if (!p.isEditing()) return;
    e.preventDefault();
    p.cancelEdit();
    p.renderUpdate(container);
}

async function handleSave(): Promise<void> {
    if (!presenter) return;
    if (!presenter.isEditing()) return;
    const patch = presenter.buildEntityPatch();
    const ideaId = presenter.idForLink();
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
