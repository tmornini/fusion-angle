import { $ } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    navigateTo,
} from '../app/core.ts';
import {
    createRequestContext,
    getRecord,
    getRecordState,
    getRecordAttributesByRecord,
    getFlowsForRecord,
    getWorkOrdersForRecord,
    putRecord,
    putRecordAttribute,
    deleteRecordAttribute,
    subscribeRecordChanges,
    generateCryptoSafeBase62,
    jsonArrayField,
} from '../app/adapters/index.ts';
import {
    RecordDetailPresenter,
    RecordDetailEditPresenter,
    recordDraftFromView,
    allowedConstraintKinds,
    type RecordDetailDraft,
    type AttributeDraft,
    type RecordDetailView,
} from '../app/presenters/index.ts';
import type {
    FlowEntity,
    RecordAttributeEntity,
    Constraint,
} from '../../api/types.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | { kind: 'reading' }
    | {
        kind: 'editing';
        draft: RecordDetailDraft;
        originalIds: Set<string>;
    };

let pageState: PageState = { kind: 'reading' };
let currentView: RecordDetailView | null = null;
let recordId: string | null = null;

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.id;
    if (!id) {
        navigateTo('records');
        return;
    }
    recordId = id;
    const root = $('#page-root', document);
    if (!root) return;

    await load(root);
    subscribeRecordChanges(() => {
        if (pageState.kind === 'reading') {
            void load(root);
        }
    });
}

async function load(
    root: HTMLElement,
): Promise<void> {
    const id = recordId;
    if (!id) return;
    const loaded = await withLoadingState(
        root,
        buildSkeleton('detail', 1),
        async () => {
            const ctx = createRequestContext();
            const [record, state,
                attributes, flowIds,
                workOrders] = await Promise.all([
                getRecord(ctx, id),
                getRecordState(ctx, id),
                getRecordAttributesByRecord(
                    ctx, id,
                ),
                getFlowsForRecord(ctx, id),
                getWorkOrdersForRecord(ctx, id),
            ]);
            const flows = flowIds.length === 0
                ? []
                : await loadFlowSummaries(
                    ctx, flowIds,
                );
            return {
                record, state,
                attributes, flows, workOrders,
            };
        },
        () => load(root),
    );
    if (!loaded) return;
    currentView = {
        record: loaded.record,
        state: loaded.state,
        attributes: loaded.attributes,
        boundFlows: loaded.flows,
        workOrders: loaded.workOrders,
    };
    render(root);
    bindActions(root);
}

async function loadFlowSummaries(
    ctx: ReturnType<
        typeof createRequestContext
    >,
    flowIds: string[],
): Promise<{ id: string; name: string }[]> {
    const all = await ctx.GET<FlowEntity[]>(
        'flows',
    );
    const wanted = new Set(flowIds);
    return all
        .filter(f => wanted.has(f.id))
        .map(f => ({
            id: f.id, name: f.name,
        }));
}

function render(root: HTMLElement): void {
    if (!currentView) return;
    if (pageState.kind === 'reading') {
        const presenter =
            new RecordDetailPresenter(
                currentView,
            );
        setHtml(root, presenter.buildPage());
        return;
    }
    const presenter =
        new RecordDetailEditPresenter(
            pageState.draft,
        );
    setHtml(root, presenter.buildPage());
}

function bindActions(root: HTMLElement): void {
    root.addEventListener(
        'click',
        e => onClick(root, e),
        { signal },
    );
    root.addEventListener(
        'change',
        e => onChange(root, e),
        { signal },
    );
    root.addEventListener(
        'input',
        e => onInput(root, e),
        { signal },
    );
}

