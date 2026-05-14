import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import {
    setHtml,
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
    getWorkOrderTransitionRowsByOrder,
    getTransitionFieldValuesByTransition,
    getWorkOrderClaimRowsByOrder,
    getWorkerMap,
    postActivity,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentHumanWorker,
    createRequestContext,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';

/* ── Helpers ─────────────── */

function collectFieldValues(
    container: HTMLElement,
): Record<string, string> {
    const values: Record<string, string> =
        {};
    const inputs =
        container.querySelectorAll<
            HTMLInputElement
            | HTMLSelectElement
            | HTMLTextAreaElement
        >('[data-field-id]');
    for (const input of inputs) {
        const fieldId = getRequiredAttribute(
            input, 'data-field-id',
        );
        if (input.type === 'checkbox') {
            values[fieldId] = (
                input as HTMLInputElement
            ).checked
                ? 'true'
                : 'false';
        } else {
            values[fieldId] =
                input.value.trim();
        }
    }
    return values;
}

function hasEmptyRequiredField(
    fields: readonly {
        id: string;
        isRequired: boolean;
    }[],
    values: Record<string, string>,
): boolean {
    return fields
        .filter(f => f.isRequired)
        .some(f => {
            const v = values[f.id];
            return v === undefined || v === '';
        });
}

/* ── Event wiring ────────── */

function initTransitionButtons(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    ctx: ReturnType<typeof createRequestContext>,
): void {
    const buttons =
        container.querySelectorAll<
            HTMLButtonElement
        >('[data-edge-id]');
    for (const btn of buttons) {
        btn.addEventListener(
            'click',
            async () => {
                const edgeId = getRequiredAttribute(
                    btn, 'data-edge-id',
                );
                const values =
                    collectFieldValues(
                        container,
                    );
                const hasEmpty = hasEmptyRequiredField(
                    detail.renderableFields(),
                    values,
                );
                if (hasEmpty) {
                    showToast(
                        'Please fill'
                        + ' all required'
                        + ' fields',
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
                try {
                    await postWorkOrderTransition(
                        ctx,
                        {
                            transitionId:
                                generateCryptoSafeBase62(),
                            workOrderId:
                                detail.idValue(),
                            edgeId,
                            values,
                            fieldValueIds,
                            currentNodeId:
                                detail
                                    .currentNodeId(),
                        },
                    );
                } catch (err) {
                    log.error(
                        'work order'
                        + ' transition'
                        + ' failed',
                        'workbox',
                        err,
                    );
                    showToast(
                        'Transition'
                        + ' failed',
                        'error',
                    );
                    return;
                }
                // Activity logging is
                // best-effort: the user-
                // visible operation
                // (transition) already
                // succeeded, so a logging
                // failure shouldn't
                // overwrite the success
                // toast — but it must not
                // be silent either.
                try {
                    await postActivity(ctx, {
                        type: 'status_changed',
                        action:
                            'transitioned'
                            + ' work order',
                        target:
                            detail
                                .flowNameText()
                            + ' #'
                            + detail
                                .displayIdText(),
                        status: '',
                        feedback: '',
                    });
                } catch (err) {
                    log.warn(
                        'activity logging'
                        + ' failed after'
                        + ' transition',
                        'workbox',
                        err,
                    );
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
    const claimId = claim.claimId;
    btn.addEventListener(
        'click',
        async () => {
            try {
                await deleteWorkOrderClaim(
                    ctx, claimId,
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
    currentPersonId: string,
    ctx: ReturnType<typeof createRequestContext>,
): Promise<WorkboxDetailPresenter> {
    const [
        workOrder, transitions,
        fieldValuesByTransition,
        claims, workerMap,
    ] = await Promise.all([
        getWorkOrder(ctx, workOrderId),
        getWorkOrderTransitionRowsByOrder(
            ctx, workOrderId,
        ),
        getTransitionFieldValuesByTransition(ctx),
        getWorkOrderClaimRowsByOrder(ctx, workOrderId),
        getWorkerMap(ctx),
    ]);
    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        fieldValuesByTransition,
        claims,
        workerMap,
        currentPersonId,
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

    const ctx = createRequestContext();
    const personRow =
        await getCurrentHumanWorker(ctx);
    const personId = personRow.id;

    const detail = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        async () => {
            let presenter =
                await loadPresenter(
                    id,
                    personId,
                    ctx,
                );
            const claim =
                presenter.claimStatus();
            if (
                (claim.kind !== 'claimed'
                    || !claim.byCurrentPerson)
                && !presenter.isArchive()
            ) {
                await postWorkOrderClaim(
                    ctx,
                    generateCryptoSafeBase62(),
                    id,
                );
                presenter =
                    await loadPresenter(
                        id,
                        personId,
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
