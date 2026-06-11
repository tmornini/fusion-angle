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
import { log } from '../app/logger.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import {
    getWorkOrder,
    getWorkOrderTransitionEvents,
    getStateFieldValuesByEvent,
    getWorkOrderActiveClaim,
    getMemberMap,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentHumanMember,
    createRequestContext,
    sessionContext,
    generateCryptoSafeBase62,
    validateWorkOrderFlowGraph,
    getRecordForWorkOrder,
    getRecordAttributesByRecord,
    RecordTransitionViolations,
} from '../app/adapters/index.ts';
import type {
    NodeAttribute,
    RecordAttribute,
} from '../../api/types.ts';

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
            const v = values[r.attribute_id];
            return v === undefined || v === '';
        });
}

// A violations failure renders in place — the panel names
// each blocked rule. Any other fault logs and toasts.
function reportTransitionFailure(
    err: unknown,
    violationsEl: HTMLElement | null,
    detail: WorkboxDetailPresenter,
): void {
    if (
        err instanceof RecordTransitionViolations
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
    log.error(
        'work order transition failed',
        'workbox',
        err,
    );
    showToast('Transition failed', 'error');
}

/* ── Event wiring ────────── */

function initTransitionButtons(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    ctx: ReturnType<typeof createRequestContext>,
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
                const fieldValueIds:
                    Record<string, string> = {};
                for (const fid of Object.keys(values)) {
                    fieldValueIds[fid] =
                        generateCryptoSafeBase62();
                }
                const violationsEl = $(
                    '#transition-violations',
                    container,
                );
                if (violationsEl) {
                    setHtml(violationsEl, html``);
                }
                try {
                    await postWorkOrderTransition(
                        ctx,
                        {
                            workOrderId:
                                detail.idValue(),
                            edgeId,
                            values,
                            fieldValueIds,
                        },
                    );
                } catch (err) {
                    reportTransitionFailure(
                        err, violationsEl, detail,
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

function initUnclaimButton(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    ctx: ReturnType<typeof createRequestContext>,
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
            try {
                await deleteWorkOrderClaim(
                    ctx, workOrderId,
                );
            } catch (err) {
                log.error(
                    'work order release'
                    + ' failed',
                    'workbox',
                    err,
                );
                showToast(
                    'Failed to release'
                    + ' work order',
                    'error',
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

async function loadPresenter(
    workOrderId: string,
    currentMemberId: string,
    ctx: ReturnType<typeof createRequestContext>,
): Promise<WorkboxDetailPresenter> {
    const workOrder =
        await getWorkOrder(ctx, workOrderId);
    const fg = validateWorkOrderFlowGraph(
        workOrder.flow_graph,
    );
    const [
        transitions,
        fieldValuesByEvent,
        activeClaim,
        memberMap,
        recordId,
    ] = await Promise.all([
        getWorkOrderTransitionEvents(
            ctx, workOrderId,
        ),
        getStateFieldValuesByEvent(ctx),
        getWorkOrderActiveClaim(
            ctx, workOrderId, fg.lockTimeout,
        ),
        getMemberMap(ctx),
        getRecordForWorkOrder(ctx, workOrderId),
    ]);
    const attributes: RecordAttribute[] =
        recordId === null
            ? []
            : await getRecordAttributesByRecord(
                ctx, recordId,
            );
    const attributeMap = new Map(
        attributes.map(
            a => [a.id, a] as const,
        ),
    );
    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        fieldValuesByEvent,
        activeClaim,
        memberMap,
        currentMemberId,
        attributeMap,
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
    const memberRow =
        await getCurrentHumanMember(ctx);
    const memberId = memberRow.id;

    const detail = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        async () => {
            let presenter =
                await loadPresenter(
                    id,
                    memberId,
                    ctx,
                );
            const claim =
                presenter.claimStatus();
            if (
                (claim.kind !== 'claimed'
                    || !claim.byCurrentMember)
                && !presenter.isArchive()
            ) {
                await postWorkOrderClaim(
                    ctx,
                    id,
                );
                presenter =
                    await loadPresenter(
                        id,
                        memberId,
                        ctx,
                    );
            }
            return presenter;
        },
        () => init(params),
    );
    if (!detail) return;

    setHtml(
        container,
        detail.buildPage(),
    );

    const backBtn = $(
        '#work-order-back-btn', container,
    );
    if (backBtn) {
        backBtn.addEventListener(
            'click',
            () => navigateTo('workbox'),
        );
    }

    if (
        !detail.isArchive()
    ) {
        initTransitionButtons(
            container, detail, ctx,
        );
        initUnclaimButton(
            container, detail, ctx,
        );
    }
}
