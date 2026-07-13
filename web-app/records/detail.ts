import { $, $required } from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { reportFault } from '../app/error-helpers.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    navigateTo,
} from '../app/core.ts';
import {
    sessionContext,
    getRecordModel,
    getRecordAttributesByRecord,
    getFlowSummariesForRecord,
    getWorkOrdersForRecord,
    putRecord,
    postRecordChange,
    subscribeRecordChanges,
    generateCryptoSafeBase62,
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
    RecordEntity,
    RecordAttributeEntity,
    Constraint,
} from '../../api/types.ts';
import type {
    RecordAttribute,
} from '../app/adapters/index.ts';

const { signal } = createPageAbort();

type PageState =
    | { kind: 'reading' }
    | {
        kind: 'editing';
        draft: RecordDetailDraft;
        originalAttributes:
            readonly RecordAttribute[];
        pendingAttributeName: string;
    };

let pageState: PageState = { kind: 'reading' };
let currentView: RecordDetailView | null = null;
let recordId: string | null = null;
let saveInProgress = false;

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.id;
    if (!id) {
        navigateTo('records');
        return;
    }
    recordId = id;
    const root = $required(
        '#page-root', document,
    );

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
    await loadInto({
        container: root,
        skeleton: buildSkeleton('detail', 1),
        fetch: async () => {
            const ctx = sessionContext();
            const [record,
                attributes, flows,
                workOrders] = await Promise.all([
                getRecordModel(ctx, id),
                getRecordAttributesByRecord(
                    ctx, id,
                ),
                getFlowSummariesForRecord(
                    ctx, id,
                ),
                getWorkOrdersForRecord(ctx, id),
            ]);
            return {
                record,
                attributes, flows, workOrders,
            };
        },
        retry: () => load(root),
        onData: loaded => {
            currentView = {
                record: loaded.record,
                attributes: loaded.attributes,
                boundFlows: loaded.flows,
                workOrders: loaded.workOrders,
            };
            render(root);
            bindActions(root);
        },
    });
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
            pageState.pendingAttributeName,
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
        e => onInput(e),
        { signal },
    );
    root.addEventListener(
        'keydown',
        e => onKeydown(root, e),
        { signal },
    );
}

function onKeydown(
    root: HTMLElement, e: KeyboardEvent,
): void {
    if (pageState.kind !== 'editing') return;
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }
    if (
        target.id
            !== 'record-pending-attribute-name'
    ) return;
    e.preventDefault();
    commitPendingAttribute();
    render(root);
    bindActions(root);
    const next = $(
        '#record-pending-attribute-name', root,
    );
    if (next instanceof HTMLInputElement) {
        next.focus();
    }
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
            originalAttributes:
                currentView.attributes,
            pendingAttributeName: '',
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
        commitPendingAttribute();
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
                'attributeType'
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

function onInput(e: Event): void {
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
    if (
        target.id
            === 'record-pending-attribute-name'
    ) {
        pageState.pendingAttributeName =
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

function commitPendingAttribute(): void {
    if (pageState.kind !== 'editing') return;
    const name =
        pageState.pendingAttributeName.trim();
    if (name === '') return;
    pageState.draft.attributes.push({
        id: generateCryptoSafeBase62(),
        name,
        attributeType: 'text',
        sortOrder:
            pageState.draft.attributes.length,
        options: [],
        constraints: [],
    });
    pageState.pendingAttributeName = '';
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
    type: AttributeDraft['attributeType'],
): void {
    if (pageState.kind !== 'editing') return;
    const attr = pageState.draft.attributes
        .find(a => a.id === id);
    if (!attr) return;
    attr.attributeType = type;
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
    if (!currentView) return;
    if (saveInProgress) return;
    commitPendingAttribute();
    const draft = pageState.draft;
    const originalAttrs = pageState.originalAttributes;
    const originalRecord = currentView.record;
    if (draft.name.trim() === '') {
        showToast(
            'Record name is required',
            'error',
        );
        return;
    }
    const recordFields: Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    > = {
        name: draft.name.trim(),
        description: draft.description,
        position:
            originalRecord.positionSortKey(),
    };
    const draftEntities = draftToEntities(
        draft, recordId,
    );
    const removedAttributeIds = originalAttrs
        .filter(a =>
            !draftEntities.some(
                d => d.id === a.id,
            ),
        )
        .map(a => a.id);
    const attributesChanged =
        removedAttributeIds.length > 0
        || draftAttributesDifferFromOriginal(
            draftEntities, originalAttrs,
        );
    const recordChanged =
        originalRecord.nameText()
            !== recordFields.name
        || originalRecord.descriptionText()
            !== recordFields.description;
    if (!attributesChanged && !recordChanged) {
        pageState = { kind: 'reading' };
        render(root);
        bindActions(root);
        return;
    }
    const ctx = sessionContext();
    saveInProgress = true;
    try {
        if (attributesChanged) {
            // Echo the trio from the already-loaded model —
            // zero extra fetch, same source the no-attribute-
            // change branch below already uses.
            await postRecordChange(
                ctx, recordId,
                {
                    kind: 'edit',
                    record: recordFields,
                    attributes: draftEntities,
                    removedAttributeIds,
                    state: originalRecord.stateValue(),
                    stateAt: originalRecord.stateAtValue(),
                    stateEventId:
                        originalRecord.stateEventIdValue(),
                },
            );
        } else {
            // No attribute change and no state change (a
            // plain name/description/position edit) — echo
            // the trio from the already-loaded model, zero
            // extra fetch.
            await putRecord(
                ctx, recordId,
                {
                    ...recordFields,
                    state: originalRecord.stateValue(),
                    stateAt:
                        originalRecord.stateAtValue(),
                    stateEventId:
                        originalRecord
                            .stateEventIdValue(),
                },
            );
        }
    } catch (err) {
        reportFault(
            ctx, 'Failed to save Record', err,
        );
        return;
    } finally {
        saveInProgress = false;
    }
    pageState = { kind: 'reading' };
    showToast('Record saved', 'success');
    await load(root);
}

function draftToEntities(
    draft: RecordDetailDraft,
    recordId: string,
): Omit<RecordAttributeEntity, 'organization_id'>[] {
    return draft.attributes
        .filter(a => a.name.trim() !== '')
        .map((a, i) => ({
            id: a.id,
            record_id: recordId,
            name: a.name.trim(),
            attribute_type: a.attributeType,
            sort_order: i,
            options: a.options,
            constraints: a.constraints
                .filter(isValidConstraint),
        }));
}

function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function draftAttributesDifferFromOriginal(
    draftEntities: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[],
    originalAttrs: readonly RecordAttribute[],
): boolean {
    const originalById = new Map(
        originalAttrs.map(
            a => [a.id, a] as const,
        ),
    );
    for (const d of draftEntities) {
        const o = originalById.get(d.id);
        if (
            o === undefined
            || o.name !== d.name
            || o.attributeType !== d.attribute_type
            || o.sortOrder !== d.sort_order
            || !sameJson(o.options, d.options)
            || !sameJson(o.constraints, d.constraints)
        ) {
            return true;
        }
    }
    return false;
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
