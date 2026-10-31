import {
    $, $$, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import { createPageAbort } from
    '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    ICON_SIZE,
    iconPlus,
    iconNoEntry,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { initDropdown } from '../app/dropdown.ts';
import {
    getFlowsForCreation,
    type NotReadyFlowEntry,
} from '../app/flow-publish.ts';
import {
    getCurrentHumanMember,
    isClaimedAndUnlapsed,
    subscribeWorkOrderChanges,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import {
    createWorkOrderFromFlow,
} from '../app/work-order-creation.ts';
import {
    getInboxRows,
    type InboxRows,
} from '../app/workbox-inbox-rows.ts';
import {
    WorkboxInboxPresenter,
    buildInboxItems,
    type InboxListKind,
} from '../app/presenters/index.ts';
import {
    inboxListKindFromHash,
    initInboxDrag,
    paintInboxDrop,
    transferInboxDrop,
    type InboxTransfer,
} from '../app/workbox-inbox-drag.ts';
import {
    RequestError,
    HTTP_CONFLICT,
} from '../../shared/http-errors.ts';

const { signal } = createPageAbort();

let inboxRows: InboxRows | null = null;
let currentMemberId: string | null = null;
let rightListKind: 'claimed' | 'archivedByMe' =
    'claimed';
let dragBound = false;
let dropInFlight = false;

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    rightListKind = inboxListKindFromHash(
        location.hash,
    );
    pressInboxPills();
    bindInboxPills();

    const availableEl =
        $('#available-list', document);
    const claimedEl =
        $('#claimed-list', document);
    if (!availableEl || !claimedEl) return;

    const ctx = sessionContext();
    currentMemberId =
        (await getCurrentHumanMember(ctx)).id;
    const rowsPromise = fetchInboxRows(ctx);
    await Promise.all([
        renderAvailable(availableEl, ctx, rowsPromise),
        renderRightList(claimedEl, ctx, rowsPromise),
        initCreateDropdown(ctx),
    ]);

    subscribeWorkOrderChanges(() => {
        if (dropInFlight) return;
        void (async () => {
            const rows = await fetchInboxRows(ctx);
            if (dropInFlight) return;
            paintInboxLists(
                availableEl, claimedEl, rows,
            );
        })();
    });

    const root = $('#workbox-inbox', document);
    if (root && !dragBound) {
        dragBound = true;
        initInboxDrag(root, {
            cardSelector:
                '[data-work-order-card]',
            idAttribute: 'data-work-order-card',
            rightListKind: () => rightListKind,
            onDrop: (id, transfer) => {
                void onInboxDrop(id, transfer, ctx);
            },
        });
    }
}

function pressInboxPills(): void {
    for (const pill of $$(
        '[data-inbox-pill]', document,
    )) {
        const kind = pill.getAttribute(
            'data-inbox-pill',
        );
        pill.setAttribute(
            'aria-pressed',
            kind === rightListKind
                ? 'true' : 'false',
        );
    }
}

function bindInboxPills(): void {
    for (const pill of $$(
        '[data-inbox-pill]', document,
    )) {
        pill.addEventListener('click', () => {
            const kind = pill.getAttribute(
                'data-inbox-pill',
            );
            if (
                kind !== 'claimed'
                && kind !== 'archivedByMe'
            ) return;
            rightListKind = kind;
            history.replaceState(
                null,
                '',
                kind === 'archivedByMe'
                    ? '#archived'
                    : '#active',
            );
            pressInboxPills();
            const claimedEl =
                $('#claimed-list', document);
            const ctx = sessionContext();
            if (!claimedEl) return;
            void renderRightList(claimedEl, ctx);
        }, { signal });
    }
}

async function fetchInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    inboxRows = await getInboxRows(ctx);
    return inboxRows;
}

function listsFrom(
    rows: InboxRows,
) {
    return buildInboxItems(
        rows.workOrders,
        rows.activeClaimsByWo,
        currentMemberId ?? '',
    );
}

function paintInboxLists(
    availableEl: HTMLElement,
    claimedEl: HTMLElement,
    rows: InboxRows,
): void {
    const lists = listsFrom(rows);
    new WorkboxInboxPresenter(
        lists.available, 'available',
    ).renderList(availableEl);
    bindRowNavigation(availableEl);
    const kind: InboxListKind =
        rightListKind === 'archivedByMe'
            ? 'archivedByMe'
            : 'claimed';
    claimedEl.setAttribute('data-inbox-list', kind);
    new WorkboxInboxPresenter(
        kind === 'archivedByMe'
            ? lists.archivedByMe
            : lists.claimed,
        kind,
    ).renderList(claimedEl);
    bindRowNavigation(claimedEl);
}

