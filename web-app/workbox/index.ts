import {
    $, $$, $input, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import { createPageAbort } from
    '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import {
    buildErrorState,
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { extractErrorMessage } from
    '../app/error-helpers.ts';
import {
    ICON_SIZE,
    iconPlus,
    iconNoEntry,
    iconSearch,
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
    queryInboxRows,
    type InboxRows,
} from '../app/workbox-inbox-rows.ts';
import {
    WorkboxInboxPresenter,
    buildInboxItems,
    partitionInboxItems,
    type InboxFilter,
    type InboxListKind,
    type InboxLists,
} from '../app/presenters/index.ts';
import {
    inboxListKindFromHash,
    initInboxDrag,
    paintInboxDrop,
    transferInboxDrop,
    type InboxOrder,
    type InboxTransfer,
} from '../app/workbox-inbox-drag.ts';
import {
    RequestError,
    HTTP_CONFLICT,
} from '../../shared/http-errors.ts';
import { QUERY_TEXT_MAX_LENGTH } from
    '../../shared/search-match.ts';

const { signal } = createPageAbort();

// The pause after the last keystroke before the search
// sends its QUERY.
const SEARCH_PAUSE_MS = 200;
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

const NO_FILTER: InboxFilter = { kind: 'none' };

// What the lists show: every work order from the last
// full GET (inboxRows), a QUERY's answer, or the error
// state of the read that failed.
type InboxView =
    | { readonly kind: 'all' }
    | {
        readonly kind: 'matched';
        readonly text: string;
        readonly rows: InboxRows;
    }
    | { readonly kind: 'failed' };

type InboxListElements = {
    readonly available: HTMLElement;
    readonly claimed: HTMLElement;
};

let inboxRows: InboxRows | null = null;
let inboxView: InboxView = { kind: 'all' };
// Bumped by every keystroke, read, and drop: a read that
// finishes under an older number paints nothing.
let listsSequence = 0;
let searchTimer:
    ReturnType<typeof setTimeout> | undefined;
let currentMemberId: string | null = null;
let rightListKind: 'claimed' | 'archivedByMe' =
    'claimed';
let dragBound = false;
let searchBound = false;
let phoneOrderBound = false;
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

    const lists: InboxListElements = {
        available: availableEl,
        claimed: claimedEl,
    };
    const searchEl = $input('#workbox-search', document);
    if (!searchEl) return;
    searchEl.maxLength = QUERY_TEXT_MAX_LENGTH;
    populateIcons([
        [
            '#workbox-search-icon',
            iconSearch(ICON_SIZE.base, ''),
        ],
    ]);

    const ctx = sessionContext();
    if (!phoneOrderBound) {
        phoneOrderBound = true;
        bindPhoneOrder();
    }
    currentMemberId =
        (await getCurrentHumanMember(ctx)).id;
    const rowsPromise = fetchInboxRows(ctx);
    const sequence = listsSequence;
    if (!searchBound) {
        searchBound = true;
        bindSearchBox(searchEl, lists, ctx);
    }
    await Promise.all([
        renderAvailable(
            availableEl, ctx, sequence, rowsPromise,
        ),
        renderRightList(
            claimedEl, ctx, sequence, rowsPromise,
        ),
        initCreateDropdown(ctx),
    ]);

    subscribeWorkOrderChanges(() => {
        if (dropInFlight) return;
        void refreshInboxLists(searchEl, lists, ctx);
    });

    const root = $('#workbox-inbox', document);
    if (root && !dragBound) {
        dragBound = true;
        initInboxDrag(root, {
            cardSelector:
                '[data-work-order-card]',
            idAttribute: 'data-work-order-card',
            rightListKind: () => rightListKind,
            order: inboxOrder,
            onDrop: (id, transfer) => {
                void onInboxDrop(
                    id, transfer, searchEl, lists, ctx,
                );
            },
        });
    }
}

function bindSearchBox(
    searchEl: HTMLInputElement,
    lists: InboxListElements,
    ctx: RequestContext,
): void {
    searchEl.addEventListener('input', () => {
        onSearchInput(searchEl, lists, ctx);
    }, { signal });
    searchEl.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || searchEl.value === '') {
            return;
        }
        e.preventDefault();
        searchEl.value = '';
        onSearchInput(searchEl, lists, ctx);
    }, { signal });
    // A box the browser restored on history navigation
    // searches as if typed.
    if (searchText(searchEl) !== '') {
        onSearchInput(searchEl, lists, ctx);
    }
}

// An emptied box shows every work order at once; text
// waits for the pause, so one QUERY follows a burst of
// keystrokes.
function onSearchInput(
    searchEl: HTMLInputElement,
    lists: InboxListElements,
    ctx: RequestContext,
): void {
    listsSequence += 1;
    clearTimeout(searchTimer);
    if (searchText(searchEl) === '') {
        void refreshInboxLists(searchEl, lists, ctx);
        return;
    }
    searchTimer = setTimeout(() => {
        void refreshInboxLists(searchEl, lists, ctx);
    }, SEARCH_PAUSE_MS);
}

