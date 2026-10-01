import {
    $, $required, getRequiredAttribute,
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
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    getRecords,
    putRecord,
    recordOf,
    subscribeRecordChanges,
    type RecordWithCounts,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { isRecordState } from '../../shared/types.ts';
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
                )?.classList.add('hidden');
                subscribeOnce(
                    subscribeRecordChanges, init,
                    err => handlePageLoadError('records', err),
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
            const {
                id: _id,
                organization_id: _organizationId,
                ...fields
            } = held.body().toValue();
            const saved = await putRecord(
                sessionContext(), held,
                { ...fields, position: newPosition },
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
