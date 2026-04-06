import {
    deleteSchema,
    postSchemaCreation,
    postBootstrap,
    postMockDataLoad,
    importSnapshot,
    exportSnapshot,
    hasData,
} from '../app/adapters';
import { $ } from '../app/dom';
import {
    html,
    setHtml,
    SafeHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    navigateTo,
    openDialog,
    closeDialog,
} from '../app/core';
import {
    iconTrash,
    iconDownload,
    iconUpload,
    iconDatabase,
    iconInfo,
} from '../app/icons';
import { nowUtc } from '../../api/types';

const BANNER_ID = 'empty-banner';

const iconBoxStyle =
    (cssVar: string) =>
    'width:2.5rem;height:2.5rem;'
    + 'border-radius:0.5rem;'
    + 'background:hsl(var(--'
    + cssVar
    + ')/0.1);'
    + 'display:flex;'
    + 'align-items:center;'
    + 'justify-content:center;'
    + 'color:hsl(var(--'
    + cssVar
    + '))';

const cardStyle =
    'padding:1.5rem;'
    + 'display:flex;'
    + 'flex-direction:column;'
    + 'gap:0.75rem';

function buildOutlineBtn(
    id: string,
    label: string,
    cssVar: string,
): SafeHtml {
    return html`<button
        class="btn btn-outline"
        id="${id}"
        style="${
            'border-color:hsl(var(--'
            + cssVar + '));'
            + 'color:hsl(var(--'
            + cssVar + '))'
        }">${label}</button>`;
}

interface PendingAction {
    action: (() => Promise<void>) | null;
    button: HTMLButtonElement | null;
    label: string | null;
}

export async function init(
): Promise<void> {
    const root = $(
        '#snapshots-content', document,
    );
    if (!root) return;

    const pending: PendingAction = {
        action: null,
        button: null,
        label: null,
    };

    function clearPending(): void {
        pending.action = null;
        pending.button = null;
        pending.label = null;
    }

    async function executePending(
    ): Promise<void> {
        const { action, button, label }
            = pending;
        clearPending();
        if (!button || !action || !label)
            return;

        closeDialog('confirm-wipe');
        const originalText =
            button.textContent;
        button.disabled = true;
        button.textContent = 'Working...';
        try {
            await deleteSchema();
            await action();
        } catch {
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
        pending.action = action;
        pending.button = button;
        pending.label = label;
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

    setHtml(root, html`
    <div class="card"
        style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('success')
            }">${
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

    <div class="card"
        style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('success')
            }">${
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
        <label class="btn btn-outline"
            style="${
                'cursor:pointer;'
                + 'text-align:center;'
                + 'border-color:'
                + 'hsl(var(--success));'
                + 'color:'
                + 'hsl(var(--success))'
            }">
            Upload Snapshot
            <input type="file"
                accept=".json"
                id="upload-input"
                style="display:none" />
        </label>
    </div>

    <div class="card"
        style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('warning')
            }">${
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

    <div class="card"
        style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('error')
            }">${
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

    await updateEmptyBanner(root);

    const wipeBtn =
        document.querySelector<
            HTMLButtonElement
        >('#wipe-btn');
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

    const reloadBtn =
        document.querySelector<
            HTMLButtonElement
        >('#reload-btn');
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

    const importInput =
        document.querySelector<
            HTMLInputElement
        >('#upload-input');
    importInput?.addEventListener(
        'change',
        async () => {
            const file =
                importInput.files?.[0];
            if (!file) return;
            try {
                const text =
                    await file.text();
                await deleteSchema();
                await importSnapshot(
                    text,
                );
            } catch {
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
                    await exportSnapshot();
            } catch {
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
            const url =
                URL.createObjectURL(blob);
            const downloadLink =
                document.createElement(
                    'a',
                );
            downloadLink.href = url;
            const date = nowUtc()
                .split('T')[0];
            downloadLink.download =
                'fusion-ai-snapshot-'
                + date
                + '.json';
            downloadLink.click();
            URL.revokeObjectURL(url);
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
            clearPending();
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
                clearPending();
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

async function updateEmptyBanner(
    root: HTMLElement,
): Promise<void> {
    const hasExistingData =
        await hasData();
    const existing =
        document.getElementById(
            BANNER_ID,
        );
    if (!hasExistingData) {
        if (!existing) {
            const banner =
                document.createElement(
                    'div',
                );
            banner.id = BANNER_ID;
            banner.className = 'card';
            banner.style.cssText =
                'padding:1rem 1.25rem;'
                + 'display:flex;'
                + 'align-items:center;'
                + 'gap:0.75rem;'
                + 'grid-column:1/-1;'
                + 'background:'
                + 'hsl(var(--primary)'
                + '/0.06);'
                + 'border:1px solid '
                + 'hsl(var(--primary)'
                + '/0.2)';
            setHtml(
                banner,
                html`<span style="${
                    'color:'
                    + 'hsl(var(--primary));'
                    + 'flex-shrink:0'
                }">${
                    iconInfo(20, '')
                }</span>
                <p class="text-sm"
                    style="margin:0">${
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
