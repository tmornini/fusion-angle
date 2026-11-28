import {
    $, $$, $input, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml, type SafeHtml,
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
    NO_PILL,
    buildInboxItems,
    buildInboxLists,
    buildWorkboxPills,
    inboxSectionsOf,
    partitionInboxItems,
    pillFlowNamesOf,
    pressedAmong,
    samePill,
    workboxPillsOf,
    type InboxFilter,
    type InboxLists,
    type PressedPill,
} from '../app/presenters/index.ts';
import { getHref, putAddress } from
    '../app/adapters/location.ts';
import { workOrderAddress } from
    '../app/workbox-address.ts';
import { nextWorkOrder } from '../app/workbox-next.ts';
import { WorkOrderBox } from './work-order-box.ts';
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

// The page's three regions — the pills, the lists, and the
// box that holds the open work order — and the box itself.
type WorkboxPage = {
    readonly pills: HTMLElement;
    readonly lists: HTMLElement;
    readonly box: HTMLElement;
    readonly workOrderBox: WorkOrderBox;
};

let inboxRows: InboxRows | null = null;
let inboxView: InboxView = { kind: 'all' };
// Bumped by every keystroke and read: a read that
// finishes under an older number paints nothing.
let listsSequence = 0;
let searchTimer:
    ReturnType<typeof setTimeout> | undefined;
let currentMemberId: string | null = null;
// At most one pill is pressed; a reload starts with none.
let pressed: PressedPill = NO_PILL;
// The work order a transition sent on to a step that is
// not mine: the next lists read that paints opens the one
// after it. Any open or close clears it.
let sentOnId: string | null = null;

// The page loader runs init once per document; its Try
// Again reloads the page.
export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const pillsEl = $('#workbox-pills', document);
    const listsEl = $('#work-order-lists', document);
    const boxEl = $('#work-order-box', document);
    if (!pillsEl || !listsEl || !boxEl) return;
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
    bindPhoneOrder();
    const memberId = (await getCurrentHumanMember(ctx)).id;
    currentMemberId = memberId;
    // The box's events reach the page it belongs to.
    const workOrderBox = new WorkOrderBox(boxEl, memberId, {
        opened: (id) => {
            onWorkOrderOpened(page, id);
        },
        claimMoved: (moved) => {
            onClaimMoved(page, moved);
        },
        claimRefused: () => {
            void refreshInboxLists(searchEl, page, ctx);
        },
        // The transition's bell rang before its answer
        // returned, so a lists read is already in flight;
        // whichever read paints next opens the one after it.
        sentOn: (id) => {
            sentOnId = id;
        },
    }, signal);
    const page: WorkboxPage = {
        pills: pillsEl,
        lists: listsEl,
        box: boxEl,
        workOrderBox,
    };
    bindRegions(page, searchEl, ctx);
    // The address names the work order to open: a reload
    // keeps the box, and a link can name one.
    const openId = params?.id;
    if (openId !== undefined) {
        workOrderBox.open(openId);
    }
    const rowsPromise = getInboxRows(ctx);
    const sequence = listsSequence;
    bindSearchBox(searchEl, page, ctx);
    // Any work-order change, this tab's or another's,
    // refreshes the lists and re-reads the open work
    // order. Bound before any read lands, so the box never
    // paints, claims, or transitions unheard.
    subscribeWorkOrderChanges(() => {
        void refreshInboxLists(searchEl, page, ctx);
        workOrderBox.reload();
    });
    await Promise.all([
        renderInbox(
            page, ctx, sequence, rowsPromise, searchEl,
        ),
        initCreateDropdown(ctx, workOrderBox),
    ]);
}

function bindRegions(
    page: WorkboxPage,
    searchEl: HTMLInputElement,
    ctx: RequestContext,
): void {
    page.pills.addEventListener('click', (e) => {
        onPillClick(e, page, searchEl, ctx);
    }, { signal });
    page.lists.addEventListener('click', (e) => {
        onRowClick(e, page.workOrderBox);
    }, { signal });
    page.lists.addEventListener('keydown', (e) => {
        onRowKey(e, page);
    }, { signal });
}

function bindSearchBox(
    searchEl: HTMLInputElement,
    page: WorkboxPage,
    ctx: RequestContext,
): void {
    searchEl.addEventListener('input', () => {
        onSearchInput(searchEl, page, ctx);
    }, { signal });
    searchEl.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || searchEl.value === '') {
            return;
        }
        e.preventDefault();
        searchEl.value = '';
        onSearchInput(searchEl, page, ctx);
    }, { signal });
    // A box the browser restored on history navigation
    // searches as if typed.
    if (searchText(searchEl) !== '') {
        onSearchInput(searchEl, page, ctx);
    }
}

