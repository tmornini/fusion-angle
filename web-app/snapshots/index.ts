import {
    deleteSchema,
    postSchemaCreation,
    postBootstrap,
    postMockDataLoad,
    putSnapshotFromFile,
    getSnapshot,
    getDataPresent,
    nowUtc,
    getUrlParam,
} from '../app/adapters/index.ts';
import {
    $, $input, $button, createElement,
} from '../app/dom.ts';
import {
    downloadBlob,
} from '../app/adapters/blob-download.ts';
import { log } from '../app/logger.ts';
import {
    html,
    mutateHtml,
    SafeHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    navigateTo,
    openDialog,
    closeDialog,
} from '../app/core.ts';
import {
    iconTrash,
    iconDownload,
    iconUpload,
    iconDatabase,
    iconInfo,
} from '../app/icons.ts';

const BANNER_ID = 'empty-banner';

type SnapshotTone =
    'success' | 'warning' | 'error';

function buildOutlineBtn(
    id: string,
    label: string,
    tone: SnapshotTone,
): SafeHtml {
    return html`<button
        class="btn btn-outline"
        id="${id}"
        data-tone="${tone}"
        >${label}</button>`;
}

type PendingState =
    | { kind: 'idle' }
    | {
        kind: 'pending';
        action: () => Promise<void>;
        button: HTMLButtonElement;
        label: string;
    };

export async function init(
): Promise<void> {
    const root = $(
        '#snapshots-content', document,
    );
    if (!root) return;

    let pending: PendingState =
        { kind: 'idle' };

    async function executePending(
    ): Promise<void> {
        if (pending.kind !== 'pending')
            return;
        const { action, button, label }
            = pending;
        pending = { kind: 'idle' };

        closeDialog('confirm-wipe');
        const originalText =
            button.textContent;
        button.disabled = true;
        button.textContent = 'Working...';
        try {
            await deleteSchema();
        } catch (err) {
            log.error(
                'schema deletion failed',
                'snapshots',
                err,
            );
            showToast(
                'Failed to clear schema.',
                'error',
            );
            button.disabled = false;
            button.textContent =
                originalText;
            return;
        }
        try {
            await action();
        } catch (err) {
            log.error(
                label + ' failed',
                'snapshots',
                err,
            );
            showToast(
                'Failed to '
                + label.toLowerCase()
                + '.',
                'error',
            );
            button.disabled = false;
            button.textContent =
                originalText;
            return;
        }
        navigateTo('dashboard');
    }

    function confirmAction(
        button: HTMLButtonElement,
        label: string,
        action: () => Promise<void>,
        message?: string,
    ): void {
        pending = {
            kind: 'pending',
            action,
            button,
            label,
        };
        if (message) {
            const msg = $(
                '#confirm-wipe-message',
                document,
            );
            if (msg) {
                msg.textContent = message;
            }
            openDialog('confirm-wipe');
        } else {
            void executePending();
        }
    }

    mutateHtml(root, html`
    <div class="card snapshot-card">
        <div class="${
            'flex items-center gap-3'
        }">
            <div class="icon-box"
                data-tone="success">${
                iconDownload(20, '')
            }</div>
            <div>
                <h3 class="${
                    'text-sm'
                    + ' font-semibold'
                }">Download Snapshot</h3>
                <p class="${
                    'text-xs text-muted'
                }">${
                    'Download snapshot'
                }</p>
            </div>
        </div>
        ${buildOutlineBtn(
            'download-btn',
            'Download Snapshot',
            'success',
        )}
    </div>

    <div class="card snapshot-card">
        <div class="${
            'flex items-center gap-3'
        }">
            <div class="icon-box"
                data-tone="success">${
                iconUpload(20, '')
            }</div>
            <div>
                <h3 class="${
                    'text-sm'
                    + ' font-semibold'
                }">Upload Snapshot</h3>
                <p class="${
                    'text-xs text-muted'
                }">${
                    'Load data from'
                    + ' snapshot file'
                }</p>
            </div>
        </div>
        <label class="${
            'btn btn-outline'
            + ' cursor-pointer text-center'
        }"
            data-tone="success">
            Upload Snapshot
            <input type="file"
                accept=".json"
                id="upload-input"
                class="hidden" />
        </label>
    </div>

    <div class="card snapshot-card">
        <div class="${
            'flex items-center gap-3'
        }">
            <div class="icon-box"
                data-tone="warning">${
                iconDatabase(20, '')
            }</div>
            <div>
                <h3 class="${
                    'text-sm'
                    + ' font-semibold'
                }">${
                    'Wipe and Load'
                    + ' Mock Data'
                }</h3>
                <p class="${
                    'text-xs text-muted'
                }">${
                    'Wipe and load'
                    + ' mock data'
                }</p>
            </div>
        </div>
        ${buildOutlineBtn(
            'reload-btn',
            'Wipe and Load Mock Data',
            'warning',
        )}
    </div>

    <div class="card snapshot-card">
        <div class="${
            'flex items-center gap-3'
        }">
            <div class="icon-box"
                data-tone="error">${
                iconTrash(20, '')
            }</div>
            <div>
                <h3 class="${
                    'text-sm'
                    + ' font-semibold'
                }">${
                    'Create Pristine'
                    + ' Environment'
                }</h3>
                <p class="${
                    'text-xs text-muted'
                }">${
                    'Create a pristine'
                    + ' environment'
                }</p>
            </div>
        </div>
        ${buildOutlineBtn(
            'wipe-btn',
            'Create Pristine Environment',
            'error',
        )}
    </div>
    `);

    mutateMissingTableBanner(root);
    await mutateEmptyBanner(root);

    const wipeBtn = $button(
        '#wipe-btn', document,
    );
    if (wipeBtn) {
        wipeBtn.addEventListener(
            'click',
            () =>
                confirmAction(
                    wipeBtn,
                    'Create pristine'
                    + ' environment',
                    async () => {
                        await postSchemaCreation();
                        await postBootstrap();
                    },
                    'Are you sure you'
                    + ' want to create a'
                    + ' pristine'
                    + ' environment? All'
                    + ' existing data'
                    + ' will be removed.'
                    + ' This cannot be'
                    + ' undone.',
                ),
        );
    }

    const reloadBtn = $button(
        '#reload-btn', document,
    );
    if (reloadBtn) {
        reloadBtn.addEventListener(
            'click',
            () =>
                confirmAction(
                    reloadBtn,
                    'Load mock data',
                    async () => {
                        await postSchemaCreation();
                        await postMockDataLoad();
                    },
                ),
        );
    }

    const importInput = $input(
        '#upload-input', document,
    );
    importInput?.addEventListener(
        'change',
        async () => {
            const file =
                importInput.files?.[0];
            if (!file) return;
            try {
                await putSnapshotFromFile(file);
            } catch (err) {
                log.error(
                    'putSnapshotFromFile failed',
                    'snapshots',
                    err,
                );
                showToast(
                    'Failed to upload'
                    + ' snapshot. Check'
                    + ' file format.',
                    'error',
                );
                importInput.value = '';
                return;
            }
            importInput.value = '';
            navigateTo('dashboard');
        },
    );

    $(
        '#download-btn', document,
    )?.addEventListener(
        'click',
        async () => {
            let json: string;
            try {
                json =
                    await getSnapshot();
            } catch (err) {
                log.error(
                    'getSnapshot failed',
                    'snapshots',
                    err,
                );
                showToast(
                    'Failed to download'
                    + ' snapshot.',
                    'error',
                );
                return;
            }
            const blob = new Blob(
                [json],
                {
                    type:
                        'application/json',
                },
            );
            const date = nowUtc()
                .split('T')[0];
            downloadBlob(
                blob,
                'fusion-ai-snapshot-'
                + date
                + '.json',
            );
            showToast(
                'Snapshot downloaded'
                + ' successfully.',
                'success',
            );
        },
    );

    $(
        '#confirm-wipe-cancel', document,
    )?.addEventListener(
        'click',
        () => {
            pending = { kind: 'idle' };
            closeDialog('confirm-wipe');
        },
    );
    $(
        '#confirm-wipe-backdrop', document,
    )?.addEventListener(
        'click',
        (e) => {
            if (
                e.target
                === e.currentTarget
            ) {
                pending = { kind: 'idle' };
                closeDialog(
                    'confirm-wipe',
                );
            }
        },
    );
    $(
        '#confirm-wipe-submit', document,
    )?.addEventListener(
        'click',
        () => void executePending(),
    );
}

