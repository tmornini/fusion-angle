import { $, $required } from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { reportFault } from '../app/error-helpers.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    handleDialogClick,
    closeDialog,
} from '../app/dialog.ts';
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
    getRecordInstances,
    getRecordInstance,
    putRecordInstance,
    patchRecordInstance,
    deleteRecordInstance,
    activeOrganization,
} from '../app/adapters/index.ts';
import {
    RecordDetailPresenter,
    RecordDetailEditPresenter,
    recordDraftFromView,
    allowedConstraintKinds,
    projectInstanceFields,
    instanceListItems,
    INSTANCE_CONFLICT_NOTICE,
    type RecordDetailDraft,
    type AttributeDraft,
    type RecordDetailView,
    type InstancesSectionView,
    type InstanceFieldView,
} from '../app/presenters/index.ts';
import type {
    RecordEntity,
    RecordAttributeEntity,
    Constraint,
} from '../../api/types.ts';
import type {
    RecordAttribute,
    RecordInstance,
} from '../app/adapters/index.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../../api/http-errors.ts';
import {
    projectClaimRolesForOrganization,
} from '../../api/authorization.ts';

const { signal } = createPageAbort();

type PageState =
    | { kind: 'reading' }
    | {
        kind: 'editing';
        draft: RecordDetailDraft;
        originalAttributes:
            readonly RecordAttribute[];
        pendingAttributeName: string;
    }
    | {
        kind: 'instances-editing';
        instanceId: string;
        draft: Record<string, string>;
        etag: string;
        fields: readonly InstanceFieldView[];
        conflictNotice: string | null;
    };

let pageState: PageState = { kind: 'reading' };
let currentView: RecordDetailView | null = null;
let recordId: string | null = null;
let saveInProgress = false;
let pendingDeleteInstanceId: string | null = null;
let loadedInstances: RecordInstance[] = [];

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

function heldRoles(): readonly string[] {
    const ctx = sessionContext();
    return projectClaimRolesForOrganization(
        ctx.identity.roles,
        activeOrganization(ctx),
    );
}

function buildInstancesSection(
    instances: readonly RecordInstance[],
    attributes: readonly RecordAttribute[],
    editing: PageState & {
        kind: 'instances-editing';
    } | null,
): InstancesSectionView {
    if (editing !== null) {
        return {
            instances: [],
            editing: {
                instanceId: editing.instanceId,
                fields: editing.fields.map(f => ({
                    ...f,
                    value: f.access === 'writable'
                        ? (editing.draft[
                            f.attributeId
                        ] ?? f.value)
                        : f.value,
                })),
                conflictNotice:
                    editing.conflictNotice,
            },
        };
    }
    return {
        instances: instanceListItems(
            instances, attributes,
        ),
        editing: null,
    };
}

function composeView(
    base: Omit<RecordDetailView, 'instances'>,
): RecordDetailView {
    const editing =
        pageState.kind === 'instances-editing'
            ? pageState
            : null;
    return {
        ...base,
        instances: buildInstancesSection(
            loadedInstances,
            base.attributes,
            editing,
        ),
    };
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
            const [
                record,
                attributes,
                flows,
                workOrders,
                instances,
            ] = await Promise.all([
                getRecordModel(ctx, id),
                getRecordAttributesByRecord(
                    ctx, id,
                ),
                getFlowSummariesForRecord(
                    ctx, id,
                ),
                getWorkOrdersForRecord(ctx, id),
                getRecordInstances(ctx, id),
            ]);
            return {
                record,
                attributes,
                flows,
                workOrders,
                instances,
            };
        },
        retry: () => load(root),
        onData: loaded => {
            loadedInstances = [...loaded.instances];
            currentView = composeView({
                record: loaded.record,
                attributes: loaded.attributes,
                boundFlows: loaded.flows,
                workOrders: loaded.workOrders,
            });
            render(root);
            bindActions(root);
        },
    });
}

