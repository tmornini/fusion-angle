import {
    $, isFormField,
} from '../app/dom.ts';
import {
    HumanWorkerDetailPresenter,
    HumanWorkerDetailEditPresenter,
    humanWorkerDraftFromWorker,
    humanWorkerPatchFromDraft,
    isHumanWorkerFieldKey,
    type HumanWorkerDraftFields,
    AIWorkerDetailPresenter,
    AIWorkerDetailEditPresenter,
    aiWorkerDraftFromWorker,
    aiWorkerPatchFromDraft,
    isAIWorkerFieldKey,
    type AIWorkerDraftFields,
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
} from '../app/core.ts';
import {
    createRequestContext,
    getHumanWorker,
    getHumanWorkerRow,
    putHumanWorker,
    postHumanWorkerStateChange,
    subscribeHumanWorkerChanges,
    getAIWorker,
    getAIWorkerRow,
    putAIWorker,
    subscribeAIWorkerChanges,
    HumanWorker,
    AIWorker,
    type Worker,
    type WorkerState,
} from '../app/adapters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type HumanState =
    | {
        kind: 'reading';
        variant: 'human';
        worker: HumanWorker;
    }
    | {
        kind: 'editing';
        variant: 'human';
        worker: HumanWorker;
        draft: HumanWorkerDraftFields;
    };

type AIState =
    | {
        kind: 'reading';
        variant: 'ai';
        worker: AIWorker;
    }
    | {
        kind: 'editing';
        variant: 'ai';
        worker: AIWorker;
        draft: AIWorkerDraftFields;
    };

type PageState = HumanState | AIState;

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

function buildPresenter():
    | HumanWorkerDetailPresenter
    | HumanWorkerDetailEditPresenter
    | AIWorkerDetailPresenter
    | AIWorkerDetailEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    if (state.variant === 'human') {
        return state.kind === 'reading'
            ? new HumanWorkerDetailPresenter(
                state.worker,
            )
            : new HumanWorkerDetailEditPresenter(
                state.worker, state.draft,
            );
    }
    return state.kind === 'reading'
        ? new AIWorkerDetailPresenter(
            state.worker,
        )
        : new AIWorkerDetailEditPresenter(
            state.worker, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

async function loadWorkerByEitherKind(
    workerId: string,
): Promise<Worker | null> {
    const ctx = createRequestContext();
    try {
        return await getHumanWorker(
            ctx, workerId,
        );
    } catch (errHuman) {
        try {
            return await getAIWorker(
                ctx, workerId,
            );
        } catch (errAi) {
            log.error(
                'worker lookup failed'
                + ' for both kinds',
                'workers',
                { errHuman, errAi },
            );
            return null;
        }
    }
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const workerId = params?.workerId;
    if (!workerId) {
        navigateTo('workers');
        return;
    }

    const container = $(
        '#worker-detail-content', document,
    );
    if (!container) return;
    pageContainer = container;

    const worker = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => loadWorkerByEitherKind(workerId),
        () => init(params),
    );
    if (!worker) {
        navigateTo('workers');
        return;
    }

    if (worker.kind === 'human') {
        state = {
            kind: 'reading',
            variant: 'human',
            worker,
        };
    } else {
        state = {
            kind: 'reading',
            variant: 'ai',
            worker,
        };
    }
    buildPresenter().renderShell(container);
    bindStableListeners(container);

    subscribeHumanWorkerChanges(
        () => void refresh(workerId),
    );
    subscribeAIWorkerChanges(
        () => void refresh(workerId),
    );
}

export function reduceRefresh(
    current: PageState,
    fresh: Worker | null,
): PageState {
    if (current.kind === 'editing') return current;
    if (fresh === null) return current;
    if (fresh.kind === 'human') {
        return {
            kind: 'reading',
            variant: 'human',
            worker: fresh,
        };
    }
    return {
        kind: 'reading',
        variant: 'ai',
        worker: fresh,
    };
}

