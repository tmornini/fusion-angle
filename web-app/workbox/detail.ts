import {
    $, $$, getRequiredAttribute,
    isFormField,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import {
    WorkboxDetailPresenter,
} from '../app/presenters/index.ts';
import {
    instanceListItems,
    INSTANCE_CONFLICT_NOTICE,
} from '../app/presenters/record-detail.ts';
import { reportFault } from '../app/error-helpers.ts';
import { showToast } from '../app/toast.ts';
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
    getWorkOrder,
    getWorkOrderHistory,
    transitionEventsFromHistory,
    fieldValuesByEventFromHistory,
    activeClaimFromHistory,
    getMemberMap,
    postWorkOrderTransition,
    putWorkOrderClaim,
    putWorkOrderBinding,
    deleteWorkOrderClaim,
    getCurrentHumanMember,
    sessionContext,
    getRecordForWorkOrder,
    getRecordAttributesByRecord,
    getRecordInstance,
    getRecordInstances,
    subscribeWorkOrderChanges,
    RecordTransitionViolations,
} from '../app/adapters/index.ts';
import type {
    NodeAttribute,
} from '../../api/types.ts';
import type {
    RecordAttribute,
    RequestContext,
} from '../app/adapters/index.ts';
import {
    RequestError,
    HTTP_PRECONDITION_FAILED,
} from '../../api/http-errors.ts';

/* ── Module state ────────── */

// Flow's record type for the unbound bind picker
// (also equals the binding's type when bound).
let heldRecordTypeId: string | null = null;
// Instance etag from the GET that filled the form.
// Transition If-Match uses this snapshot, never a
// submit-time GET (WB19a / WB19b).
let heldInstanceEtag: string | null = null;
let conflictNotice: string | null = null;

/* ── Helpers ─────────────── */

function collectAttributeValues(
    container: HTMLElement,
): Record<string, string> {
    const values: Record<string, string> =
        {};
    const inputs = $$(
        '[data-attribute-id]', container,
    );
    for (const input of inputs) {
        if (!isFormField(input)) continue;
        const attributeId = getRequiredAttribute(
            input, 'data-attribute-id',
        );
        if (input.type === 'radio') {
            if ((input as HTMLInputElement).checked) {
                values[attributeId] = input.value;
            }
        } else if (input.type === 'checkbox') {
            values[attributeId] = (
                input as HTMLInputElement
            ).checked
                ? 'true'
                : 'false';
        } else {
            values[attributeId] =
                input.value.trim();
        }
    }
    return values;
}

function hasEmptyRequiredAttribute(
    refs: readonly NodeAttribute[],
    values: Record<string, string>,
): boolean {
    return refs
        .filter(r => r.isRequired)
        .some(r => {
            const v = values[r.attributeId];
            return v === undefined || v === '';
        });
}

/* ── Event wiring ────────── */

function initTransitionButtons(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    workOrderId: string,
    memberId: string,
): void {
    const buttons = $$(
        '[data-edge-id]', container,
    );
    for (const btn of buttons) {
        btn.addEventListener(
            'click',
            async () => {
                const edgeId = getRequiredAttribute(
                    btn, 'data-edge-id',
                );
                const values =
                    collectAttributeValues(
                        container,
                    );
                const hasEmpty =
                    hasEmptyRequiredAttribute(
                        detail
                            .renderableAttributes(),
                        values,
                    );
                if (hasEmpty) {
                    showToast(
                        'Please fill'
                        + ' all required'
                        + ' attributes',
                        'error',
                    );
                    return;
                }
                const violationsEl = $(
                    '#transition-violations',
                    container,
                );
                if (violationsEl) {
                    setHtml(violationsEl, html``);
                }
                // One vessel per gesture: submit,
                // 412 recovery GET, re-present share
                // the same requestId (D8).
                const ctx = sessionContext();
                try {
                    await postWorkOrderTransition(
                        ctx,
                        {
                            workOrderId:
                                detail.idValue(),
                            edgeId,
                            values,
                            ...(heldInstanceEtag
                                === null
                                ? {}
                                : {
                                    instanceEtag:
                                        heldInstanceEtag,
                                }),
                        },
                    );
                } catch (err) {
                    if (
                        err instanceof
                            RecordTransitionViolations
                    ) {
                        if (violationsEl) {
                            setHtml(
                                violationsEl,
                                detail.buildViolations(
                                    err.violations,
                                ),
                            );
                        }
                        return;
                    }
                    if (
                        err instanceof RequestError
                        && err.status
                            === HTTP_PRECONDITION_FAILED
                    ) {
                        await recoverFrom412(
                            container,
                            workOrderId,
                            memberId,
                            ctx,
                        );
                        return;
                    }
                    reportFault(
                        ctx,
                        'Work order transition'
                        + ' failed',
                        err,
                    );
                    return;
                }
                showToast(
                    'Transition complete',
                    'success',
                );
                navigateTo('workbox');
            },
        );
    }
}