function render(root: HTMLElement): void {
    if (!currentView) return;
    if (pageState.kind === 'editing') {
        const presenter =
            new RecordDetailEditPresenter(
                pageState.draft,
                pageState.pendingAttributeName,
            );
        setHtml(root, presenter.buildPage());
        return;
    }
    // Refresh instances section projection for
    // reading and instances-editing states.
    currentView = composeView({
        record: currentView.record,
        attributes: currentView.attributes,
        boundFlows: currentView.boundFlows,
        workOrders: currentView.workOrders,
    });
    const presenter =
        new RecordDetailPresenter(currentView);
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
    // Delete confirm lives outside #page-root.
    document.addEventListener(
        'click',
        e => onDocumentClick(root, e),
        { signal },
    );
}

function onDocumentClick(
    root: HTMLElement, e: MouseEvent,
): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const openEl = target.closest(
        '[data-dialog-open='
        + '"confirm-delete-instance"]',
    );
    if (openEl) {
        pendingDeleteInstanceId =
            openEl.getAttribute(
                'data-instance-id',
            );
    }
    if (handleDialogClick(target, e)) {
        return;
    }
    const confirm = target.closest(
        '[data-action='
        + '"confirm-delete-instance"]',
    );
    if (confirm) {
        closeDialog('confirm-delete-instance');
        void handleDeleteInstance(root);
    }
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
    root: HTMLElement, e: MouseEvent,
): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (handleDialogClick(target, e)) {
        const openEl = target.closest(
            '[data-dialog-open='
            + '"confirm-delete-instance"]',
        );
        if (openEl) {
            pendingDeleteInstanceId =
                openEl.getAttribute(
                    'data-instance-id',
                );
        }
        return;
    }
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
        if (pageState.kind !== 'reading') {
            return;
        }
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
    if (btn.id === 'record-new-instance-btn') {
        void handleNewInstance(root);
        return;
    }
    if (btn.id === 'record-instance-save-btn') {
        void handleInstanceSave(root);
        return;
    }
    if (
        btn.id === 'record-instance-cancel-btn'
    ) {
        pageState = { kind: 'reading' };
        render(root);
        bindActions(root);
        return;
    }
    const action = btn.getAttribute(
        'data-action',
    );
    if (action === 'edit-instance') {
        const id = btn.getAttribute(
            'data-instance-id',
        );
        if (!id) return;
        void handleEditInstance(root, id);
        return;
    }
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

function fieldsFromAttributes(
    attributes: readonly RecordAttribute[],
    values: ReadonlyMap<string, string>,
): InstanceFieldView[] {
    return projectInstanceFields(
        attributes.map(a => ({
            id: a.id,
            name: a.name,
            readRoles: a.readRoles,
            writeRoles: a.writeRoles,
        })),
        values,
        heldRoles(),
    );
}

function draftFromFields(
    fields: readonly InstanceFieldView[],
): Record<string, string> {
    const draft: Record<string, string> = {};
    for (const f of fields) {
        if (f.access === 'writable') {
            draft[f.attributeId] = f.value;
        }
    }
    return draft;
}

async function handleNewInstance(
    root: HTMLElement,
): Promise<void> {
    if (!recordId || !currentView) return;
    if (pageState.kind !== 'reading') return;
    if (saveInProgress) return;
    const ctx = sessionContext();
    const instanceId = generateCryptoSafeBase62();
    saveInProgress = true;
    try {
        const created = await putRecordInstance(
            ctx, recordId, instanceId, [],
        );
        const fields = fieldsFromAttributes(
            currentView.attributes,
            new Map(),
        );
        pageState = {
            kind: 'instances-editing',
            instanceId,
            draft: draftFromFields(fields),
            etag: created.etag,
            fields,
            conflictNotice: null,
        };
        loadedInstances = [
            ...loadedInstances,
            {
                id: instanceId,
                recordTypeId: recordId,
                values: new Map(),
                etag: created.etag,
            },
        ];
        render(root);
        bindActions(root);
    } catch (err) {
        reportFault(
            ctx, 'Failed to create instance', err,
        );
    } finally {
        saveInProgress = false;
    }
}

