import {
    $, $$, $required, getRequiredAttribute,
    populateIcons,
} from '../app/dom.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { subscribeOnce } from '../../client/channels.ts';
import { handlePageLoadError } from '../app/page-loader.ts';
import {
    ICON_SIZE,
    iconPlus, iconDatabase,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { showToast } from '../app/toast.ts';
import { getHref, putAddress } from
    '../app/adapters/location.ts';
import { recordAddress } from '../app/record-address.ts';
import {
    initRecordPanel,
    openRecord,
    openRecordId,
    recordIsEditing,
} from './record-panel.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    getRecords,
    putRecord,
    recordOf,
    subscribeRecordChanges,
    type RecordWithCounts,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { isRecordState, documentFieldsOf } from '../../shared/types.ts';
import {
    RecordListPresenter,
    buildInitialRecordListState,
    applyRecordListUpdate,
    applyRecordFilterToggle,
    type RecordListState,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const { signal } = createPageAbort();

let recordState: RecordListState | null = null;
let listEl: HTMLElement | null = null;
let badgesEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';
const EDITING_NOTICE = 'Save or cancel your changes first';

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const recordsListEl = $required(
        '#records-list', document,
    );

    panelEl = $required('#record-panel', document);
    // The first record's read, so the page is ready once
    // both sides have painted.
    let opened: Promise<void> = Promise.resolve();

    const ctx = sessionContext();
    await loadInto({
        container: recordsListEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => getRecords(ctx),
        retry: () => init(params),
        emptyState: {
            icon: iconDatabase(ICON_SIZE['2xl'], ''),
            title: 'No Records Yet',
            description:
                'Define a data shape to bind'
                + ' to one or more flows.',
            action: {
                label: 'Add Your First Record',
                href: 'create.html',
            },
            onEmpty: () => {
                panelEl?.classList.add('hidden');
                $(
                    '#create-record-btn',
                    document,
                )?.classList.add('hidden');
                subscribeOnce(
                    subscribeRecordChanges, init,
                    err => handlePageLoadError('records', err),
                );
            },
        },
        onData: records => {
            opened = onRecordsLoaded(
                records, recordsListEl, params,
            );
        },
    });

    populateIcons([
        ['#create-btn-icon', iconPlus(ICON_SIZE.base, '')],
    ]);

    $('#create-record-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('record-create'),
            { signal },
        );
    await opened;
}

// The address names the record to open; with none named,
// the first one listed opens.
function onRecordsLoaded(
    records: RecordWithCounts[],
    recordsListEl: HTMLElement,
    params: Record<string, string> | undefined,
): Promise<void> {
    // The button is static markup: the empty render hides it
    // (onEmpty) and a populated one shows it again, so the
    // empty→populated re-init keeps its CTA.
    $('#create-record-btn', document)
        ?.classList.remove('hidden');
    recordState =
        buildInitialRecordListState(records);
    listEl = recordsListEl;
    badgesEl = $('#status-badges', document);

    rerenderRecords();
    if (badgesEl) {
        badgesEl.addEventListener(
            'click', onBadgeClick,
            { signal },
        );
    }
    listEl.addEventListener(
        'click', onCardClick,
        { signal },
    );
    listEl.addEventListener(
        'keydown', onCardKey,
        { signal },
    );
    const panel = $required('#record-panel', document);
    panel.classList.remove('hidden');
    initRecordPanel(panel, signal);

    subscribeRecordChanges(async () => {
        if (!recordState || !listEl) return;
        const updated = await getRecords(
            sessionContext(),
        );
        recordState = applyRecordListUpdate(
            recordState, updated,
        );
        rerenderRecords();
    });

    initDragReorder(
        listEl,
        '[data-record-card]',
        'data-record-card',
        async (id, newPosition) => {
            if (!recordState) return;
            const found =
                recordState.records.find(
                    r => r.record.idForLink()
                        === id,
                );
            if (!found) return;
            const held = found.record.message;
            const saved = await putRecord(
                sessionContext(), held,
                { ...documentFieldsOf(held), position: newPosition },
            );
            // The next drag of this card latches the head this
            // save made, not the one it replaced.
            if (!recordState) return;
            recordState = applyRecordListUpdate(
                recordState,
                recordState.records.map(r =>
                    r.record.idForLink() === id
                        ? { ...r, record: recordOf(saved) }
                        : r),
            );
        },
    );

    const first = new RecordListPresenter(recordState)
        .firstId();
    const id = params?.id ?? first;
    if (id === null) return Promise.resolve();
    const opened = openRecord(id, params?.instance);
    markOpenRecord();
    return opened;
}

function rerenderRecords(): void {
    if (!recordState || !listEl) return;
    const presenter =
        new RecordListPresenter(recordState);
    if (badgesEl) {
        presenter.renderBadges(badgesEl);
    }
    presenter.renderList(listEl);
    markOpenRecord();
}

// The card whose record the panel holds carries
// aria-current; no other card does.
function markOpenRecord(): void {
    if (!listEl) return;
    const openId = openRecordId();
    for (const card of $$('[data-record-card]', listEl)) {
        if (card.getAttribute('data-record-card') === openId) {
            card.setAttribute('aria-current', 'true');
        } else {
            card.removeAttribute('aria-current');
        }
    }
}

function onBadgeClick(e: MouseEvent): void {
    if (
        !recordState || !badgesEl || !listEl
    ) return;
    if (
        !(e.target instanceof HTMLElement)
    ) return;
    const badge = e.target
        .closest<HTMLElement>('[data-state]');
    if (!badge) return;
    const s = getRequiredAttribute(
        badge, 'data-state',
    );
    if (!isRecordState(s)) return;
    recordState = applyRecordFilterToggle(
        recordState, s,
    );
    rerenderRecords();
}

// A plain click opens the card's record in the panel; a
// modified click on its title follows the link, as any
// link does.
function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    // The reorder handle is not navigation.
    if (e.target.closest('.drag-handle')) return;
    const card = e.target.closest<HTMLElement>(
        '[data-record-card]',
    );
    if (!card) return;
    if (e.target.closest('a[href]') && isModified(e)) {
        return;
    }
    e.preventDefault();
    // The arrow keys walk on from the card that holds focus.
    focusCard(card, { preventScroll: true });
    selectRecord(
        getRequiredAttribute(card, 'data-record-card'),
    );
}