function searchText(searchEl: HTMLInputElement): string {
    return searchEl.value.trim();
}

// CSS order moves no focus, and the DOM puts the box
// before the button and available before claimed, so a
// phone's stacked order is the DOM's own.
function bindPhoneOrder(): void {
    const phone = matchMedia(MOBILE_MEDIA_QUERY);
    followPhoneOrder(phone.matches);
    phone.addEventListener('change', e => {
        followPhoneOrder(e.matches);
    }, { signal });
}

function followPhoneOrder(phone: boolean): void {
    const box = $('.workbox-header > .search-wrapper', document);
    const actions = $('#workbox-header-actions', document);
    const available = $('#available-list', document)
        ?.closest('.card');
    const claimed = $('#claimed-list', document)
        ?.closest('.card');
    if (!box || !actions || !available || !claimed) return;
    if (phone) {
        actions.after(box);
        available.before(claimed);
    } else {
        actions.before(box);
        claimed.before(available);
    }
}

function inboxOrder(): InboxOrder {
    if (inboxView.kind !== 'matched') {
        return { kind: 'dragged' };
    }
    return {
        kind: 'matched',
        claimedPositions: claimedPositionsOf(inboxView),
    };
}

// The positions of every live claim the caller holds in
// the last full GET and in the answer, the answer's
// fresher, so a claim takes the bottom of the whole
// claimed order rather than of the visible subset.
function claimedPositionsOf(
    view: Extract<InboxView, { kind: 'matched' }>,
): number[] {
    const byId = new Map<string, number>();
    const sources = inboxRows === null
        ? [view.rows]
        : [inboxRows, view.rows];
    for (const rows of sources) {
        for (const item of matchedListsOf(rows).claimed) {
            byId.set(item.id, item.position);
        }
    }
    return [...byId.values()].toSorted((a, b) => a - b);
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
            const availableEl =
                $('#available-list', document);
            const searchEl =
                $input('#workbox-search', document);
            const ctx = sessionContext();
            if (!claimedEl || !availableEl || !searchEl) {
                return;
            }
            const text = searchText(searchEl);
            if (text === '') {
                void renderRightList(
                    claimedEl, ctx, listsSequence,
                );
                return;
            }
            // The same answer serves either pill; with
            // none for this text (a failed QUERY, or one
            // still pausing), the pill runs it now.
            if (
                inboxView.kind === 'matched'
                && inboxView.text === text
            ) {
                paintRightList(
                    claimedEl,
                    matchedListsOf(inboxView.rows),
                    filterOf(inboxView),
                );
                return;
            }
            void refreshInboxLists(searchEl, {
                available: availableEl,
                claimed: claimedEl,
            }, ctx);
        }, { signal });
    }
}

async function fetchInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    inboxRows = await getInboxRows(ctx);
    return inboxRows;
}

// Every list is built after init resolves the caller.
function requireCurrentMemberId(): string {
    if (currentMemberId === null) {
        throw new Error(
            'workbox: lists built before the caller'
            + ' resolved',
        );
    }
    return currentMemberId;
}

function listsFrom(
    rows: InboxRows,
) {
    return buildInboxItems(
        rows.workOrders,
        rows.activeClaimsByWo,
        requireCurrentMemberId(),
    );
}

function matchedListsOf(rows: InboxRows): InboxLists {
    return partitionInboxItems(
        rows.workOrders,
        rows.activeClaimsByWo,
        requireCurrentMemberId(),
    );
}

function filterOf(view: InboxView): InboxFilter {
    return view.kind === 'matched'
        ? { kind: 'matched', text: view.text }
        : NO_FILTER;
}

// The box decides the read: empty, today's GET; text, its
// QUERY. Each read takes the next sequence number, so only
// the newest paints.
async function refreshInboxLists(
    searchEl: HTMLInputElement,
    lists: InboxListElements,
    ctx: RequestContext,
): Promise<void> {
    listsSequence += 1;
    const sequence = listsSequence;
    const text = searchText(searchEl);
    if (text === '') {
        await showAllLists(lists, ctx, sequence, () => {
            void refreshInboxLists(searchEl, lists, ctx);
        });
        return;
    }
    await showMatchedLists(lists, ctx, sequence, text, () => {
        void refreshInboxLists(searchEl, lists, ctx);
    });
}

async function showAllLists(
    lists: InboxListElements,
    ctx: RequestContext,
    sequence: number,
    retry: () => void,
): Promise<void> {
    let rows: InboxRows;
    try {
        rows = await fetchInboxRows(ctx);
    } catch (err) {
        if (sequence !== listsSequence) return;
        log.error('inbox read failed', 'workbox', err);
        inboxView = { kind: 'failed' };
        paintListsError(lists, err, retry);
        return;
    }
    if (sequence !== listsSequence) return;
    inboxView = { kind: 'all' };
    paintInboxLists(lists, listsFrom(rows), NO_FILTER);
}

