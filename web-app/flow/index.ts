import {
    $, $select, attr,
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
    importFlowFromMermaid,
    importFlowFromZip,
} from '../app/adapters';
import {
    FlowPresenter,
} from '../app/presenters';
import { showToast } from '../app/toast';

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
    const flows = result.map(
        wf => new FlowPresenter(wf),
    );

    setHtml(
        listEl,
        html`${flows.map(
            wf => wf.buildCard(),
        )}`,
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
        () => closeDialog('import-flow'),
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
}

async function openImportDialog(
): Promise<void> {
    const select = $select(
        '#import-project', document,
    );
    if (!select) return;

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
        const opt =
            document.createElement(
                'option',
            );
        opt.value = p.id;
        opt.textContent = p.title;
        select.appendChild(opt);
    }

    openDialog('import-flow');
}

async function handleFileSelect(
    input: HTMLInputElement,
): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;

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

    const ext = file.name
        .split('.').pop()
        ?.toLowerCase();

    let result: {
        flowId: string;
        warnings: string[];
    };
    try {
        result = ext === 'zip'
            ? await importFlowFromZip(
                new Uint8Array(
                    await file.arrayBuffer(),
                ),
                projectId,
            )
            : await importFlowFromMermaid(
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
