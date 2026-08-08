import {
    $, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    loadInto,
    type EmptyStateConfig,
} from '../app/loading-states.ts';
import {
    ICON_SIZE,
    iconMail, iconArchive, iconPlus,
    iconNoEntry,
} from '../app/icons.ts';
import {
    navigateTo,
    initTabs,
    initDropdown,
} from '../app/core.ts';
import {
    getWorkOrders,
    getWorkOrderHistories,
    projectTransitions,
    activeClaimFromHistory,
    getMemberMap,
    getFlowsForCreation,
    postWorkOrderCreation,
    putWorkOrder,
    sessionContext,
    generateCryptoSafeBase62,
    subscribeWorkOrderChanges,
    type NotReadyFlowEntry,
    type RequestContext,
    type WorkOrder,
    type TransitionEvent,
    type Member,
} from '../app/adapters/index.ts';
import type { Id } from '../../api/types.ts';
import {
    WorkboxInboxPresenter,
    buildInboxItems,
    type InboxMode,
    type InboxItem,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const { signal } = createPageAbort();

let activePresenter:
    WorkboxInboxPresenter | null = null;
let workOrdersById:
    Map<string, WorkOrder> = new Map();

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

    const ctx = sessionContext();
    // One shared inbox fetch feeds both lists.
    const rowsPromise = fetchInboxRows(ctx);
    const listInits: Array<Promise<void>> = [];
    if (activeEl) {
        listInits.push(
            initActiveList(activeEl, ctx, rowsPromise),
        );
    }
    if (archiveEl) {
        listInits.push(
            initArchiveList(
                archiveEl, ctx, rowsPromise,
            ),
        );
    }
    await Promise.all([
        ...listInits,
        initCreateDropdown(ctx),
    ]);

    subscribeWorkOrderChanges(() => {
        // One refetch, feed both lists.
        const shared = fetchInboxRows(ctx);
        if (activeEl) {
            void rerenderInbox(
                activeEl, 'active', ctx, shared,
            );
        }
        if (archiveEl) {
            void rerenderInbox(
                archiveEl, 'archived', ctx, shared,
            );
        }
    });
}

function emptyStateFor(
    mode: InboxMode,
): EmptyStateConfig {
    if (mode === 'active') {
        return {
            icon: iconMail(ICON_SIZE['2xl'], ''),
            title: 'No Active Work Orders Yet',
            description:
                'Create a work order to get'
                + ' started.',
        };
    }
    return {
        icon: iconMail(ICON_SIZE['2xl'], ''),
        title: 'No Archived Work Orders Yet',
        description:
            'Completed work orders will'
            + ' appear here.',
    };
}

