import {
    $, $select, getRequiredAttribute, createElement,
} from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    iconGitBranch,
} from '../app/icons.ts';
import {
    navigateTo,
    openDialog,
    closeDialog,
} from '../app/core.ts';
import {
    createRequestContext,
    getProjects,
    getFlowsWithProjectNames,
    putFlow,
    postFlowFromMermaid,
    postFlowFromZip,
    getBackupFromZip,
    computeFlowBackupResolution,
    postFlowFromBackup,
    generateCryptoSafeBase62,
    subscribeFlowChanges,
} from '../app/adapters/index.ts';
import type {
    Backup,
    ImportResolution,
} from '../app/adapters/index.ts';
import {
    FlowPresenter,
} from '../app/presenters/index.ts';
import { log } from '../app/logger.ts';
import { showToast } from '../app/toast.ts';

type ImportState =
    | { kind: 'idle' }
    | {
        kind: 'pending';
        backup: Backup;
        resolution: ImportResolution;
    };

class ImportStore {
    #state: ImportState = {
        kind: 'idle',
    };

    current(): ImportState {
        return this.#state;
    }

    setPending(
        backup: Backup,
        resolution: ImportResolution,
    ): void {
        this.#state = {
            kind: 'pending',
            backup,
            resolution,
        };
    }

    reset(): void {
        this.#state = { kind: 'idle' };
    }
}

const importStore = new ImportStore();

export async function init(
): Promise<void> {
    const listEl = $(
        '#flow-list', document,
    );
    if (!listEl) return;

    const result = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        () => getFlowsWithProjectNames(
            createRequestContext(),
        ),
        init,
        {
            icon: iconGitBranch(24, ''),
            title: 'No Flows Yet',
            description:
                'Flows are created'
                + ' from the project'
                + ' detail page.',
            action: {
                label: 'View Projects',
                href:
                    '../projects/'
                    + 'index.html',
            },
        },
    );
    if (!result) return;
    const rendered = result.map(
        ({ summary, projectName }) =>
            new FlowPresenter(
                summary, projectName,
            ).render(),
    );

    setHtml(
        listEl,
        html`${rendered}`,
    );

    listEl.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            // Stats button takes priority
            // so it doesn't also fire
            // card navigation.
            const statsBtn =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-stats]',
                );
            if (statsBtn) {
                navigateTo(
                    'flow-stats',
                    {
                        flowId:
                            getRequiredAttribute(
                                statsBtn,
                                'data-flow'
                                + '-stats',
                            ),
                    },
                );
                return;
            }
            const card =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-card]',
                );
            if (card)
                navigateTo(
                    'flow-detail',
                    {
                        flowId: getRequiredAttribute(
                            card,
                            'data-flow'
                            + '-card',
                        ),
                    },
                );
        },
    );

    subscribeFlowChanges(
        () => void rerenderFlowList(listEl),
    );

    bindImport();
}

async function rerenderFlowList(
    listEl: HTMLElement,
): Promise<void> {
    const items =
        await getFlowsWithProjectNames(
            createRequestContext(),
        );
    const rendered = items.map(
        ({ summary, projectName }) =>
            new FlowPresenter(
                summary, projectName,
            ).render(),
    );
    setHtml(listEl, html`${rendered}`);
}

function bindImport(): void {
    const btn = $(
        '#import-flow-btn', document,
    );
    const fileInput = $(
        '#import-flow-input', document,
    ) as HTMLInputElement | null;
    const cancelBtn = $(
        '#import-cancel', document,
    );
    const chooseBtn = $(
        '#import-choose', document,
    );
    const overwriteBtn = $(
        '#import-overwrite', document,
    );
    const createNewBtn = $(
        '#import-create-new', document,
    );
    const createBtn = $(
        '#import-create', document,
    );

    if (
        !btn || !fileInput
        || !cancelBtn || !chooseBtn
    ) return;

    btn.addEventListener(
        'click',
        () => void openImportDialog(),
    );

    cancelBtn.addEventListener(
        'click',
        () => {
            importStore.reset();
            resetImportDialog();
            closeDialog('import-flow');
        },
    );

    chooseBtn.addEventListener(
        'click',
        () => fileInput.click(),
    );

    fileInput.addEventListener(
        'change',
        () => void handleFileSelect(
            fileInput,
        ),
    );

    overwriteBtn?.addEventListener(
        'click',
        () => void handleOverwrite(
            fileInput,
        ),
    );

    createNewBtn?.addEventListener(
        'click',
        () => void handleCreateNew(
            fileInput,
        ),
    );

    createBtn?.addEventListener(
        'click',
        () => void handleCreate(
            fileInput,
        ),
    );
}