async function handleEditInstance(
    root: HTMLElement,
    instanceId: string,
): Promise<void> {
    if (!recordId || !currentView) return;
    if (pageState.kind !== 'reading') return;
    const ctx = sessionContext();
    try {
        const detail = await getRecordInstance(
            ctx, recordId, instanceId,
        );
        const fields = fieldsFromAttributes(
            currentView.attributes,
            detail.values,
        );
        pageState = {
            kind: 'instances-editing',
            instanceId,
            draft: draftFromFields(fields),
            etag: detail.etag,
            fields,
            conflictNotice: null,
        };
        render(root);
        bindActions(root);
    } catch (err) {
        reportFault(
            ctx, 'Failed to load instance', err,
        );
    }
}

async function handleInstanceSave(
    root: HTMLElement,
): Promise<void> {
    if (pageState.kind !== 'instances-editing') {
        return;
    }
    if (!recordId) return;
    if (saveInProgress) return;
    const ctx = sessionContext();
    const {
        instanceId, draft, etag, fields,
    } = pageState;
    // Empty string is rejected at the gate; only ship
    // non-empty writable values in this minimal UI
    // (no clear-on-blank path yet).
    const set = fields
        .filter(f => f.access === 'writable')
        .map(f => ({
            attributeId: f.attributeId,
            value: (draft[f.attributeId] ?? '')
                .trim(),
        }))
        .filter(entry => entry.value !== '');
    saveInProgress = true;
    try {
        const result = await patchRecordInstance(
            ctx,
            recordId,
            instanceId,
            etag,
            { set },
        );
        pageState = { kind: 'reading' };
        showToast('Instance saved', 'success');
        void result.etag;
        await load(root);
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status
                === HTTP_PRECONDITION_FAILED
        ) {
            try {
                const fresh =
                    await getRecordInstance(
                        ctx,
                        recordId,
                        instanceId,
                    );
                if (!currentView) return;
                const freshFields =
                    fieldsFromAttributes(
                        currentView.attributes,
                        fresh.values,
                    );
                pageState = {
                    kind: 'instances-editing',
                    instanceId,
                    draft: draftFromFields(
                        freshFields,
                    ),
                    etag: fresh.etag,
                    fields: freshFields,
                    conflictNotice:
                        INSTANCE_CONFLICT_NOTICE,
                };
                render(root);
                bindActions(root);
                showToast(
                    INSTANCE_CONFLICT_NOTICE,
                    'warning',
                );
            } catch (regetErr) {
                reportFault(
                    ctx,
                    'Failed to refresh instance',
                    regetErr,
                );
            }
            return;
        }
        reportFault(
            ctx, 'Failed to save instance', err,
        );
    } finally {
        saveInProgress = false;
    }
}

async function handleDeleteInstance(
    root: HTMLElement,
): Promise<void> {
    if (!recordId) return;
    const instanceId = pendingDeleteInstanceId;
    pendingDeleteInstanceId = null;
    if (!instanceId) return;
    if (saveInProgress) return;
    const ctx = sessionContext();
    saveInProgress = true;
    try {
        await deleteRecordInstance(
            ctx, recordId, instanceId,
        );
        if (
            pageState.kind === 'instances-editing'
            && pageState.instanceId === instanceId
        ) {
            pageState = { kind: 'reading' };
        }
        showToast('Instance deleted', 'success');
        await load(root);
    } catch (err) {
        reportFault(
            ctx, 'Failed to delete instance', err,
        );
    } finally {
        saveInProgress = false;
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
    const target = e.target;
    if (
        !(target instanceof HTMLInputElement)
        && !(target instanceof
            HTMLTextAreaElement)
    ) return;
    if (
        pageState.kind === 'instances-editing'
    ) {
        const action = target.getAttribute(
            'data-action',
        );
        if (action === 'instance-field-value') {
            const attrId = target.getAttribute(
                'data-attribute-id',
            );
            if (!attrId) return;
            pageState.draft[attrId] =
                target.value;
        }
        return;
    }
    if (pageState.kind !== 'editing') return;
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
                },
            );
        } else {
            await putRecord(
                ctx, recordId,
                {
                    ...recordFields,
                    state: originalRecord.stateValue(),
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
