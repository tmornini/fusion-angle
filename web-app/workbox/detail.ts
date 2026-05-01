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
    getUserMap,
    postActivity,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentUserRow,
    createFetchContext,
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

/* ── Event wiring ────────── */

function initTransitionButtons(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
    ctx: ReturnType<typeof createFetchContext>,
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
                const hasEmpty =
                    detail
                        .renderableFields()
                        .filter(
                            f => f.isRequired,
                        )
                        .some(f => {
                            const v
                                = values[f.id];
                            return v === undefined
                                || v === '';
                        });
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
    ctx: ReturnType<typeof createFetchContext>,
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
    currentUserId: string,
    ctx: ReturnType<typeof createFetchContext>,
): Promise<WorkboxDetailPresenter> {
    const [
        workOrder, transitions,
        fieldValuesByTransition,
        claims, userMap,
    ] = await Promise.all([
        getWorkOrder(ctx, workOrderId),
        getWorkOrderTransitionRowsByOrder(
            ctx, workOrderId,
        ),
        getTransitionFieldValuesByTransition(ctx),
        getWorkOrderClaimRowsByOrder(ctx, workOrderId),
        getUserMap(ctx),
    ]);
    return new WorkboxDetailPresenter(
        workOrder,
        transitions,
        fieldValuesByTransition,
        claims,
        userMap,
        currentUserId,
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

    const ctx = createFetchContext();
    const userRow =
        await getCurrentUserRow(ctx);
    const userId = userRow.id;

    const detail = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        async () => {
            let presenter =
                await loadPresenter(
                    id,
                    userId,
                    ctx,
                );
            const claim =
                presenter.claimStatus();
            if (
                (claim.kind !== 'claimed'
                    || !claim.byCurrentUser)
                && !presenter.isComplete()
            ) {
                await postWorkOrderClaim(
                    ctx,
                    generateCryptoSafeBase62(),
                    id,
                );
                presenter =
                    await loadPresenter(
                        id,
                        userId,
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
        !detail.isComplete()
    ) {
        initTransitionButtons(
            container, detail, ctx,
        );
        initUnclaimButton(
            container, detail, ctx,
        );
    }
}