async function refresh(
    workerId: string,
): Promise<void> {
    if (!pageContainer || !state) return;
    const fresh = await loadWorkerByEitherKind(
        workerId,
    );
    state = reduceRefresh(state, fresh);
    rerender();
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
        'change', e => onInput(e),
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

function onClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    const actionEl = target.closest(
        '[data-worker-action]',
    );
    const action = actionEl?.getAttribute(
        'data-worker-action',
    );
    if (action === 'back') {
        navigateTo('workers');
        return;
    }
    if (action === 'edit') {
        beginEdit();
        return;
    }
    if (action === 'cancel') {
        cancelEdit();
        return;
    }
    if (action === 'save') {
        void handleSave();
        return;
    }

    const chip = target.closest(
        '.strength-chip',
    );
    if (
        chip
        && state
        && state.kind === 'editing'
        && state.variant === 'human'
    ) {
        const name = chip.getAttribute(
            'data-strength',
        );
        if (name) {
            const cur = state.draft.strengths;
            const i = cur.indexOf(name);
            const next = i >= 0
                ? cur.filter(
                    (_, idx) => idx !== i,
                )
                : [...cur, name];
            state = {
                ...state,
                draft: {
                    ...state.draft,
                    strengths: next,
                },
            };
            rerender();
        }
    }
}

function beginEdit(): void {
    if (!state || state.kind !== 'reading') {
        return;
    }
    if (state.variant === 'human') {
        state = {
            kind: 'editing',
            variant: 'human',
            worker: state.worker,
            draft: humanWorkerDraftFromWorker(
                state.worker,
            ),
        };
    } else {
        state = {
            kind: 'editing',
            variant: 'ai',
            worker: state.worker,
            draft: aiWorkerDraftFromWorker(
                state.worker,
            ),
        };
    }
    rerender();
}

function cancelEdit(): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    if (state.variant === 'human') {
        state = {
            kind: 'reading',
            variant: 'human',
            worker: state.worker,
        };
    } else {
        state = {
            kind: 'reading',
            variant: 'ai',
            worker: state.worker,
        };
    }
    rerender();
}

function onInput(e: Event): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target;
    if (!isFormField(target)) return;
    const field = target.getAttribute(
        'data-worker-field',
    );
    if (state.variant === 'human') {
        if (!isHumanWorkerFieldKey(field)) return;
        if (field === 'state') {
            state = {
                ...state,
                draft: {
                    ...state.draft,
                    state:
                        target.value as
                            WorkerState,
                },
            };
            return;
        }
        state = {
            ...state,
            draft: {
                ...state.draft,
                [field]: target.value,
            },
        };
        return;
    }
    if (!isAIWorkerFieldKey(field)) return;
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
    cancelEdit();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    if (state.variant === 'human') {
        await saveHumanWorker(state);
    } else {
        await saveAIWorker(state);
    }
}

async function saveHumanWorker(
    s: Extract<
        HumanState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const workerId = s.worker.idForLink();
    const ctx = createRequestContext();
    let row;
    try {
        row = await getHumanWorkerRow(
            ctx, workerId,
        );
    } catch (err) {
        log.error(
            'getHumanWorkerRow failed',
            'workers', err,
        );
        showToast(
            'Failed to save worker', 'error',
        );
        return;
    }
    const patch = trimStrings(
        humanWorkerPatchFromDraft(s.draft),
    );
    const { id: _id, ...rest } = row;
    const next = { ...rest, ...patch };
    const stateChanged =
        s.draft.state !== s.worker.stateValue();
    try {
        await putHumanWorker(
            ctx, workerId, next,
        );
        if (stateChanged) {
            await postHumanWorkerStateChange(
                ctx, workerId, s.draft.state,
            );
        }
    } catch (err) {
        const detail = err instanceof Error
            ? err.message
            : String(err);
        log.error(
            'human worker save failed',
            'workers', err,
        );
        showToast(
            `Failed to save worker: ${detail}`,
            'error',
        );
        return;
    }
    showToast('Worker saved', 'success');
}

async function saveAIWorker(
    s: Extract<
        AIState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const workerId = s.worker.idForLink();
    const ctx = createRequestContext();
    let row;
    try {
        row = await getAIWorkerRow(
            ctx, workerId,
        );
    } catch (err) {
        log.error(
            'getAIWorkerRow failed',
            'workers', err,
        );
        showToast(
            'Failed to save AI worker',
            'error',
        );
        return;
    }
    // The validator forbids an empty
    // auth_token; the patch includes one
    // only when the user typed an override.
    // We merge patch on top of the existing
    // row so the prior token is preserved
    // by default.
    const patch = trimStrings(
        aiWorkerPatchFromDraft(s.draft),
    );
    const { id: _id, ...rest } = row;
    try {
        await putAIWorker(
            ctx, workerId,
            { ...rest, ...patch },
        );
    } catch (err) {
        log.error(
            'putAIWorker failed',
            'workers', err,
        );
        showToast(
            'Failed to save AI worker',
            'error',
        );
        return;
    }
    showToast(
        'AI worker saved', 'success',
    );
}