async function recoverFrom412(
    container: HTMLElement,
    workOrderId: string,
    memberId: string,
    ctx: RequestContext,
): Promise<void> {
    try {
        conflictNotice = INSTANCE_CONFLICT_NOTICE;
        const detail = await loadPresenter(
            workOrderId,
            Promise.resolve(memberId),
            ctx,
        );
        renderDetail(
            container, detail, workOrderId, memberId,
        );
        showToast(
            INSTANCE_CONFLICT_NOTICE,
            'warning',
        );
    } catch (regetErr) {
        reportFault(
            ctx,
            'Failed to refresh work order',
            regetErr,
        );
    }
}

function initUnclaimButton(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
): void {
    const btn = $(
        '#unclaim-btn', container,
    );
    if (!btn) return;
    const claim = detail.claimStatus();
    if (claim.kind !== 'claimed') return;
    const workOrderId = detail.idValue();
    btn.addEventListener(
        'click',
        async () => {
            const ctx = sessionContext();
            try {
                await deleteWorkOrderClaim(
                    ctx, workOrderId,
                );
            } catch (err) {
                reportFault(
                    ctx,
                    'Failed to release work order',
                    err,
                );
                return;
            }
            showToast(
                'Work order released',
                'success',
            );
            navigateTo('workbox');
        },
    );
}

function initBindPicker(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    workOrderId: string,
    memberId: string,
    recordTypeId: string | null,
): void {
    container.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (handleDialogClick(target, e)) return;
    });

    if (recordTypeId === null) return;
    if (detail.isBound()) return;

    const picks = $$(
        '[data-instance-pick]', container,
    );
    for (const pick of picks) {
        pick.addEventListener(
            'click',
            async () => {
                const instanceId =
                    getRequiredAttribute(
                        pick,
                        'data-instance-pick',
                    );
                const ctx = sessionContext();
                try {
                    await putWorkOrderBinding(
                        ctx,
                        workOrderId,
                        instanceId,
                        recordTypeId,
                    );
                } catch (err) {
                    reportFault(
                        ctx,
                        'Failed to bind instance',
                        err,
                    );
                    return;
                }
                closeDialog('bind-instance');
                conflictNotice = null;
                showToast(
                    'Instance bound',
                    'success',
                );
                await refreshDetail(
                    container,
                    workOrderId,
                    memberId,
                );
            },
        );
    }
}

async function loadPresenter(
    workOrderId: string,
    currentMemberIdPromise: Promise<string>,
    ctx: RequestContext,
): Promise<WorkboxDetailPresenter> {
    // Wave 1: five independent reads (member id is a
    // settled or in-flight promise from init).
    const [
        workOrder, history, memberMap, recordId,
        currentMemberId,
    ] = await Promise.all([
        getWorkOrder(ctx, workOrderId),
        getWorkOrderHistory(ctx, workOrderId),
        getMemberMap(ctx),
        getRecordForWorkOrder(ctx, workOrderId),
        currentMemberIdPromise,
    ]);
    // One per-id history read supplies transitions,
    // historical field values, and the active claim
    // (DESC wire; transitionEventsFromHistory sorts
    // ASC). Live form values come from the instance
    // head when bound.
    const transitions = transitionEventsFromHistory(
        workOrderId, history,
    );
    const fieldValuesByEvent =
        fieldValuesByEventFromHistory(history);
    const activeClaim = activeClaimFromHistory(
        history, workOrder.flowGraph.lockTimeout,
    );

    const bound =
        workOrder.instanceId !== undefined
        && workOrder.recordTypeId !== undefined
            ? {
                instanceId: workOrder.instanceId,
                recordTypeId:
                    workOrder.recordTypeId,
            }
            : null;

    // Wave 2: attributes ∥ instance head (or picker list).
    const attributesPromise: Promise<
        RecordAttribute[]
    > = recordId === null
        ? Promise.resolve([])
        : getRecordAttributesByRecord(ctx, recordId);

    type InstanceWave = {
        instanceValues:
            ReadonlyMap<string, string> | null;
        instanceEtag: string | null;
        pickerItems: readonly {
            readonly id: string;
            readonly fields: readonly {
                readonly name: string;
                readonly value: string;
            }[];
        }[];
        heldTypeId: string | null;
    };

    const instanceWavePromise: Promise<InstanceWave> =
        (async (): Promise<InstanceWave> => {
            if (bound !== null) {
                // ONE GET for {values, etag}.
                const instance =
                    await getRecordInstance(
                        ctx,
                        bound.recordTypeId,
                        bound.instanceId,
                    );
                return {
                    instanceValues: instance.values,
                    instanceEtag: instance.etag,
                    pickerItems: [],
                    heldTypeId: bound.recordTypeId,
                };
            }
            if (recordId !== null) {
                const attributes =
                    await attributesPromise;
                const instances =
                    await getRecordInstances(
                        ctx, recordId,
                    );
                return {
                    instanceValues: null,
                    instanceEtag: null,
                    pickerItems: instanceListItems(
                        instances, attributes,
                    ),
                    heldTypeId: recordId,
                };
            }
            return {
                instanceValues: null,
                instanceEtag: null,
                pickerItems: [],
                heldTypeId: recordId,
            };
        })();

    const [attributes, instanceWave] =
        await Promise.all([
            attributesPromise,
            instanceWavePromise,
        ]);
    const attributeMap = new Map(
        attributes.map(
            a => [a.id, a] as const,
        ),
    );
    heldRecordTypeId = instanceWave.heldTypeId;
    heldInstanceEtag = instanceWave.instanceEtag;

    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        fieldValuesByEvent,
        activeClaim,
        memberMap,
        currentMemberId,
        attributeMap,
        instanceWave.instanceValues,
        bound,
        instanceWave.pickerItems,
        conflictNotice,
    );
}

