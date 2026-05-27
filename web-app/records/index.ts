import {
    $, getRequiredAttribute, populateIcons,
} from '../app/dom.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    iconPlus, iconFolderKanban,
} from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    createRequestContext,
    getRecords,
    getRecord,
    putRecord,
    subscribeRecordChanges,
    isRecordState,
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

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let recordState: RecordListState | null = null;
let listEl: HTMLElement | null = null;
let badgesEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const recordsListEl = $(
        '#records-list', document,
    );
    if (!recordsListEl) return;

    const ctx = createRequestContext();
    const records = await withLoadingState(
        recordsListEl,
        buildSkeleton('card-list', 4),
        () => getRecords(ctx),
        init,
        {
            icon: iconFolderKanban(24, ''),
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
            },
        },
    );

    populateIcons([
        ['#create-btn-icon', iconPlus(16, '')],
    ]);

    $('#create-record-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('record-create'),
            { signal },
        );

    if (!records) return;

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
            createRequestContext(),
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
                    r => r.entity.id === id,
                );
            if (!found) return;
            const ctx = createRequestContext();
            const fresh = await getRecord(
                ctx, id,
            );
            await putRecord(ctx, id, {
                name: fresh.name,
                description: fresh.description,
                position: newPosition,
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