const MISSING_TABLE_BANNER_ID =
    'missing-table-banner';

function mutateMissingTableBanner(
    root: HTMLElement,
): void {
    const missing = getUrlParam('missing-table');
    if (!missing) return;
    if (
        $(
            '#' + MISSING_TABLE_BANNER_ID,
            document,
        )
    ) return;
    const banner = createElement('div');
    banner.id = MISSING_TABLE_BANNER_ID;
    banner.className =
        'card empty-banner';
    banner.dataset['tone'] = 'warning';
    mutateHtml(
        banner,
        html`<span
            class="empty-banner-icon"
            >${iconInfo(20, '')}</span>
        <p class="text-sm m-0">${
            'The schema is missing the "'
            + missing
            + '" table. Recreate the schema'
            + ' below to continue.'
        }</p>`,
    );
    root.prepend(banner);
}

async function mutateEmptyBanner(
    root: HTMLElement,
): Promise<void> {
    const hasExistingData =
        await getDataPresent();
    const existing = $(
        '#' + BANNER_ID, document,
    );
    if (!hasExistingData) {
        if (!existing) {
            const banner = createElement('div');
            banner.id = BANNER_ID;
            banner.className =
                'card empty-banner';
            mutateHtml(
                banner,
                html`<span
                    class="empty-banner-icon"
                    >${iconInfo(20, '')}</span>
                <p class="text-sm m-0">${
                    'Your database is'
                    + ' empty.'
                }</p>`,
            );
            root.prepend(banner);
        }
    } else {
        existing?.remove();
    }
}
