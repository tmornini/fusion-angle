import {
    $, $select, attr, createElement,
} from '../app/dom';
import {
    html,
    setHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconGitBranch,
} from '../app/icons';
import {
    navigateTo,
    openDialog,
    closeDialog,
} from '../app/core';
import {
    getFlows,
    getProjects,
    postFlowFromMermaid,
    postFlowFromZip,
    getBackupFromZip,
    computeFlowBackupResolution,
    putFlowFromBackup,
    postFlowFromBackup,
} from '../app/adapters';
import type {
    BackupV2,
    ImportResolution,
} from '../app/adapters';
import {
    FlowPresenter,
} from '../app/presenters';
import { log } from '../app/logger';
import { showToast } from '../app/toast';

type ImportState =
    | { kind: 'idle' }
    | {
        kind: 'pending';
        backup: BackupV2;
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
        backup: BackupV2,
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
        getFlows,
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
        flow =>
            new FlowPresenter(flow).render(),
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
            const card =
                e.target
                    .closest<HTMLElement>(
                    '[data-flow-card]',
                );
            if (card)
                navigateTo(
                    'flow-detail',
                    {
                        flowId: attr(
                            card,
                            'data-flow'
                            + '-card',
                        ),
                    },
                );
        },
    );

    bindImport();
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

    const projects = await getProjects();
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
        try {
            const backup =
                await getBackupFromZip(bytes);
            await handleV2Zip(
                backup, input,
            );
            return;
        } catch (err) {
            log.info(
                'not a v2 backup',
                'flows',
                err,
            );
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
    try {
        result = ext === 'zip'
            ? await postFlowFromZip(
                crypto.randomUUID(),
                new Uint8Array(
                    await file
                        .arrayBuffer(),
                ),
                projectId,
            )
            : await postFlowFromMermaid(
                crypto.randomUUID(),
                await file.text(),
                projectId,
            );
    } catch (err) {
        const msg =
            err instanceof Error
                ? err.message
                : 'Import failed';
        showToast(msg, 'error');
        input.value = '';
        return;
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

async function handleV2Zip(
    backup: BackupV2,
    input: HTMLInputElement,
): Promise<void> {
    let resolution: ImportResolution;
    try {
        resolution =
            await computeFlowBackupResolution(
                backup,
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
    try {
        const flowId =
            await putFlowFromBackup(stOw.backup);
        clearPending(input);
        showToast(
            'Flow overwritten',
            'success',
        );
        navigateTo(
            'flow-detail',
            { flowId },
        );
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Overwrite failed';
        showToast(msg, 'error');
    }
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
    try {
        const flowId =
            await postFlowFromBackup(
                crypto.randomUUID(),
                stRe.backup, projectId,
            );
        clearPending(input);
        showToast(
            'Flow imported',
            'success',
        );
        navigateTo(
            'flow-detail',
            { flowId },
        );
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Import failed';
        showToast(msg, 'error');
    }
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
    try {
        const flowId =
            await postFlowFromBackup(
                crypto.randomUUID(),
                stNw.backup, projectId,
            );
        clearPending(input);
        showToast(
            'Flow imported',
            'success',
        );
        navigateTo(
            'flow-detail',
            { flowId },
        );
    } catch (err) {
        clearPending(input);
        const msg =
            err instanceof Error
                ? err.message
                : 'Import failed';
        showToast(msg, 'error');
    }
}
