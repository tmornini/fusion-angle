import {
    $, $required, getRequiredAttribute,
    populateIcons,
} from '../app/dom.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { subscribeOnce } from '../app/channels.ts';
import {
    ICON_SIZE,
    iconPlus, iconDatabase,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    sessionContext,
    getRecords,
    getRecord,
    putRecord,
    subscribeRecordChanges,
    isRecordState,
    type RecordWithCounts,
} from '../app/adapters/index.ts';
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

export async function init(): Promise<void> {
    const recordsListEl = $required(
        '#records-list', document,
    );

    const ctx = sessionContext();
    await loadInto({
        container: recordsListEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: () => getRecords(ctx),
        retry: init,
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
                $(
                    '#create-record-btn',
                    document,
                )?.remove();
                subscribeOnce(
                    subscribeRecordChanges, init,
                );
            },
        },
        onData: records => onRecordsLoaded(
            records, recordsListEl,
        ),
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
}

function onRecordsLoaded(
    records: RecordWithCounts[],
    recordsListEl: HTMLElement,
): void {
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
            const ctx = sessionContext();
            // The entity fields still need a fresh fetch
            // (this handler is 2-hop, unlike ideas' 1-hop
            // reorder) — the trio alone comes from the
            // already-loaded list model's accessors below.
            const fresh = await getRecord(
                ctx, id,
            );
            await putRecord(ctx, id, {
                name: fresh.name,
                description: fresh.description,
                position: newPosition,
                state: found.record.stateValue(),
            });
        },
    );
}

function rerenderRecords(): void {
    if (!recordState || !listEl) return;
    const presenter =
        new RecordListPresenter(recordState);
    if (badgesEl) {
        presenter.renderBadges(badgesEl);
    }
    presenter.renderList(listEl);
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

function onCardClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    // Real links navigate themselves, and
    // the reorder handle is not navigation.
    if (e.target.closest(
        'a[href], .drag-handle',
    )) return;
    const card = e.target.closest<HTMLElement>(
        '[data-record-card]',
    );
    if (!card) return;
    navigateTo('record-detail', {
        id: getRequiredAttribute(
            card, 'data-record-card',
        ),
    });
}
