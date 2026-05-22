import {
    $, $input, $select, $textarea,
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
    iconChevronRight, iconSend,
    iconBrain,
} from '../app/icons.ts';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    createRequestContext,
    getWorkers,
    postHumanWorkerCreation,
    postAIWorkerCreate,
    getCurrentHumanWorker,
    jsonArrayField,
    jsonObjectField,
    generateCryptoSafeBase62,
    nowUtc,
    subscribeHumanWorkerChanges,
    subscribeAIWorkerChanges,
} from '../app/adapters/index.ts';
import {
    ManagedWorkersPresenter,
    buildInitialManagedWorkersState,
    applyManagedWorkersSearch,
    applyManagedWorkersKind,
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
    const container = $(
        '#manage-workers-content', document,
    );
    if (!container) return;

    const ctx = createRequestContext();
    const loaded = await withLoadingState(
        container,
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
    const initialPresenter =
        new ManagedWorkersPresenter(workersState);
    setHtml(container, buildShellHtml(
        initialPresenter.humanCount(),
        initialPresenter.aiCount(),
    ));

    workerListEl = $('#worker-list', document);
    if (workerListEl) {
        rerenderWorkers();
        workerListEl.addEventListener(
            'click', onWorkerListClick,
            { signal },
        );
    }

    subscribeHumanWorkerChanges(
        () => void refresh(),
    );
    subscribeAIWorkerChanges(
        () => void refresh(),
    );

    initWorkerListFilters();
    bindAddWorkerDialog();
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

function buildShellHtml(
    humanCount: number,
    aiCount: number,
): ReturnType<typeof html> {
    return html`
        <div class="content-wrap-lg">
            <nav class="${
                'flex items-center'
                + ' gap-2 text-sm'
                + ' text-muted mb-6'
            }">
                <a href="../organization/index.html"
                    class="text-primary">
                    Organization
                </a>
                ${iconChevronRight(14, '')}
                <span>Manage Workers</span>
            </nav>

            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <div>
                    <h1 class="${
                        'text-3xl font-display'
                        + ' font-bold mb-2'
                    }">Manage Workers</h1>
                    <p class="text-muted">
                        ${humanCount}
                        humans,
                        ${aiCount}
                        AIs
                    </p>
                </div>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="add-worker-btn">
                    ${iconPersonPlus(16, '')}
                    Add Worker
                </button>
            </div>

            <div class="${
                'flex items-center'
                + ' gap-4 mb-6'
            }">
                <div class="${
                    'search-wrapper flex-1'
                    + ' search-wrapper-md'
                }">
                    <span class="search-icon">
                        ${iconSearch(16, '')}
                    </span>
                    <input class="${
                        'input search-input'
                    }"
                        placeholder="${
                            'Search workers...'
                        }"
                        id="worker-search"
                        aria-label="${
                            'Search workers'
                        }" />
                </div>
                <div class="${
                    'flex items-center gap-2'
                }" role="tablist"
                    aria-label="${
                        'Filter by kind'
                    }">
                    <button class="${
                        'btn btn-secondary'
                        + ' btn-sm'
                    }"
                        data-kind-chip="all"
                        aria-pressed="true">
                        All
                    </button>
                    <button class="${
                        'btn btn-secondary'
                        + ' btn-sm'
                    }"
                        data-kind-chip="human"
                        aria-pressed="false">
                        Humans
                    </button>
                    <button class="${
                        'btn btn-secondary'
                        + ' btn-sm'
                    }"
                        data-kind-chip="ai"
                        aria-pressed="false">
                        AIs
                    </button>
                </div>
            </div>

            <div class="${
                'card overflow-hidden'
            }">
                <div class="${
                    'flex items-center'
                    + ' gap-4 p-4'
                    + ' table-header-row'
                }">
                    <div class="${
                        'flex-2 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Worker</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Title / Provider</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Department / Token</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Status</div>
                </div>
                <div id="worker-list"></div>
            </div>

            ${buildAddWorkerDialogHtml()}
        </div>`;
}

function buildAddWorkerDialogHtml(
): ReturnType<typeof html> {
    return html`
        <div id="add-worker-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="add-worker-dialog"
            class="${
                'dialog dialog-wide hidden'
            }"
            aria-hidden="true"
            role="dialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="${
                    'dialog-title'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconPersonPlus(20, '')}
                    Add Worker
                </h3>
            </div>
            <div class="${
                'flex flex-col gap-3 py-4'
                + ' dialog-scroll'
            }">
                <fieldset class="${
                    'flex items-center gap-4'
                }" id="add-worker-kind-toggle">
                    <legend class="${
                        'label mr-2'
                    }">Kind</legend>
                    <label class="${
                        'flex items-center gap-1'
                    }">
                        <input type="radio"
                            name="worker-kind"
                            value="human"
                            checked />
                        Human
                    </label>
                    <label class="${
                        'flex items-center gap-1'
                    }">
                        <input type="radio"
                            name="worker-kind"
                            value="ai" />
                        AI
                    </label>
                </fieldset>
                ${buildHumanFormHtml()}
                ${buildAIFormHtml()}
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="add-worker-cancel">
                    Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="add-worker-submit">
                    ${iconSend(16, '')}
                    Create
                </button>
            </div>
        </div>`;
}

function buildHumanFormHtml(
): ReturnType<typeof html> {
    return html`
        <div id="add-worker-human-form"
            class="flex flex-col gap-3">
            <div class="flex gap-3">
                <div class="flex-1">
                    <label class="${
                        'label mb-1 block'
                    }">First Name</label>
                    <input class="input"
                        id="hw-first"
                        placeholder="${
                            'First name'
                        }" />
                </div>
                <div class="flex-1">
                    <label class="${
                        'label mb-1 block'
                    }">Last Name</label>
                    <input class="input"
                        id="hw-last"
                        placeholder="${
                            'Last name'
                        }" />
                </div>
            </div>
            <div>
                <label class="${
                    'label mb-1 block'
                }">Email</label>
                <input class="input"
                    type="email"
                    placeholder="${
                        'person@company.com'
                    }"
                    id="hw-email" />
            </div>
            <div class="flex gap-3">
                <div class="flex-1">
                    <label class="${
                        'label mb-1 block'
                    }">Title</label>
                    <input class="input"
                        type="text"
                        placeholder="${
                            'e.g. Engineer'
                        }"
                        id="hw-title" />
                </div>
                <div class="flex-1">
                    <label class="${
                        'label mb-1 block'
                    }">Department</label>
                    <select class="input"
                        id="hw-department">
                        <option value="${
                            'Engineering'
                        }">Engineering</option>
                        <option value="${
                            'Product'
                        }">Product</option>
                        <option value="${
                            'Design'
                        }">Design</option>
                        <option value="${
                            'Sales'
                        }">Sales</option>
                        <option value="${
                            'Operations'
                        }">Operations</option>
                        <option value="${
                            'Analytics'
                        }">Analytics</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="${
                    'label mb-1 block'
                }">Phone</label>
                <input class="input"
                    id="hw-phone"
                    placeholder="${
                        '+1 (555) 000-0000'
                    }" />
            </div>
            <div>
                <label class="${
                    'label mb-1 block'
                }">Bio</label>
                <textarea class="textarea"
                    rows="2"
                    id="hw-bio"
                    placeholder="${
                        'Short bio...'
                    }"></textarea>
            </div>
        </div>`;
}

function buildAIFormHtml(
): ReturnType<typeof html> {
    return html`
        <div id="add-worker-ai-form"
            class="flex flex-col gap-3 hidden">
            <div>
                <label class="${
                    'label mb-1 block'
                }">Name</label>
                <input class="input"
                    id="ai-name"
                    placeholder="${
                        'e.g. Claude Opus'
                    }" />
            </div>
            <div>
                <label class="${
                    'label mb-1 block'
                }">Provider</label>
                <input class="input"
                    id="ai-provider"
                    placeholder="${
                        'e.g. Anthropic'
                    }" />
            </div>
            <div>
                <label class="${
                    'label mb-1 block'
                }">Description</label>
                <textarea class="textarea"
                    rows="2"
                    id="ai-description"
                    placeholder="${
                        'Short description...'
                    }"></textarea>
            </div>
            <div>
                <label class="${
                    'label mb-1 flex'
                    + ' items-center gap-2'
                }">
                    ${iconBrain(16, '')}
                    Auth Token
                </label>
                <input class="input"
                    type="password"
                    id="ai-auth-token"
                    required
                    aria-required="true"
                    placeholder="${
                        'sk-...'
                    }" />
                <p class="${
                    'text-xs text-warning mt-2'
                }">${
                    '⚠ Auth tokens are stored'
                    + ' unencrypted in this'
                    + " browser's local storage."
                    + ' Do not enter production'
                    + ' keys today; secure'
                    + ' storage arrives with the'
                    + ' AI-invocation feature.'
                }</p>
            </div>
        </div>`;
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
    const first = $input(
        '#hw-first', document,
    )!.value;
    const last = $input(
        '#hw-last', document,
    )!.value;
    const email = $input(
        '#hw-email', document,
    )!.value;
    if (!first || !last || !email) {
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
                first_name: first,
                last_name: last,
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
    const provider = $input(
        '#ai-provider', document,
    )!.value;
    const description = $textarea(
        '#ai-description', document,
    )!.value;
    const authToken = $input(
        '#ai-auth-token', document,
    )!.value;
    if (!name) {
        showToast(
            'Name is required',
            'error',
        );
        return;
    }
    if (!authToken) {
        showToast(
            'Auth token is required',
            'error',
        );
        return;
    }
    const id = generateCryptoSafeBase62();
    try {
        await postAIWorkerCreate(
            createRequestContext(),
            id,
            trimStrings({
                name,
                provider,
                description,
                auth_token: authToken,
            }),
        );
    } catch (err) {
        log.error(
            'postAIWorkerCreate failed',
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
