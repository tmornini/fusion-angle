import { $, $input } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    openDialog,
    closeDialog,
    navigateTo,
} from '../app/core.ts';
import {
    createRequestContext,
    getRecords,
    getRecordAttributeRows,
    postRecordCreation,
    subscribeRecordChanges,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';
import {
    RecordListPresenter,
    type RecordListRow,
} from '../app/presenters/index.ts';
import type {
    RecordEntity,
    FlowRecordEntity,
} from '../../api/types.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

export async function init(): Promise<void> {
    const root = $('#page-root', document);
    if (!root) return;

    const loaded = await withLoadingState(
        root,
        buildSkeleton('table', 5),
        async () => {
            const ctx = createRequestContext();
            const [records, attributes,
                flowRecords] =
                await Promise.all([
                    getRecords(ctx),
                    getRecordAttributeRows(ctx),
                    ctx.GET<FlowRecordEntity[]>(
                        'flow-records',
                    ),
                ]);
            return {
                records, attributes,
                flowRecords,
            };
        },
        init,
    );
    if (!loaded) return;

    const rows = buildRows(
        loaded.records,
        loaded.attributes,
        loaded.flowRecords,
    );
    render(root, rows);
    bindAddDialog(root);
    bindRowClicks(root);

    subscribeRecordChanges(() => {
        void refresh(root);
    });
}

async function refresh(
    root: HTMLElement,
): Promise<void> {
    const ctx = createRequestContext();
    const [records, attributes, flowRecords]
        = await Promise.all([
            getRecords(ctx),
            getRecordAttributeRows(ctx),
            ctx.GET<FlowRecordEntity[]>(
                'flow-records',
            ),
        ]);
    const rows = buildRows(
        records, attributes, flowRecords,
    );
    render(root, rows);
}

function buildRows(
    records: RecordEntity[],
    attributes: { record_id: string }[],
    flowRecords: FlowRecordEntity[],
): RecordListRow[] {
    const attrCountByRecord = new Map<
        string, number
    >();
    for (const a of attributes) {
        attrCountByRecord.set(
            a.record_id,
            (attrCountByRecord.get(a.record_id)
                ?? 0) + 1,
        );
    }
    const flowCountByRecord = new Map<
        string, number
    >();
    for (const fr of flowRecords) {
        flowCountByRecord.set(
            fr.record_id,
            (flowCountByRecord.get(fr.record_id)
                ?? 0) + 1,
        );
    }
    return records.map(r => ({
        record: r,
        attributeCount:
            attrCountByRecord.get(r.id) ?? 0,
        boundFlowCount:
            flowCountByRecord.get(r.id) ?? 0,
    }));
}

function render(
    root: HTMLElement,
    rows: RecordListRow[],
): void {
    const presenter = new RecordListPresenter(
        rows,
    );
    setHtml(root, presenter.buildPage());
}

function bindAddDialog(
    root: HTMLElement,
): void {
    root.addEventListener(
        'click',
        e => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const btn = target.closest(
                'button',
            );
            if (!btn) return;
            if (btn.id === 'record-add-btn') {
                openDialog('record-add');
                return;
            }
            if (
                btn.id === 'record-add-cancel-btn'
            ) {
                closeDialog('record-add');
                return;
            }
            if (
                btn.id === 'record-add-save-btn'
            ) {
                void handleAddRecord(root);
            }
        },
        { signal },
    );
}

async function handleAddRecord(
    root: HTMLElement,
): Promise<void> {
    const nameEl = $input(
        '#record-add-name', root,
    );
    const descEl = $input(
        '#record-add-description', root,
    );
    const name = (nameEl?.value ?? '').trim();
    const description =
        (descEl?.value ?? '').trim();
    if (name === '') {
        showToast(
            'Record name is required',
            'error',
        );
        return;
    }
    const id = generateCryptoSafeBase62();
    try {
        await postRecordCreation(
            createRequestContext(),
            id,
            { name, description },
            'active',
        );
    } catch (err) {
        showToast(
            'Failed to create Record',
            'error',
        );
        return;
    }
    closeDialog('record-add');
    navigateTo('record-detail', { id });
}

function bindRowClicks(
    root: HTMLElement,
): void {
    root.addEventListener(
        'click',
        e => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const row = target.closest(
                '[data-record-id]',
            );
            if (!(row instanceof HTMLElement)) {
                return;
            }
            const id = row.getAttribute(
                'data-record-id',
            );
            if (!id) return;
            e.preventDefault();
            navigateTo('record-detail', { id });
        },
        { signal },
    );
}