/* ── Render ──────────────── */

function renderDetail(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    workOrderId: string,
    memberId: string,
): void {
    setHtml(container, detail.buildPage());

    const backBtn = $(
        '#work-order-back-btn',
        container,
    );
    if (backBtn) {
        backBtn.addEventListener(
            'click',
            () => navigateTo('workbox'),
        );
    }

    if (!detail.isArchive()) {
        initTransitionButtons(
            container,
            detail,
            workOrderId,
            memberId,
        );
        initUnclaimButton(container, detail);
        initBindPicker(
            container,
            detail,
            workOrderId,
            memberId,
            heldRecordTypeId,
        );
    }
}

// Reload the action screen from the pair plane —
// claim is NOT re-attempted (init owns that once).
// Cross-tab release/transition rings the same bell.
async function refreshDetail(
    container: HTMLElement,
    workOrderId: string,
    memberId: string,
): Promise<void> {
    const ctx = sessionContext();
    let detail: WorkboxDetailPresenter;
    try {
        detail = await loadPresenter(
            workOrderId,
            Promise.resolve(memberId),
            ctx,
        );
    } catch (err) {
        reportFault(
            ctx,
            'Work order detail refresh failed',
            err,
        );
        return;
    }
    renderDetail(
        container, detail, workOrderId, memberId,
    );
}

/* ── Init ────────────────── */

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.id;
    if (!id) {
        navigateTo('workbox');
        return;
    }

    const container = $(
        '#work-order-detail-content', document,
    );
    if (!container) return;

    const ctx = sessionContext();
    // Start the member-id read immediately so wave 1
    // of loadPresenter can join it (no unhandled-
    // rejection window — consumed synchronously below).
    const currentMemberIdPromise =
        getCurrentHumanMember(ctx).then(m => m.id);
    conflictNotice = null;

    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: async () => {
            let presenter =
                await loadPresenter(
                    id,
                    currentMemberIdPromise,
                    ctx,
                );
            const claim =
                presenter.claimStatus();
            if (
                (claim.kind !== 'claimed'
                    || !claim.byCurrentMember)
                && !presenter.isArchive()
            ) {
                await putWorkOrderClaim(
                    ctx,
                    id,
                );
                // Reuse the settled member-id promise.
                presenter =
                    await loadPresenter(
                        id,
                        currentMemberIdPromise,
                        ctx,
                    );
            }
            return presenter;
        },
        retry: () => init(params),
        onData: async detail => {
            const memberId =
                await currentMemberIdPromise;
            renderDetail(
                container, detail, id, memberId,
            );

            // Subscribe after the claim-on-load path so
            // the initial notify does not double-render.
            // Full <a href> navigation tears the page
            // down; the channel entry dies with it.
            subscribeWorkOrderChanges(() => {
                void refreshDetail(
                    container, id, memberId,
                );
            });
        },
    });
}