function onClick(
    root: HTMLElement, e: Event,
): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('button, a');
    if (!btn) return;
    const flowLink = btn.getAttribute(
        'data-flow-id',
    );
    if (flowLink) {
        e.preventDefault();
        navigateTo('flow-detail', {
            flowId: flowLink,
        });
        return;
    }
    const woLink = btn.getAttribute(
        'data-work-order-id',
    );
    if (woLink) {
        e.preventDefault();
        navigateTo('workbox-detail', {
            id: woLink,
        });
        return;
    }
    if (btn.id === 'record-back-btn'
        || btn.id === 'record-cancel-btn') {
        if (pageState.kind === 'editing') {
            pageState = { kind: 'reading' };
            render(root);
            bindActions(root);
            return;
        }
        navigateTo('records');
        return;
    }
    if (btn.id === 'record-edit-btn') {
        if (!currentView) return;
        const draft = recordDraftFromView(
            currentView,
        );
        pageState = {
            kind: 'editing',
            draft,
            originalIds: new Set(
                draft.attributes.map(a => a.id),
            ),
        };
        render(root);
        bindActions(root);
        return;
    }
    if (btn.id === 'record-save-btn') {
        void handleSave(root);
        return;
    }
    if (
        btn.id === 'record-add-attribute-btn'
    ) {
        if (pageState.kind !== 'editing') {
            return;
        }
        addAttribute();
        render(root);
        bindActions(root);
        return;
    }
    const action = btn.getAttribute(
        'data-action',
    );
    if (action === 'remove-attribute') {
        const row = btn.closest(
            '[data-attribute-id]',
        );
        if (!(row instanceof HTMLElement)) {
            return;
        }
        const id = row.getAttribute(
            'data-attribute-id',
        );
        if (!id) return;
        removeAttribute(id);
        render(root);
        bindActions(root);
        return;
    }
    if (action === 'remove-constraint') {
        const row = btn.closest(
            '[data-constraint-index]',
        );
        const attrRow = btn.closest(
            '[data-attribute-id]',
        );
        if (
            !(row instanceof HTMLElement)
            || !(attrRow instanceof HTMLElement)
        ) return;
        const idx = Number(
            row.getAttribute(
                'data-constraint-index',
            ),
        );
        const attrId = attrRow.getAttribute(
            'data-attribute-id',
        );
        if (!attrId || Number.isNaN(idx)) {
            return;
        }
        removeConstraint(attrId, idx);
        render(root);
        bindActions(root);
    }
}

function onChange(
    root: HTMLElement, e: Event,
): void {
    if (pageState.kind !== 'editing') return;
    const target = e.target;
    if (
        !(target instanceof HTMLSelectElement)
        && !(target instanceof
            HTMLInputElement)
    ) return;
    const attrRow = target.closest(
        '[data-attribute-id]',
    );
    if (!(attrRow instanceof HTMLElement)) {
        return;
    }
    const attrId = attrRow.getAttribute(
        'data-attribute-id',
    );
    if (!attrId) return;
    const action = target.getAttribute(
        'data-action',
    );
    if (action === 'attribute-type'
        && target instanceof HTMLSelectElement
    ) {
        updateAttributeType(
            attrId,
            target.value as AttributeDraft[
                'attribute_type'
            ],
        );
        render(root);
        bindActions(root);
        return;
    }
    if (action === 'constraint-kind'
        && target instanceof HTMLSelectElement
        && target.value !== ''
    ) {
        addConstraint(
            attrId,
            target.value as Constraint['kind'],
        );
        target.value = '';
        render(root);
        bindActions(root);
    }
}

function onInput(
    root: HTMLElement, e: Event,
): void {
    if (pageState.kind !== 'editing') return;
    const target = e.target;
    if (
        !(target instanceof HTMLInputElement)
        && !(target instanceof
            HTMLTextAreaElement)
    ) return;
    if (target.id === 'record-edit-name') {
        pageState.draft.name = target.value;
        return;
    }
    if (target.id === 'record-edit-desc') {
        pageState.draft.description =
            target.value;
        return;
    }
    const attrRow = target.closest(
        '[data-attribute-id]',
    );
    if (!(attrRow instanceof HTMLElement)) {
        return;
    }
    const attrId = attrRow.getAttribute(
        'data-attribute-id',
    );
    if (!attrId) return;
    const action = target.getAttribute(
        'data-action',
    );
    if (action === 'attribute-name') {
        updateAttributeName(
            attrId, target.value,
        );
        return;
    }
    if (action === 'attribute-options') {
        updateAttributeOptions(
            attrId, target.value,
        );
        return;
    }
    if (action === 'constraint-value') {
        const cRow = target.closest(
            '[data-constraint-index]',
        );
        if (!(cRow instanceof HTMLElement)) {
            return;
        }
        const idx = Number(
            cRow.getAttribute(
                'data-constraint-index',
            ),
        );
        if (Number.isNaN(idx)) return;
        updateConstraintValue(
            attrId, idx, target.value,
        );
    }
}

