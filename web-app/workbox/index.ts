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
    subscribeWorkOrderChanges,
    type RequestContext,
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
} from '../app/workbox-inbox-drag.ts';

const { signal } = createPageAbort();

let inboxRows: InboxRows | null = null;
let currentMemberId: string | null = null;
let rightListKind: 'claimed' | 'archivedByMe' =
    'claimed';

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
        const shared = fetchInboxRows(ctx);
        void renderAvailable(
            availableEl, ctx, shared,
        );
        void renderRightList(
            claimedEl, ctx, shared,
        );
    });
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