// An open form is never dropped by picking another record.
function selectRecord(id: string): void {
    if (id !== openRecordId()) {
        if (recordIsEditing()) {
            showToast(EDITING_NOTICE, 'info');
            return;
        }
        void openRecord(id);
        putAddress(recordAddress(getHref(), id));
        markOpenRecord();
    }
    if (matchMedia(MOBILE_MEDIA_QUERY).matches) {
        panelEl?.scrollIntoView({ block: 'start' });
    }
}

// Up and down walk the cards as listed, stopping at either
// end. Each step opens its record, except where that would
// cost the person something: an open form, or a phone's
// scroll away from the list. There only focus moves, and
// Enter opens.
function onCardKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (isModified(e) || !listEl) return;
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest('[data-record-card]');
    if (!card) return;
    e.preventDefault();
    const cards = $$('[data-record-card]', listEl);
    const at = cards.findIndex((each) => each === card);
    const next = cards[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next === undefined) return;
    focusCard(next, {});
    if (
        matchMedia(MOBILE_MEDIA_QUERY).matches
        || recordIsEditing()
    ) {
        return;
    }
    selectRecord(
        getRequiredAttribute(next, 'data-record-card'),
    );
}

function focusCard(card: Element, options: FocusOptions): void {
    card.querySelector<HTMLElement>('a[href]')?.focus(options);
}

function isModified(e: MouseEvent | KeyboardEvent): boolean {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}