// The answer's members are the last full GET's, read
// first when no GET has landed yet.
async function showMatchedLists(
    lists: InboxListElements,
    ctx: RequestContext,
    sequence: number,
    text: string,
    retry: () => void,
): Promise<void> {
    let rows: InboxRows;
    try {
        const all = inboxRows ?? await fetchInboxRows(ctx);
        rows = await queryInboxRows(
            ctx, text, all.memberMap,
        );
    } catch (err) {
        if (sequence !== listsSequence) return;
        log.error('inbox search failed', 'workbox', err);
        inboxView = { kind: 'failed' };
        paintListsError(lists, err, retry);
        return;
    }
    if (sequence !== listsSequence) return;
    inboxView = { kind: 'matched', text, rows };
    paintInboxLists(
        lists, matchedListsOf(rows), filterOf(inboxView),
    );
}

// The page's failed-load treatment in both lists: never
// the unfiltered lists standing in for a failed search.
function paintListsError(
    lists: InboxListElements,
    err: unknown,
    retry: () => void,
): void {
    for (const listEl of [lists.available, lists.claimed]) {
        setHtml(listEl, buildErrorState(
            extractErrorMessage(
                err,
                'An unexpected error occurred.'
                + ' Please try again.',
            ),
            'Try Again',
        ));
        $('[data-retry-btn]', listEl)
            ?.addEventListener('click', retry);
    }
}

function rightListKindOf(): InboxListKind {
    return rightListKind === 'archivedByMe'
        ? 'archivedByMe'
        : 'claimed';
}

function paintRightList(
    claimedEl: HTMLElement,
    lists: InboxLists,
    filter: InboxFilter,
): void {
    const kind = rightListKindOf();
    claimedEl.setAttribute('data-inbox-list', kind);
    new WorkboxInboxPresenter(
        kind === 'archivedByMe'
            ? lists.archivedByMe
            : lists.claimed,
        kind,
        filter,
    ).renderList(claimedEl);
    bindRowNavigation(claimedEl);
}

function paintInboxLists(
    els: InboxListElements,
    lists: InboxLists,
    filter: InboxFilter,
): void {
    new WorkboxInboxPresenter(
        lists.available, 'available', filter,
    ).renderList(els.available);
    bindRowNavigation(els.available);
    paintRightList(els.claimed, lists, filter);
}

function paintInboxView(els: InboxListElements): void {
    if (inboxView.kind === 'matched') {
        paintInboxLists(
            els,
            matchedListsOf(inboxView.rows),
            filterOf(inboxView),
        );
        return;
    }
    if (inboxRows === null) return;
    paintInboxLists(els, listsFrom(inboxRows), NO_FILTER);
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

// A load under an older sequence number than the lists'
// paints nothing: a search has moved past it.
async function renderAvailable(
    listEl: HTMLElement,
    ctx: RequestContext,
    sequence: number,
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
            if (sequence !== listsSequence) return;
            new WorkboxInboxPresenter(
                items, 'available', NO_FILTER,
            ).renderList(listEl);
            bindRowNavigation(listEl);
        },
    });
}

async function renderRightList(
    listEl: HTMLElement,
    ctx: RequestContext,
    sequence: number,
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
            if (sequence !== listsSequence) return;
            new WorkboxInboxPresenter(
                items, kind, NO_FILTER,
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

// A drag on a search result latches the message the
// answer holds; after the drop the search re-runs, since
// the move may change what matches.
async function onInboxDrop(
    id: string,
    transfer: InboxTransfer,
    searchEl: HTMLInputElement,
    lists: InboxListElements,
    ctx: RequestContext,
): Promise<void> {
    const view = inboxView;
    const rows = view.kind === 'matched'
        ? view.rows
        : inboxRows;
    if (!rows || transfer.kind === 'none') {
        return;
    }
    const held = rows.workOrders.find(
        wo => wo.id === id,
    );
    if (!held) return;
    const card = cardById(id);
    if (card) {
        paintInboxDrop(
            card, transfer, lists, filterOf(view),
        );
    }
    listsSequence += 1;
    dropInFlight = true;
    try {
        const moved = await transferInboxDrop(
            ctx, held, transfer,
        );
        latchMoved(moved);
        paintInboxView(lists);
        // The drop discarded any read in flight, so the
        // box's own read runs again: its QUERY when it
        // has text, today's GET when it was emptied
        // under a painted answer.
        if (
            searchText(searchEl) !== ''
            || inboxView.kind === 'matched'
        ) {
            await refreshInboxLists(searchEl, lists, ctx);
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
        await refreshInboxLists(searchEl, lists, ctx);
    } finally {
        dropInFlight = false;
    }
}

// The moved head replaces its stale twin in the last GET
// and in the answer, so the next drag on it latches the
// current message.
function latchMoved(moved: WorkOrder): void {
    if (inboxRows !== null) {
        inboxRows = latchMovedWorkOrder(inboxRows, moved);
    }
    if (inboxView.kind === 'matched') {
        inboxView = {
            ...inboxView,
            rows: latchMovedWorkOrder(
                inboxView.rows, moved,
            ),
        };
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