async function openImportDialog(
): Promise<void> {
    const select = $select(
        '#import-project', document,
    );
    if (!select) return;

    resetImportDialog();
    importStore.reset();

    const projects = await getProjects(
        createRequestContext(),
    );
    if (projects.length === 0) {
        showToast(
            'No projects available',
            'error',
        );
        return;
    }

    select.replaceChildren();
    for (const p of projects) {
        const opt = createElement('option');
        opt.value = p.idForLink();
        opt.textContent =
            p.titleText();
        select.appendChild(opt);
    }

    openDialog('import-flow');
}

async function handleFileSelect(
    input: HTMLInputElement,
): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;

    const ext = file.name
        .split('.').pop()
        ?.toLowerCase();

    if (ext === 'zip') {
        const bytes = new Uint8Array(
            await file.arrayBuffer(),
        );
        let backup: Backup | undefined;
        try {
            backup =
                await getBackupFromZip(bytes);
        } catch (err) {
            log.info(
                'not a backup',
                'flows',
                err,
            );
        }
        if (backup) {
            await handleBackupZip(backup, input);
            return;
        }
    }

    const select = $select(
        '#import-project', document,
    );
    const projectId = select?.value;
    if (!projectId) {
        showToast(
            'Select a project first',
            'error',
        );
        return;
    }

    closeDialog('import-flow');

    let result: {
        flowId: string;
        warnings: string[];
    };
    const uuid = generateCryptoSafeBase62();
    if (ext === 'zip') {
        const bytes = new Uint8Array(
            await file.arrayBuffer(),
        );
        try {
            result = await postFlowFromZip(
                createRequestContext(),
                uuid, bytes, projectId,
            );
        } catch (err) {
            const msg = err instanceof Error
                ? err.message
                : 'Import failed';
            showToast(msg, 'error');
            input.value = '';
            return;
        }
    } else {
        const text = await file.text();
        try {
            result = await postFlowFromMermaid(
                createRequestContext(),
                uuid, text, projectId,
            );
        } catch (err) {
            const msg = err instanceof Error
                ? err.message
                : 'Import failed';
            showToast(msg, 'error');
            input.value = '';
            return;
        }
    }

    input.value = '';

    if (result.warnings.length > 0) {
        showToast(
            'Imported with '
            + String(
                result.warnings.length,
            )
            + ' warning(s)',
            'warning',
        );
    } else {
        showToast(
            'Flow imported',
            'success',
        );
    }

    navigateTo(
        'flow-detail',
        { flowId: result.flowId },
    );
}

async function handleBackupZip(
    backup: Backup,
    input: HTMLInputElement,
): Promise<void> {
    let resolution: ImportResolution;
    try {
        resolution =
            await computeFlowBackupResolution(
                createRequestContext(), backup,
            );
    } catch (err) {
        log.error(
            'computeFlowBackupResolution'
            + ' failed',
            'flows',
            err,
        );
        showToast(
            'Failed to resolve import',
            'error',
        );
        input.value = '';
        return;
    }
    importStore.setPending(
        backup, resolution,
    );
    configureResolutionDialog(
        resolution,
    );
}

