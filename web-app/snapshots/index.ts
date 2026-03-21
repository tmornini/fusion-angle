import {
    deleteSchema,
    createSchema,
    loadMockData,
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
import { navigateTo } from '../app/core';
import {
    iconTrash,
    iconDownload,
    iconUpload,
    iconDatabase,
    iconInfo,
} from '../app/icons';
import { nowUtc } from '../../api/types';

const BANNER_ID = 'empty-banner';

async function updateEmptyBanner(
    root: HTMLElement,
): Promise<void> {
    const hasExistingData = await hasData();
    const existing =
        document.getElementById(BANNER_ID);
    if (!hasExistingData) {
        if (!existing) {
            const banner =
                document.createElement('div');
            banner.id = BANNER_ID;
            banner.className = 'card';
            banner.style.cssText =
                'padding:1rem 1.25rem;'
                + 'display:flex;'
                + 'align-items:center;'
                + 'gap:0.75rem;'
                + 'grid-column:1/-1;'
                + 'background:'
                + 'hsl(var(--primary)/0.06);'
                + 'border:1px solid '
                + 'hsl(var(--primary)/0.2)';
            setHtml(
                banner,
                html`<span style="${
                    'color:'
                    + 'hsl(var(--primary));'
                    + 'flex-shrink:0'
                }">${
                    iconInfo(20)
                }</span>
                <p class="text-sm"
                    style="margin:0">${
                    'Your database is empty.'
                    + ' Load mock data or'
                    + ' upload a snapshot'
                    + ' to get started.'
                }</p>`,
            );
            root.prepend(banner);
        }
    } else {
        existing?.remove();
    }
}

async function withWipeAndReload(
    button: HTMLButtonElement,
    label: string,
    action: () => Promise<void>,
    confirmMessage?: string,
): Promise<void> {
    if (
        confirmMessage
        && !confirm(confirmMessage)
    ) {
        return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Working...';
    try {
        await deleteSchema();
        await action();
        navigateTo('dashboard');
    } catch {
        showToast(
            'Failed to '
            + label.toLowerCase()
            + '.',
            'error',
        );
        button.disabled = false;
        button.textContent = originalText;
    }
}

const iconBoxStyle = (cssVar: string) =>
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
        class="btn btn-outline" id="${id}"
        style="${
            'border-color:hsl(var(--'
            + cssVar + '));'
            + 'color:hsl(var(--'
            + cssVar + '))'
        }">${label}</button>`;
}

export async function init(): Promise<void> {
    const root = $('#snapshots-content');
    if (!root) return;

    setHtml(root, html`
    <div class="card" style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('success')
            }">${iconDownload(20)}</div>
            <div>
                <h3 class="${
                    'text-sm font-semibold'
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

    <div class="card" style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('success')
            }">${iconUpload(20)}</div>
            <div>
                <h3 class="${
                    'text-sm font-semibold'
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

    <div class="card" style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('warning')
            }">${iconDatabase(20)}</div>
            <div>
                <h3 class="${
                    'text-sm font-semibold'
                }">${
                    'Wipe and Load Mock Data'
                }</h3>
                <p class="${
                    'text-xs text-muted'
                }">${
                    'Wipe and load mock data'
                }</p>
            </div>
        </div>
        ${buildOutlineBtn(
            'reload-btn',
            'Wipe and Load Mock Data',
            'warning',
        )}
    </div>

    <div class="card" style="${cardStyle}">
        <div style="${
            'display:flex;'
            + 'align-items:center;'
            + 'gap:0.75rem'
        }">
            <div style="${
                iconBoxStyle('error')
            }">${iconTrash(20)}</div>
            <div>
                <h3 class="${
                    'text-sm font-semibold'
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
                withWipeAndReload(
                    wipeBtn,
                    'Create pristine'
                    + ' environment',
                    async () => {
                        await createSchema();
                    },
                    'Are you sure you want'
                    + ' to create a pristine'
                    + ' environment? All'
                    + ' existing data will'
                    + ' be removed. This'
                    + ' cannot be undone.',
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
                withWipeAndReload(
                    reloadBtn,
                    'Load mock data',
                    async () => {
                        await createSchema();
                        await loadMockData();
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
                await importSnapshot(text);
                navigateTo('dashboard');
            } catch {
                showToast(
                    'Failed to upload'
                    + ' snapshot. Check'
                    + ' file format.',
                    'error',
                );
            }
            importInput.value = '';
        },
    );

    $('#download-btn')?.addEventListener(
        'click',
        async () => {
            try {
                const json =
                    await exportSnapshot();
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
            } catch {
                showToast(
                    'Failed to download'
                    + ' snapshot.',
                    'error',
                );
            }
        },
    );
}
