import {
    $, $input, $select, $textarea,
    populateIcons,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    iconPersonPlus, iconSearch,
    iconSend,
} from '../app/icons.ts';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    createRequestContext,
    getWorkers,
    postHumanWorkerCreation,
    postAIWorkerCreation,
    getCurrentHumanWorker,
    jsonArrayField,
    jsonObjectField,
    generateCryptoSafeBase62,
    subscribeHumanWorkerChanges,
    subscribeAIWorkerChanges,
} from '../app/adapters/index.ts';
import {
    ManagedWorkersPresenter,
    buildInitialManagedWorkersState,
    applyManagedWorkersSearch,
    applyManagedWorkersKind,
    buildModelOptgroups,
    type ManagedWorkersState,
    type WorkerKindFilter,
} from '../app/presenters/index.ts';

const DEFAULT_DIM = 50;

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let workersState:
    ManagedWorkersState | null = null;
let workerListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const workerList = $('#worker-list', document);
    if (!workerList) return;

    populateIcons([
        ['#add-worker-btn-icon', iconPersonPlus(16, '')],
        ['#worker-search-icon', iconSearch(16, '')],
        ['#add-worker-dialog-icon', iconPersonPlus(20, '')],
        ['#add-worker-submit-icon', iconSend(16, '')],
    ]);
    initWorkerListFilters();
    bindAddWorkerDialog();
    const modelSelect = $select('#ai-model', document);
    if (modelSelect) {
        setHtml(
            modelSelect,
            html`<option value="" disabled selected
                >Select a model…</option>${
                buildModelOptgroups('')
            }`,
        );
    }

    const ctx = createRequestContext();
    const loaded = await withLoadingState(
        workerList,
        buildSkeleton('table', 5),
        async () => {
            const [workers, currentRow] =
                await Promise.all([
                    getWorkers(ctx),
                    getCurrentHumanWorker(ctx),
                ]);
            return { workers, currentRow };
        },
        init,
    );
    if (!loaded) return;

    workersState =
        buildInitialManagedWorkersState(
            loaded.workers, loaded.currentRow.id,
        );

    workerListEl = workerList;
    rerenderWorkers();
    workerListEl.addEventListener(
        'click', onWorkerListClick,
        { signal },
    );

    subscribeHumanWorkerChanges(
        () => void refresh(),
    );
    subscribeAIWorkerChanges(
        () => void refresh(),
    );
}

async function refresh(): Promise<void> {
    if (!workersState || !workerListEl) return;
    const fresh = await getWorkers(
        createRequestContext(),
    );
    workersState =
        buildInitialManagedWorkersState(
            fresh,
            workersState.currentWorkerId,
        );
    rerenderWorkers();
}

function rerenderWorkers(): void {
    if (!workersState || !workerListEl) return;
    new ManagedWorkersPresenter(workersState)
        .renderList(workerListEl);
}

function initWorkerListFilters(): void {
    $input('#worker-search', document)
        ?.addEventListener(
            'input', onSearchInput,
            { signal },
        );
    document.querySelectorAll<HTMLElement>(
        '[data-kind-chip]',
    ).forEach(chip => {
        chip.addEventListener(
            'click', onKindChipClick,
            { signal },
        );
    });
}

function onSearchInput(e: Event): void {
    if (!workersState || !workerListEl) return;
    const target =
        e.target as HTMLInputElement;
    workersState = applyManagedWorkersSearch(
        workersState, target.value,
    );
    rerenderWorkers();
}

function onKindChipClick(e: Event): void {
    if (!workersState || !workerListEl) return;
    const target = e.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const kind = target.getAttribute(
        'data-kind-chip',
    );
    if (
        kind !== 'all'
        && kind !== 'human'
        && kind !== 'ai'
    ) return;
    workersState = applyManagedWorkersKind(
        workersState, kind as WorkerKindFilter,
    );
    document.querySelectorAll<HTMLElement>(
        '[data-kind-chip]',
    ).forEach(chip => {
        chip.setAttribute(
            'aria-pressed',
            chip.getAttribute('data-kind-chip')
                === kind ? 'true' : 'false',
        );
    });
    rerenderWorkers();
}

function onWorkerListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const row = target.closest(
        '[data-worker-id]',
    );
    if (!row) return;
    const workerId = row.getAttribute(
        'data-worker-id',
    );
    if (workerId) {
        navigateTo(
            'worker-detail', { workerId },
        );
    }
}

function bindAddWorkerDialog(): void {
    initDialog(
        'add-worker',
        'add-worker-btn',
        handleAddWorkerSubmit,
    );
    document.querySelectorAll<HTMLInputElement>(
        '#add-worker-kind-toggle input',
    ).forEach(input => {
        input.addEventListener(
            'change', onKindRadioChange,
            { signal },
        );
    });
    $('#add-worker-dialog', document)
        ?.addEventListener(
            'keydown', onDialogKeydown,
            { signal },
        );
}

function onKindRadioChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    const kind = target.value;
    const humanForm = $(
        '#add-worker-human-form', document,
    );
    const aiForm = $(
        '#add-worker-ai-form', document,
    );
    if (!humanForm || !aiForm) return;
    if (kind === 'human') {
        humanForm.classList.remove('hidden');
        aiForm.classList.add('hidden');
    } else {
        humanForm.classList.add('hidden');
        aiForm.classList.remove('hidden');
    }
}

function onDialogKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    $('#add-worker-submit', document)?.click();
}

function selectedKind(): 'human' | 'ai' {
    const checked = document.querySelector<
        HTMLInputElement
    >('#add-worker-kind-toggle'
        + ' input[name="worker-kind"]:checked');
    if (checked && checked.value === 'ai') {
        return 'ai';
    }
    return 'human';
}

async function handleAddWorkerSubmit(
): Promise<void> {
    const kind = selectedKind();
    if (kind === 'human') {
        await submitHumanForm();
    } else {
        await submitAIForm();
    }
}

async function submitHumanForm(): Promise<void> {
    const name = $input(
        '#hw-name', document,
    )!.value;
    const email = $input(
        '#hw-email', document,
    )!.value;
    if (!name || !email) {
        showToast(
            'Name and email are required',
            'error',
        );
        return;
    }
    const title = $input(
        '#hw-title', document,
    )!.value;
    const dept = $select(
        '#hw-department', document,
    )!.value;
    const phone = $input(
        '#hw-phone', document,
    )!.value;
    const bio = $textarea(
        '#hw-bio', document,
    )!.value;
    const id = generateCryptoSafeBase62();
    try {
        await postHumanWorkerCreation(
            createRequestContext(),
            id,
            trimStrings({
                name,
                email,
                title,
                department: dept,
                strengths:
                    jsonArrayField([]),
                team_dimensions:
                    jsonObjectField({
                        driver: DEFAULT_DIM,
                        analytical:
                            DEFAULT_DIM,
                        expressive:
                            DEFAULT_DIM,
                        amiable: DEFAULT_DIM,
                    }),
                phone,
                bio,
            }),
            'active',
        );
    } catch (err) {
        const detail = err instanceof Error
            ? err.message
            : String(err);
        log.error(
            'postHumanWorkerCreation failed',
            'workers', err,
        );
        showToast(
            `Failed to add worker: ${detail}`,
            'error',
        );
        return;
    }
    showToast('Worker added', 'success');
    closeDialog('add-worker');
    navigateTo('workers');
}

async function submitAIForm(): Promise<void> {
    const name = $input(
        '#ai-name', document,
    )!.value;
    const description = $textarea(
        '#ai-description', document,
    )!.value;
    const skillFocus = $textarea(
        '#ai-skill-focus', document,
    )!.value;
    const model = $select(
        '#ai-model', document,
    )!.value;
    if (!name) {
        showToast(
            'Name is required',
            'error',
        );
        return;
    }
    if (!model) {
        showToast(
            'Model is required',
            'error',
        );
        return;
    }
    const id = generateCryptoSafeBase62();
    try {
        await postAIWorkerCreation(
            createRequestContext(),
            id,
            trimStrings({
                name,
                description,
                skill_focus: skillFocus,
                model,
            }),
        );
    } catch (err) {
        log.error(
            'postAIWorkerCreation failed',
            'workers', err,
        );
        showToast(
            'Failed to add AI worker',
            'error',
        );
        return;
    }
    showToast('AI worker added', 'success');
    closeDialog('add-worker');
    navigateTo('workers');
}