function latchMovedWorkOrder(
    rows: InboxRows,
    moved: WorkOrder,
): InboxRows {
    const workOrders = rows.workOrders.map(
        wo => wo.id === moved.id ? moved : wo,
    );
    const activeClaimsByWo = new Map(
        rows.activeClaimsByWo,
    );
    if (isClaimedAndUnlapsed(moved.claim)) {
        activeClaimsByWo.set(moved.id, {
            memberId: moved.claim.memberId,
            at: moved.claim.at,
        });
    } else {
        activeClaimsByWo.delete(moved.id);
    }
    return {
        ...rows,
        workOrders,
        activeClaimsByWo,
    };
}

async function renderAvailable(
    listEl: HTMLElement,
    ctx: RequestContext,
    rowsPromise?: Promise<InboxRows>,
): Promise<void> {
    const rows = rowsPromise ?? fetchInboxRows(ctx);
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rows.then(
            r => listsFrom(r).available,
        ),
        retry: init,
        onData: items => {
            new WorkboxInboxPresenter(
                items, 'available',
            ).renderList(listEl);
            bindRowNavigation(listEl);
        },
    });
}

async function renderRightList(
    listEl: HTMLElement,
    ctx: RequestContext,
    rowsPromise?: Promise<InboxRows>,
): Promise<void> {
    const rows = rowsPromise ?? fetchInboxRows(ctx);
    const kind: InboxListKind =
        rightListKind === 'archivedByMe'
            ? 'archivedByMe'
            : 'claimed';
    listEl.setAttribute('data-inbox-list', kind);
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rows.then(r => {
            const lists = listsFrom(r);
            return kind === 'archivedByMe'
                ? lists.archivedByMe
                : lists.claimed;
        }),
        retry: init,
        onData: items => {
            new WorkboxInboxPresenter(
                items, kind,
            ).renderList(listEl);
            bindRowNavigation(listEl);
        },
    });
}

function bindRowNavigation(
    container: HTMLElement,
): void {
    if (container.dataset.navBound === 'true') {
        return;
    }
    container.dataset.navBound = 'true';
    container.addEventListener(
        'click', e => onRowClick(e),
        { signal },
    );
}

function onRowClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('a[href]')) return;
    const card = e.target.closest<HTMLElement>(
        '[data-work-order-card]',
    );
    if (!card) return;
    const id = getRequiredAttribute(
        card, 'data-work-order-card',
    );
    navigateTo('workbox-detail', { id });
}

function cardById(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        '[data-work-order-card="' + id + '"]',
    );
}

async function onInboxDrop(
    id: string,
    transfer: InboxTransfer,
    ctx: RequestContext,
): Promise<void> {
    if (!inboxRows || transfer.kind === 'none') {
        return;
    }
    const rows = inboxRows;
    const held = rows.workOrders.find(
        wo => wo.id === id,
    );
    if (!held) return;
    const card = cardById(id);
    const availableEl =
        $('#available-list', document);
    const claimedEl =
        $('#claimed-list', document);
    if (card && availableEl && claimedEl) {
        paintInboxDrop(card, transfer, {
            available: availableEl,
            claimed: claimedEl,
        });
    }
    dropInFlight = true;
    try {
        const moved = await transferInboxDrop(
            ctx, held, transfer,
        );
        inboxRows = latchMovedWorkOrder(
            rows, moved,
        );
        if (availableEl && claimedEl) {
            paintInboxLists(
                availableEl, claimedEl, inboxRows,
            );
        }
    } catch (err) {
        log.error(
            'inbox drop failed', 'workbox', err,
        );
        if (
            err instanceof RequestError
            && err.status === HTTP_CONFLICT
        ) {
            showToast(
                'Someone else holds that'
                + ' work order',
                'error',
            );
        } else {
            showToast(
                'Failed to save order',
                'error',
            );
        }
        if (availableEl) {
            await renderAvailable(availableEl, ctx);
        }
        if (claimedEl) {
            await renderRightList(claimedEl, ctx);
        }
    } finally {
        dropInFlight = false;
    }
}

async function createWorkOrderForFlow(
    flowId: string,
    ctx: RequestContext,
): Promise<void> {
    const workOrderId =
        generateIdentifier();
    const flowLinkId =
        generateIdentifier();
    try {
        await createWorkOrderFromFlow(ctx, {
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
