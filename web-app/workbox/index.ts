import { $, populateIcons } from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import { log } from '../app/logger';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconMail,
    iconArchive,
    iconPlus,
    iconGripVertical,
} from '../app/icons';
import {
    navigateTo,
    initTabs,
    initDropdown,
} from '../app/core';
import {
    getActiveWorkOrders,
    getArchivedWorkOrders,
    getWorkOrder,
    getFlowsForCreation,
    postWorkOrderCreation,
    putWorkOrder,
    getCurrentUser,
} from '../app/adapters';
import type {
    WorkOrderInboxRow,
} from '../app/adapters';
import {
    initDragReorder,
} from '../app/drag-reorder';

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
    item: WorkOrderInboxRow,
    showGrip: boolean,
): ReturnType<typeof html> {
    const badge = item.isCompleted()
        ? html`<span
            class="badge badge-success"
            >Complete</span>`
        : html`<span
            class="badge badge-info"
            >${
            item.currentStateName()
        }</span>`;
    const name =
        item.lastTransitionerName();
    const from = name
        ? name : '\u2014';
    const grip = showGrip
        ? html`<div class="${
            'hidden-mobile text-muted'
            + ' cursor-grab'
        }">${
            iconGripVertical(20, '')
        }</div>`
        : html``;
    return html`
    <div
        class="card p-4 cursor-pointer"
        data-work-order-card="${item.idForLink()}"
        data-position="${
            item.positionSortKey()
        }"
    >
        <div
            class="flex items-center gap-4"
        >
            ${grip}
            <div class="flex-fill">
                <div
                    class="flex items-center
                        gap-2 mb-1"
                >
                    <span
                        class="font-semibold"
                    >${
                        item.flowNameText()
                    }</span>
                    <span
                        class="${
                            'text-xs text-muted'
                        }"
                    >#${
                        item.displayIdText()
                    }</span>
                </div>
                <div
                    class="${
                        'flex items-center'
                        + ' gap-2 text-sm'
                        + ' text-muted'
                    }"
                >
                    ${badge}
                    <span>from ${from}</span>
                    <span
                        class="ml-auto"
                    >${relativeTime(
                        item
                            .lastTransitionedAtDate(),
                    )}</span>
                </div>
            </div>
        </div>
    </div>`;
}

function buildInboxList(
    items: WorkOrderInboxRow[],
    showGrip: boolean,
): ReturnType<typeof html> {
    return html`${items.map(
        item => buildInboxRow(item, showGrip),
    )}`;
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
                        '[data-work-order-card]',
                    );
            if (!card) return;
            const id =
                card.getAttribute(
                    'data-work-order-card',
                ) ?? '';
            navigateTo(
                'workbox-detail',
                { id },
            );
        },
    );
}

async function createWorkOrderForFlow(
    flowId: string,
): Promise<void> {
    let auth: Awaited<
        ReturnType<typeof getCurrentUser>
    >;
    try {
        auth = await getCurrentUser();
    } catch (err) {
        log.error(
            'getCurrentUser failed',
            'workbox',
            err,
        );
        showToast(
            'Failed to load user',
            'error',
        );
        return;
    }
    try {
        const woId =
            await postWorkOrderCreation(
                flowId,
                auth.user.idForLink(),
            );
        showToast(
            'Work order created',
            'success',
        );
        navigateTo(
            'workbox-detail',
            { id: woId },
        );
    } catch (err) {
        log.error(
            'work order creation failed',
            'workbox',
            err,
        );
        showToast(
            'Failed to create work order',
            'error',
        );
    }
}

async function initCreateDropdown(
): Promise<void> {
    populateIcons([
        [
            '#create-work-order-btn-icon',
            iconPlus(16, ''),
        ],
    ]);

    const dropdownEl = $(
        '#create-work-order-dropdown',
        document,
    );
    if (!dropdownEl) return;

    const flows =
        await getFlowsForCreation();

    setHtml(
        dropdownEl,
        html`${flows.map(f => html`<button
            class="dropdown-item"
            data-flow-id="${f.id}"
        >${f.name}</button>`)}`,
    );

    initDropdown(
        'create-work-order-btn',
        'create-work-order-dropdown',
    );

    dropdownEl.addEventListener(
        'click',
        (e) => {
            if (
                !(e.target instanceof Element)
            ) return;
            const item =
                e.target.closest<HTMLElement>(
                    '[data-flow-id]',
                );
            if (!item) return;
            const flowId =
                item.getAttribute(
                    'data-flow-id',
                );
            if (!flowId) return;
            dropdownEl.classList.add('hidden');
            void createWorkOrderForFlow(
                flowId,
            );
        },
    );
}

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    const tabsEl = $(
        '#workbox-tabs', document,
    );
    if (tabsEl) {
        setHtml(
            tabsEl,
            html`<span
                class="badge badge-success
                    text-xs cursor-pointer
                    active"
                data-tab="active"
            >${iconMail(14, '')} Active</span>
            <span
                class="badge badge-default
                    text-xs cursor-pointer"
                data-tab="archive"
            >${iconArchive(14, '')} Archive</span>`,
        );
    }

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
                getActiveWorkOrders,
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
                buildInboxList(active, true),
            );
            initRowNavigation(activeEl);
            initDragReorder(
                activeEl,
                '[data-work-order-card]',
                'data-work-order-card',
                async (id, newPosition) => {
                    try {
                        const entity =
                            await getWorkOrder(
                                id,
                            );
                        await putWorkOrder(
                            id,
                            {
                                ...entity,
                                position:
                                    newPosition,
                            },
                        );
                    } catch (err) {
                        log.error(
                            'reorder failed',
                            'workbox', err,
                        );
                        showToast(
                            'Failed to save'
                            + ' order',
                            'error',
                        );
                        return;
                    }
                    const updated =
                        await getActiveWorkOrders();
                    setHtml(
                        activeEl,
                        buildInboxList(
                            updated, true,
                        ),
                    );
                },
            );
        }
    }

    if (archiveEl) {
        const archive =
            await withLoadingState(
                archiveEl,
                buildSkeleton(
                    'card-list', 4,
                ),
                getArchivedWorkOrders,
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
                buildInboxList(
                    archive, false,
                ),
            );
            initRowNavigation(archiveEl);
        }
    }

    await initCreateDropdown();
}