async function rerenderInbox(
    listEl: HTMLElement,
    mode: InboxMode,
    ctx: RequestContext,
    rowsPromise?: Promise<InboxRows>,
): Promise<void> {
    const rows = rowsPromise ?? fetchInboxRows(ctx);
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rows.then(
            r => buildItems(r, mode),
        ),
        retry: init,
        emptyState: emptyStateFor(mode),
        onData: items => {
            const presenter =
                new WorkboxInboxPresenter(
                    items, mode === 'active',
                );
            presenter.renderList(listEl);
            if (mode === 'active') {
                activePresenter = presenter;
            }
        },
    });
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
            iconMail(ICON_SIZE.sm, '')
        } Active</span>
        <span class="${
            'badge badge-default'
            + ' text-xs cursor-pointer'
        }" data-tab="archive">${
            iconArchive(ICON_SIZE.sm, '')
        } Archive</span>`);
}

interface InboxRows {
    workOrders: WorkOrder[];
    transitionsByWo: Map<Id, TransitionEvent[]>;
    activeClaimsByWo: Map<
        Id, { memberId: Id; at: string }
    >;
    memberMap: Map<string, Member>;
}

async function fetchInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    const [
        workOrders, histories, memberMap,
    ] = await Promise.all([
        getWorkOrders(ctx),
        getWorkOrderHistories(ctx),
        getMemberMap(ctx),
    ]);
    workOrdersById = new Map(
        workOrders.map(w => [w.id, w]),
    );
    const lockTimeoutByWo = new Map<Id, number>(
        workOrders.map(wo => [
            wo.id,
            wo.flowGraph.lockTimeout,
        ]),
    );
    const transitionsByWo = new Map<
        Id, TransitionEvent[]
    >();
    const activeClaimsByWo = new Map<
        Id, { memberId: Id; at: string }
    >();
    for (const [woId, history] of histories) {
        const events = projectTransitions(
            woId, history,
        );
        if (events.length > 0) {
            transitionsByWo.set(woId, events);
        }
        const lockTimeout =
            lockTimeoutByWo.get(woId);
        if (lockTimeout === undefined) continue;
        const claim = activeClaimFromHistory(
            history, lockTimeout,
        );
        if (claim !== null) {
            activeClaimsByWo.set(woId, claim);
        }
    }
    return {
        workOrders,
        transitionsByWo,
        activeClaimsByWo,
        memberMap,
    };
}

function buildItems(
    rows: InboxRows,
    mode: InboxMode,
): InboxItem[] {
    return buildInboxItems(
        rows.workOrders,
        rows.transitionsByWo,
        rows.activeClaimsByWo,
        rows.memberMap,
        mode,
    );
}

async function loadInboxItems(
    mode: InboxMode,
    ctx: RequestContext,
): Promise<InboxItem[]> {
    return buildItems(
        await fetchInboxRows(ctx), mode,
    );
}

async function initActiveList(
    activeEl: HTMLElement,
    ctx: RequestContext,
    rowsPromise: Promise<InboxRows>,
): Promise<void> {
    await loadInto({
        container: activeEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rowsPromise.then(
            r => buildItems(r, 'active'),
        ),
        retry: init,
        emptyState: emptyStateFor('active'),
        onData: items => onActiveListLoaded(
            items, activeEl, ctx,
        ),
    });
}

function onActiveListLoaded(
    items: InboxItem[],
    activeEl: HTMLElement,
    ctx: RequestContext,
): void {
    activePresenter = new WorkboxInboxPresenter(
        items, true,
    );
    activePresenter.renderList(activeEl);
    bindRowNavigation(activeEl);

    initDragReorder(
        activeEl,
        '[data-work-order-card]',
        'data-work-order-card',
        async (id, newPosition) => {
            const workOrder =
                workOrdersById.get(id);
            if (!workOrder) return;
            try {
                await putWorkOrder(ctx, id, {
                    displayId: workOrder.displayId,
                    flowGraph: workOrder.flowGraph,
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
            const refreshed =
                await loadInboxItems('active', ctx);
            activePresenter =
                new WorkboxInboxPresenter(
                    refreshed, true,
                );
            activePresenter.renderList(
                activeEl,
            );
        },
    );
}

async function initArchiveList(
    archiveEl: HTMLElement,
    _ctx: RequestContext,
    rowsPromise: Promise<InboxRows>,
): Promise<void> {
    await loadInto({
        container: archiveEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rowsPromise.then(
            r => buildItems(r, 'archived'),
        ),
        retry: init,
        emptyState: emptyStateFor('archived'),
        onData: items => {
            const presenter =
                new WorkboxInboxPresenter(
                    items, false,
                );
            presenter.renderList(archiveEl);
            bindRowNavigation(archiveEl);
        },
    });
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
    // Real links navigate themselves, and
    // the reorder handle is not navigation.
    if (e.target.closest(
        'a[href], .drag-handle',
    )) return;
    const card = e.target.closest<HTMLElement>(
        '[data-work-order-card]',
    );
    if (!card) return;
    const id = getRequiredAttribute(
        card, 'data-work-order-card',
    );
    navigateTo('workbox-detail', { id });
}

async function createWorkOrderForFlow(
    flowId: string,
    ctx: RequestContext,
): Promise<void> {
    const workOrderId =
        generateCryptoSafeBase62();
    const flowLinkId =
        generateCryptoSafeBase62();
    try {
        await postWorkOrderCreation(ctx, {
            workOrderId,
            flowLinkId,
            flowId,
        });
        showToast(
            'Work order created', 'success',
        );
        navigateTo(
            'workbox-detail',
            { id: workOrderId },
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
    ctx: RequestContext,
): Promise<void> {
    populateIcons([
        [
            '#create-work-order-btn-icon',
            iconPlus(ICON_SIZE.base, ''),
        ],
    ]);

    const dropdownEl = $(
        '#create-work-order-dropdown',
        document,
    );
    if (!dropdownEl) return;

    const { ready, notReady } =
        await getFlowsForCreation(ctx);

    if (ready.length === 0 && notReady.length === 0) {
        setHtml(dropdownEl, html`<div
            class="dropdown-empty"
        >No flows available</div>`);
    } else {
        const readySection =
            ready.length > 0
                ? html`<div
                        class="dropdown-section-label"
                    >READY</div>${ready.map(
                        f => html`<button
                            class="dropdown-item"
                            data-flow-id="${f.id}"
                        >${f.name}</button>`,
                    )}`
                : html``;
        const notReadySection =
            notReady.length > 0
                ? html`<div
                        class="dropdown-section-label"
                    >NOT READY</div>${
                        notReady.map(buildNotReadyRow)
                    }`
                : html``;
        setHtml(
            dropdownEl,
            html`${readySection}${notReadySection}`,
        );
    }

    initDropdown(
        'create-work-order-btn',
        'create-work-order-dropdown',
    );

    dropdownEl.addEventListener(
        'click',
        e => onDropdownClick(e, dropdownEl, ctx),
        { signal },
    );
}

function buildNotReadyRow(f: NotReadyFlowEntry) {
    const subtitle = f.problemCount === 1
        ? '1 node needs attention'
        : `${f.problemCount} nodes need attention`;
    return html`<div
        class="dropdown-item-disabled"
        aria-disabled="true"
    ><span
        class="not-ready-icon"
    >${iconNoEntry(ICON_SIZE.base, '')}</span><span
        class="not-ready-body"
    ><span
        class="not-ready-name"
    >${f.name}</span><span
        class="not-ready-subtitle"
    >${subtitle}</span></span></div>`;
}

function onDropdownClick(
    e: MouseEvent,
    dropdownEl: HTMLElement,
    ctx: RequestContext,
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
    void createWorkOrderForFlow(flowId, ctx);
}