function configureResolutionDialog(
    resolution: ImportResolution,
): void {
    const desc = $(
        '#import-description',
        document,
    );
    const projectSec = $(
        '#import-project-section',
        document,
    );
    const overwriteBtn = $(
        '#import-overwrite', document,
    );
    const createNewBtn = $(
        '#import-create-new', document,
    );
    const createBtn = $(
        '#import-create', document,
    );
    const chooseBtn = $(
        '#import-choose', document,
    );
    if (
        !desc || !projectSec
        || !overwriteBtn
        || !createNewBtn
        || !createBtn || !chooseBtn
    ) return;

    const cfg = resolution.dialog;
    chooseBtn.classList.add('hidden');
    desc.textContent = cfg.description;
    projectSec.classList.toggle(
        'hidden', !cfg.showProject,
    );
    overwriteBtn.classList.toggle(
        'hidden', !cfg.showOverwrite,
    );
    createNewBtn.classList.toggle(
        'hidden', !cfg.showCreateNew,
    );
    createBtn.classList.toggle(
        'hidden', !cfg.showCreate,
    );
}

function resetImportDialog(): void {
    const desc = $(
        '#import-description',
        document,
    );
    const projectSec = $(
        '#import-project-section',
        document,
    );
    const overwriteBtn = $(
        '#import-overwrite', document,
    );
    const createNewBtn = $(
        '#import-create-new', document,
    );
    const createBtn = $(
        '#import-create', document,
    );
    const chooseBtn = $(
        '#import-choose', document,
    );
    if (desc) {
        desc.textContent =
            'Select a project and'
            + ' choose a .mmd or'
            + ' .zip file';
    }
    projectSec?.classList
        .remove('hidden');
    overwriteBtn?.classList
        .add('hidden');
    createNewBtn?.classList
        .add('hidden');
    createBtn?.classList
        .add('hidden');
    chooseBtn?.classList
        .remove('hidden');
}

function clearPending(
    input: HTMLInputElement,
): void {
    importStore.reset();
    input.value = '';
}

async function handleOverwrite(
    input: HTMLInputElement,
): Promise<void> {
    const stOw = importStore.current();
    if (stOw.kind !== 'pending') return;
    closeDialog('import-flow');
    resetImportDialog();
    const flowId = stOw.backup.flow.id;
    try {
        const ctx = createRequestContext();
        await putFlow(ctx, flowId, {
            name: stOw.backup.flow.name,
            description:
                stOw.backup.flow.description,
            isLocked: stOw.backup.flow.isLocked,
            isAutoLayout:
                stOw.backup.flow.isAutoLayout,
            isAutoFit:
                stOw.backup.flow.isAutoFit,
            lockTimeout:
                stOw.backup.flow.lockTimeout,
            nodes: stOw.backup.flow.graph.nodes,
            edges: stOw.backup.flow.graph.edges,
        });
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Overwrite failed';
        showToast(msg, 'error');
        return;
    }
    clearPending(input);
    showToast('Flow overwritten', 'success');
    navigateTo('flow-detail', { flowId });
}

async function handleCreateNew(
    input: HTMLInputElement,
): Promise<void> {
    const stRe = importStore.current();
    if (stRe.kind !== 'pending') return;
    if (!stRe.resolution.dialog
        .hasKnownProject
    ) return;
    const projectId =
        stRe.backup.projectId;
    if (!projectId) return;
    closeDialog('import-flow');
    resetImportDialog();
    let flowId: string;
    try {
        flowId = await postFlowFromBackup(
            createRequestContext(),
            generateCryptoSafeBase62(),
            stRe.backup, projectId,
        );
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Import failed';
        showToast(msg, 'error');
        return;
    }
    clearPending(input);
    showToast('Flow imported', 'success');
    navigateTo('flow-detail', { flowId });
}

async function handleCreate(
    input: HTMLInputElement,
): Promise<void> {
    const stNw = importStore.current();
    if (stNw.kind !== 'pending') return;
    const select = $select(
        '#import-project', document,
    );
    const projectId = select?.value;
    if (!projectId) {
        showToast(
            'Select a project',
            'error',
        );
        return;
    }
    closeDialog('import-flow');
    resetImportDialog();
    let flowId: string;
    try {
        flowId = await postFlowFromBackup(
            createRequestContext(),
            generateCryptoSafeBase62(),
            stNw.backup, projectId,
        );
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Import failed';
        showToast(msg, 'error');
        return;
    }
    clearPending(input);
    showToast('Flow imported', 'success');
    navigateTo('flow-detail', { flowId });
}