function addAttribute(): void {
    if (pageState.kind !== 'editing') return;
    pageState.draft.attributes.push({
        id: generateCryptoSafeBase62(),
        name: '',
        attribute_type: 'text',
        sort_order:
            pageState.draft.attributes.length,
        options: [],
        constraints: [],
    });
}

function removeAttribute(id: string): void {
    if (pageState.kind !== 'editing') return;
    pageState.draft.attributes =
        pageState.draft.attributes.filter(
            a => a.id !== id,
        );
}

function updateAttributeName(
    id: string, name: string,
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (attr) attr.name = name;
}

function updateAttributeType(
    id: string,
    type: AttributeDraft['attribute_type'],
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    attr.attribute_type = type;
    const allowed = new Set(
        allowedConstraintKinds(type),
    );
    attr.constraints = attr.constraints.filter(
        c => allowed.has(c.kind),
    );
}

function updateAttributeOptions(
    id: string, raw: string,
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    attr.options = raw
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

function addConstraint(
    id: string, kind: Constraint['kind'],
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    if (kind === 'regex') {
        attr.constraints.push(
            { kind: 'regex', pattern: '' },
        );
    } else if (kind === 'range_min') {
        attr.constraints.push(
            { kind: 'range_min', min: '' },
        );
    } else {
        attr.constraints.push(
            { kind: 'range_max', max: '' },
        );
    }
}

function updateConstraintValue(
    id: string, idx: number, value: string,
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    const c = attr.constraints[idx];
    if (!c) return;
    if (c.kind === 'regex') {
        c.pattern = value;
    } else if (c.kind === 'range_min') {
        c.min = value;
    } else {
        c.max = value;
    }
}

function removeConstraint(
    id: string, idx: number,
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    attr.constraints.splice(idx, 1);
}

async function handleSave(
    root: HTMLElement,
): Promise<void> {
    if (pageState.kind !== 'editing') return;
    if (!recordId) return;
    const draft = pageState.draft;
    const original = pageState.originalIds;
    if (draft.name.trim() === '') {
        showToast(
            'Record name is required',
            'error',
        );
        return;
    }
    if (!currentView) return;
    const entity = currentView.record;
    const ctx = createRequestContext();
    try {
        await putRecord(ctx, recordId, {
            name: draft.name.trim(),
            description: draft.description,
            position: entity.position,
        });
        const currentIds = new Set(
            draft.attributes.map(a => a.id),
        );
        for (const oldId of original) {
            if (!currentIds.has(oldId)) {
                await deleteRecordAttribute(
                    ctx, oldId,
                );
            }
        }
        for (
            const [i, a]
                of draft.attributes.entries()
        ) {
            const entity:
                Omit<RecordAttributeEntity, 'id'> = {
                record_id: recordId,
                name: a.name.trim(),
                attribute_type: a.attribute_type,
                sort_order: i,
                options: jsonArrayField(
                    a.options,
                ),
                constraints: jsonArrayField(
                    a.constraints
                        .filter(
                            isValidConstraint,
                        ),
                ),
            };
            await putRecordAttribute(
                ctx, a.id, entity,
            );
        }
    } catch (err) {
        showToast(
            'Failed to save Record',
            'error',
        );
        return;
    }
    pageState = { kind: 'reading' };
    showToast('Record saved', 'success');
    await load(root);
}

function isValidConstraint(
    c: Constraint,
): boolean {
    if (c.kind === 'regex') {
        return c.pattern.length > 0;
    }
    if (c.kind === 'range_min') {
        return c.min.length > 0;
    }
    return c.max.length > 0;
}
