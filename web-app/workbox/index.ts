import {
    $, $select,
} from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import { iconMail } from '../app/icons';
import {
    navigateTo,
    initTabs,
    openDialog,
    closeDialog,
} from '../app/core';
import {
    getWorkboxActive,
    getWorkboxArchive,
    getFlowsForCreation,
    postWorkOrderCreation,
    getCurrentUser,
} from '../app/adapters';
import type {
    WorkboxItem,
} from '../app/adapters';

function relativeTime(
    iso: string,
): string {
    const ms = Date.now()
        - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const d = Math.floor(hr / 24);
    if (d > 0) return `${d}d ago`;
    if (hr > 0) return `${hr}h ago`;
    if (min > 0) return `${min}m ago`;
    return 'just now';
}

function buildInboxRow(
    item: WorkboxItem,
): ReturnType<typeof html> {
    const badge = item.isCompleted
        ? html`<span
            class="badge badge-success"
            >Complete</span>`
        : html`<span
            class="badge badge-info"
            >${item.currentStateName}</span>`;
    const from =
        item.lastTransitionerName
            ? item.lastTransitionerName
            : '\u2014';
    return html`
    <div
        class="card"
        style="padding:1rem;
            cursor:pointer"
        data-wo-card="${item.id}"
    >
        <div
            class="flex items-center
                gap-2 mb-1"
        >
            <span
                class="font-semibold"
            >${item.flowName}</span>
            <span
                class="text-xs text-muted"
            >#${item.displayId}</span>
        </div>
        <div
            class="flex items-center
                gap-2 text-sm text-muted"
        >
            ${badge}
            <span>from ${from}</span>
            <span
                class="ml-auto"
            >${relativeTime(
                item.lastTransitionedAt,
            )}</span>
        </div>
    </div>`;
}

function buildInboxList(
    items: WorkboxItem[],
): ReturnType<typeof html> {
    return html`${items.map(buildInboxRow)}`;
}

function initRowNavigation(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target
                    instanceof Element)
            ) return;
            const card =
                e.target
                    .closest<HTMLElement>(
                        '[data-wo-card]',
                    );
            if (!card) return;
            const id =
                card.getAttribute(
                    'data-wo-card',
                ) ?? '';
            navigateTo(
                'workbox-detail',
                { id },
            );
        },
    );
}

async function initNewDialog(): Promise<
    void
> {
    const flowSelect = $select(
        '#new-wo-flow', document,
    );
    if (!flowSelect) return;

    const flows =
        await getFlowsForCreation();
    for (const f of flows) {
        const opt =
            document.createElement(
                'option',
            );
        opt.value = f.id;
        opt.textContent = f.name;
        flowSelect.appendChild(opt);
    }

    $('#new-wo-btn', document)
        ?.addEventListener(
            'click',
            () => openDialog('new-wo'),
        );
    $('#new-wo-cancel', document)
        ?.addEventListener(
            'click',
            () => closeDialog('new-wo'),
        );
    $('#new-wo-backdrop', document)
        ?.addEventListener(
            'click',
            (e) => {
                if (
                    e.target
                    === e.currentTarget
                ) {
                    closeDialog('new-wo');
                }
            },
        );
    $('#new-wo-submit', document)
        ?.addEventListener(
            'click',
            async () => {
                const flowId =
                    flowSelect.value;
                if (!flowId) {
                    showToast(
                        'Select a flow',
                        'error',
                    );
                    return;
                }
                try {
                    const auth =
                        await getCurrentUser();
                    const woId =
                        await postWorkOrderCreation(
                            flowId,
                            auth.user.id,
                        );
                    closeDialog('new-wo');
                    showToast(
                        'Work order created',
                        'success',
                    );
                    navigateTo(
                        'workbox-detail',
                        { id: woId },
                    );
                } catch {
                    showToast(
                        'Failed to create'
                        + ' work order',
                        'error',
                    );
                }
            },
        );
}

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    initTabs(
        '[data-tab]',
        '.tab-panel',
        'active',
    );

    const activeEl =
        $('#active-list', document);
    const archiveEl =
        $('#archive-list', document);

    if (activeEl) {
        const active =
            await withLoadingState(
                activeEl,
                buildSkeleton(
                    'card-list', 4,
                ),
                getWorkboxActive,
                init,
                {
                    icon: iconMail(24, ''),
                    title:
                        'No Active Work'
                        + ' Orders Yet',
                    description:
                        'Create a work'
                        + ' order to get'
                        + ' started.',
                },
            );
        if (active) {
            setHtml(
                activeEl,
                buildInboxList(active),
            );
            initRowNavigation(activeEl);
        }
    }

    if (archiveEl) {
        const archive =
            await withLoadingState(
                archiveEl,
                buildSkeleton(
                    'card-list', 4,
                ),
                getWorkboxArchive,
                init,
                {
                    icon: iconMail(24, ''),
                    title:
                        'No Archived Work'
                        + ' Orders Yet',
                    description:
                        'Completed work'
                        + ' orders will'
                        + ' appear here.',
                },
            );
        if (archive) {
            setHtml(
                archiveEl,
                buildInboxList(archive),
            );
            initRowNavigation(archiveEl);
        }
    }

    await initNewDialog();
}