// An emptied box shows every work order at once; text
// waits for the pause, so one QUERY follows a burst of
// keystrokes.
function onSearchInput(
    searchEl: HTMLInputElement,
    page: WorkboxPage,
    ctx: RequestContext,
): void {
    listsSequence += 1;
    clearTimeout(searchTimer);
    if (searchText(searchEl) === '') {
        void refreshInboxLists(searchEl, page, ctx);
        return;
    }
    searchTimer = setTimeout(() => {
        void refreshInboxLists(searchEl, page, ctx);
    }, SEARCH_PAUSE_MS);
}

function searchText(searchEl: HTMLInputElement): string {
    return searchEl.value.trim();
}

// CSS order moves no focus, and the DOM puts the search
// before the button and the claimed list before the
// available one, so a phone's stacked order is the DOM's
// own.
function bindPhoneOrder(): void {
    const phone = matchMedia(MOBILE_MEDIA_QUERY);
    followPhoneOrder(phone.matches);
    phone.addEventListener('change', e => {
        followPhoneOrder(e.matches);
    }, { signal });
}

function followPhoneOrder(phone: boolean): void {
    const search = $(
        '.workbox-header > .search-wrapper', document,
    );
    const actions = $('#workbox-header-actions', document);
    if (!search || !actions) return;
    if (phone) {
        actions.after(search);
    } else {
        actions.before(search);
    }
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

// Every paint follows a full read: the pills are its
// flows.
function requireInboxRows(): InboxRows {
    if (inboxRows === null) {
        throw new Error(
            'workbox: lists painted before the first read',
        );
    }
    return inboxRows;
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

// The first read takes the page's load arc: a skeleton,
// then the lists, or the failed state with Try Again.
async function renderInbox(
    page: WorkboxPage,
    ctx: RequestContext,
    sequence: number,
    rowsPromise: Promise<InboxRows>,
    searchEl: HTMLInputElement,
): Promise<void> {
    await loadInto({
        container: page.lists,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => rowsPromise,
        retry: () => {
            void refreshInboxLists(searchEl, page, ctx);
        },
        onData: (rows) => {
            if (sequence !== listsSequence) return;
            inboxRows = rows;
            inboxView = { kind: 'all' };
            paintInbox(page);
        },
    });
}

// The box decides the read: empty, today's GET; text, its
// QUERY. Each read takes the next sequence number, so only
// the newest paints, and only a read that paints becomes
// the rows on hand.
async function refreshInboxLists(
    searchEl: HTMLInputElement,
    page: WorkboxPage,
    ctx: RequestContext,
): Promise<void> {
    listsSequence += 1;
    const sequence = listsSequence;
    const text = searchText(searchEl);
    const retry = () => {
        void refreshInboxLists(searchEl, page, ctx);
    };
    if (text === '') {
        await showAllLists(page, ctx, sequence, retry);
        return;
    }
    await showMatchedLists(page, ctx, sequence, text, retry);
}

async function showAllLists(
    page: WorkboxPage,
    ctx: RequestContext,
    sequence: number,
    retry: () => void,
): Promise<void> {
    let rows: InboxRows;
    try {
        rows = await getInboxRows(ctx);
    } catch (err) {
        if (sequence !== listsSequence) return;
        log.error('inbox read failed', 'workbox', err);
        inboxView = { kind: 'failed' };
        paintListsError(page.lists, err, retry);
        closeAfterSendOn(page);
        return;
    }
    if (sequence !== listsSequence) return;
    inboxRows = rows;
    inboxView = { kind: 'all' };
    paintInbox(page);
    openAfterSendOn(page);
}

// The answer's members are the last full GET's, read
// first when no GET has landed yet.
async function showMatchedLists(
    page: WorkboxPage,
    ctx: RequestContext,
    sequence: number,
    text: string,
    retry: () => void,
): Promise<void> {
    let all: InboxRows;
    let rows: InboxRows;
    try {
        all = inboxRows ?? await getInboxRows(ctx);
        rows = await queryInboxRows(
            ctx, text, all.memberMap,
        );
    } catch (err) {
        if (sequence !== listsSequence) return;
        log.error('inbox search failed', 'workbox', err);
        inboxView = { kind: 'failed' };
        paintListsError(page.lists, err, retry);
        closeAfterSendOn(page);
        return;
    }
    if (sequence !== listsSequence) return;
    inboxRows = all;
    inboxView = { kind: 'matched', text, rows };
    paintInbox(page);
    openAfterSendOn(page);
}

// The page's failed-load treatment: never the unfiltered
// lists standing in for a failed search.
function paintListsError(
    listsEl: HTMLElement,
    err: unknown,
    retry: () => void,
): void {
    setHtml(listsEl, buildErrorState(
        extractErrorMessage(
            err,
            'An unexpected error occurred.'
            + ' Please try again.',
        ),
        'Try Again',
    ));
    $('[data-retry-btn]', listsEl)
        ?.addEventListener('click', retry);
}

// One pass over the rows on hand gives the pills their
// numbers and the lists what the pressed pill draws. The
// pills are the last full read's flows, so a search moves
// none of them. The box is not repainted.
function paintInbox(page: WorkboxPage): void {
    const full = listsFrom(requireInboxRows());
    const flowNames = pillFlowNamesOf(full);
    pressed = pressedAmong(pressed, flowNames);
    const lists = listsOnHand(full);
    paintPills(
        page.pills,
        buildWorkboxPills(
            workboxPillsOf(flowNames, lists), pressed,
        ),
    );
    paintLists(page.lists, buildInboxLists(
        inboxSectionsOf(lists, pressed),
        filterOf(inboxView),
        pressed,
    ));
    markOpenRow(page.lists, page.workOrderBox.openId());
}

// The lists the rows on hand give before any pill narrows
// them: the full read's, or the search's answer.
function listsOnHand(full: InboxLists): InboxLists {
    return inboxView.kind === 'matched'
        ? matchedListsOf(inboxView.rows)
        : full;
}

// After a send-on, once the lists have refreshed and
// painted: the topmost row as just drawn opens, never the
// one sent on; with none, the box closes.
function openAfterSendOn(page: WorkboxPage): void {
    if (sentOnId === null) return;
    const sent = sentOnId;
    sentOnId = null;
    const drawn = inboxSectionsOf(
        listsOnHand(listsFrom(requireInboxRows())), pressed,
    );
    const next = nextWorkOrder(drawn, sent);
    if (next.kind === 'open') {
        page.workOrderBox.open(next.id);
    } else {
        page.workOrderBox.close();
    }
}

// A refresh that failed has no row to open: the box closes.
function closeAfterSendOn(page: WorkboxPage): void {
    if (sentOnId === null) return;
    sentOnId = null;
    page.workOrderBox.close();
}

// A repaint replaces the rows: a row whose link held focus
// hands it to its work order's row, if that is still drawn.
function paintLists(
    listsEl: HTMLElement,
    content: SafeHtml,
): void {
    const active = document.activeElement;
    const held = active instanceof Element
        && listsEl.contains(active)
        ? active.closest('[data-work-order-card]')
        : null;
    const heldId = held === null
        ? null
        : getRequiredAttribute(held, 'data-work-order-card');
    setHtml(listsEl, content);
    if (heldId === null) return;
    $$('[data-work-order-card]', listsEl)
        .find((card) =>
            card.getAttribute('data-work-order-card')
                === heldId)
        ?.querySelector<HTMLElement>('a[href]')
        ?.focus({ preventScroll: true });
}

// A repaint replaces the pill buttons: the one that held
// focus hands it to the pill that takes its place.
function paintPills(
    pillsEl: HTMLElement,
    content: SafeHtml,
): void {
    const active = document.activeElement;
    const held = active instanceof Element
        ? active.closest('[data-workbox-pill]')
        : null;
    const heldPill = held !== null && pillsEl.contains(held)
        ? pillOf(held)
        : null;
    setHtml(pillsEl, content);
    if (heldPill === null) return;
    $$('[data-workbox-pill]', pillsEl)
        .find((el) => samePill(pillOf(el), heldPill))
        ?.focus({ preventScroll: true });
}

function pillOf(el: Element): PressedPill {
    const kind = getRequiredAttribute(el, 'data-workbox-pill');
    if (kind === 'claimed') return { kind: 'claimed' };
    if (kind === 'archivedByMe') return { kind: 'archivedByMe' };
    if (kind === 'flow') {
        return {
            kind: 'flow',
            flowName: getRequiredAttribute(el, 'data-flow-name'),
        };
    }
    throw new Error('workbox: unknown pill ' + kind);
}

// Pressing the pressed pill clears the filter. A pill
// repaints the pills and the lists, never the box.
function onPillClick(
    e: MouseEvent,
    page: WorkboxPage,
    searchEl: HTMLInputElement,
    ctx: RequestContext,
): void {
    if (!(e.target instanceof Element)) return;
    const pill = e.target.closest('[data-workbox-pill]');
    if (!pill) return;
    const next = pillOf(pill);
    pressed = samePill(next, pressed) ? NO_PILL : next;
    // A failed read has no rows to narrow: the pill runs
    // it again.
    if (inboxView.kind === 'failed') {
        void refreshInboxLists(searchEl, page, ctx);
        return;
    }
    paintInbox(page);
}

// The row whose work order the box holds carries
// aria-current; no other row does.
function markOpenRow(
    listsEl: HTMLElement,
    openId: string | null,
): void {
    for (const card of $$('[data-work-order-card]', listsEl)) {
        if (
            card.getAttribute('data-work-order-card')
                === openId
        ) {
            card.setAttribute('aria-current', 'true');
        } else {
            card.removeAttribute('aria-current');
        }
    }
}

// A plain click opens the row's work order in the box; a
// modified click on its title follows the link, as any
// link does.
function onRowClick(e: MouseEvent, box: WorkOrderBox): void {
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest('[data-work-order-card]');
    if (!card) return;
    if (e.target.closest('a[href]') && isModified(e)) {
        return;
    }
    e.preventDefault();
    // The arrow keys walk on from the row that holds focus.
    focusRow(card, { preventScroll: true });
    box.open(getRequiredAttribute(card, 'data-work-order-card'));
}

// Up and down walk the rows as the left box draws them,
// stopping at either end. Each step opens its row, except
// where opening would cost the person something: typed
// values the box would drop, or a phone's scroll away from
// the list. There only focus moves, and Enter opens.
function onRowKey(e: KeyboardEvent, page: WorkboxPage): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (isModified(e)) return;
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest('[data-work-order-card]');
    if (!card) return;
    e.preventDefault();
    const cards = $$('[data-work-order-card]', page.lists);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const at = cards.findIndex((each) => each === card);
    const next = cards[at + step];
    if (next === undefined) return;
    focusRow(next, {});
    if (
        matchMedia(MOBILE_MEDIA_QUERY).matches
        || page.workOrderBox.holdsEdits()
    ) {
        return;
    }
    page.workOrderBox.open(
        getRequiredAttribute(next, 'data-work-order-card'),
    );
}

function focusRow(card: Element, options: FocusOptions): void {
    card.querySelector<HTMLElement>('a[href]')?.focus(options);
}

function isModified(e: MouseEvent | KeyboardEvent): boolean {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

// The open work order rides the address and marks its
// row; on a phone the page scrolls to the box it opened,
// or back to the lists it closed to.
function onWorkOrderOpened(
    page: WorkboxPage,
    id: string | null,
): void {
    // An open or close the person makes while the box
    // waits to move on is the move: nothing opens after it.
    sentOnId = null;
    putAddress(workOrderAddress(getHref(), id));
    markOpenRow(page.lists, id);
    if (matchMedia(MOBILE_MEDIA_QUERY).matches) {
        (id === null ? page.lists : page.box)
            .scrollIntoView({ block: 'start' });
    }
}

// A claim or release the box landed moves its row now,
// from the head the write answered. Before the first read
// lands there is no list to move it in, and a failed read
// keeps its error; the write's bell has started a read
// either way.
function onClaimMoved(
    page: WorkboxPage,
    moved: WorkOrder,
): void {
    latchMoved(moved);
    if (inboxRows === null || inboxView.kind === 'failed') {
        return;
    }
    paintInbox(page);
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

// The moved head replaces its stale twin in the last GET
// and in the answer, so its row moves at once.
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

// The new work order opens in the box; its bell refreshes
// the lists.
async function createWorkOrderForFlow(
    flowId: string,
    ctx: RequestContext,
    box: WorkOrderBox,
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
    } catch (err) {
        log.error(
            'work order creation failed',
            'workbox', err,
        );
        showToast(
            'Failed to create work order',
            'error',
        );
        return;
    }
    showToast(
        'Work order created', 'success',
    );
    box.open(workOrderId);
}

async function initCreateDropdown(
    ctx: RequestContext,
    box: WorkOrderBox,
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
        e => onDropdownClick(e, dropdownEl, ctx, box),
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
    box: WorkOrderBox,
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
    void createWorkOrderForFlow(flowId, ctx, box);
}
