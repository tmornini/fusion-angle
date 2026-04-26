import {
    $, populateIcons, attr,
} from '../app/dom';
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
    iconMail, iconArchive, iconPlus,
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
import {
    WorkboxInboxPresenter,
} from '../app/presenters';
import {
    initDragReorder,
} from '../app/drag-reorder';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let activePresenter:
    WorkboxInboxPresenter | null = null;

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    renderTabs();
    initTabs(
        '[data-tab]', '.tab-panel', 'active',
    );

    const activeEl =
        $('#active-list', document);
    const archiveEl =
        $('#archive-list', document);

    if (activeEl) {
        await initActiveList(activeEl);
    }
    if (archiveEl) {
        await initArchiveList(archiveEl);
    }

    await initCreateDropdown();
}

function renderTabs(): void {
    const tabsEl = $(
        '#workbox-tabs', document,
    );
    if (!tabsEl) return;
    setHtml(tabsEl, html`
        <span class="${
            'badge badge-success'
            + ' text-xs cursor-pointer active'
        }" data-tab="active">${
            iconMail(14, '')
        } Active</span>
        <span class="${
            'badge badge-default'
            + ' text-xs cursor-pointer'
        }" data-tab="archive">${
            iconArchive(14, '')
        } Archive</span>`);
}

async function initActiveList(
    activeEl: HTMLElement,
): Promise<void> {
    const items = await withLoadingState(
        activeEl,
        buildSkeleton('card-list', 4),
        getActiveWorkOrders,
        init,
        {
            icon: iconMail(24, ''),
            title:
                'No Active Work Orders Yet',
            description:
                'Create a work order to get'
                + ' started.',
        },
    );
    if (!items) return;

    activePresenter =
        new WorkboxInboxPresenter(
            items, true,
        );
    activePresenter.renderList(activeEl);
    bindRowNavigation(activeEl);

    initDragReorder(
        activeEl,
        '[data-work-order-card]',
        'data-work-order-card',
        async (id, newPosition) => {
            try {
                const entity =
                    await getWorkOrder(id);
                await putWorkOrder(id, {
                    ...entity,
                    position: newPosition,
                });
            } catch (err) {
                log.error(
                    'reorder failed',
                    'workbox', err,
                );
                showToast(
                    'Failed to save order',
                    'error',
                );
                return;
            }
            const updated =
                await getActiveWorkOrders();
            if (activePresenter) {
                activePresenter.update(
                    updated,
                );
                activePresenter.renderList(
                    activeEl,
                );
            }
        },
    );
}

async function initArchiveList(
    archiveEl: HTMLElement,
): Promise<void> {
    const items = await withLoadingState(
        archiveEl,
        buildSkeleton('card-list', 4),
        getArchivedWorkOrders,
        init,
        {
            icon: iconMail(24, ''),
            title:
                'No Archived Work Orders Yet',
            description:
                'Completed work orders will'
                + ' appear here.',
        },
    );
    if (!items) return;

    const presenter = new WorkboxInboxPresenter(
        items, false,
    );
    presenter.renderList(archiveEl);
    bindRowNavigation(archiveEl);
}

function bindRowNavigation(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click', e => onRowClick(e),
        { signal },
    );
}

function onRowClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    const card = e.target.closest<HTMLElement>(
        '[data-work-order-card]',
    );
    if (!card) return;
    const id = attr(
        card, 'data-work-order-card',
    );
    navigateTo('workbox-detail', { id });
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
            'workbox', err,
        );
        showToast(
            'Failed to load user', 'error',
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
            'Work order created', 'success',
        );
        navigateTo(
            'workbox-detail', { id: woId },
        );
    } catch (err) {
        log.error(
            'work order creation failed',
            'workbox', err,
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

    const flows = await getFlowsForCreation();

    setHtml(dropdownEl, html`${flows.map(
        f => html`<button
            class="dropdown-item"
            data-flow-id="${f.id}"
        >${f.name}</button>`,
    )}`);

    initDropdown(
        'create-work-order-btn',
        'create-work-order-dropdown',
    );

    dropdownEl.addEventListener(
        'click',
        e => onDropdownClick(e, dropdownEl),
        { signal },
    );
}

function onDropdownClick(
    e: MouseEvent,
    dropdownEl: HTMLElement,
): void {
    if (
        !(e.target instanceof Element)
    ) return;
    const item = e.target.closest<HTMLElement>(
        '[data-flow-id]',
    );
    if (!item) return;
    const flowId = item.getAttribute(
        'data-flow-id',
    );
    if (!flowId) return;
    dropdownEl.classList.add('hidden');
    void createWorkOrderForFlow(flowId);
}
