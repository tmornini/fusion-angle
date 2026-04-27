import {
    $, $required, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, mutateHtml,
} from '../app/safe-html.ts';
import type { SafeHtml } from '../app/safe-html.ts';
import { buildFieldInputHtml } from '../app/presenters/index.ts';
import { log } from '../app/logger.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import {
    getWorkOrderDetail,
    postActivity,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentUser,
} from '../app/adapters/index.ts';
import type {
    WorkOrderDetail,
    HistoryEntry,
    HistoryFieldValue,
    GraphField,
} from '../app/adapters/index.ts';
import {
    iconArrowLeft,
    iconClock,
} from '../app/icons.ts';

/* ── Helpers ─────────────── */

function relativeTime(iso: string): string {
    const ms = Date.now()
        - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const d = Math.floor(hr / 24);
    if (d > 0) return `${d}d ago`;
    if (hr > 0) return `${hr}h ago`;
    if (min > 0) return `${min}m ago`;
    return 'just now';
}

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

/* ── Build functions ─────── */

function buildFieldRow(
    field: GraphField,
): SafeHtml {
    const label = field.name
        + (field.isRequired ? ' *' : '');
    return html`<div class="mb-4">
        <label class="label">${label}</label>
        ${buildFieldInputHtml(field)}
    </div>`;
}

function buildHistoryEntry(
    entry: HistoryEntry,
): SafeHtml {
    const hasValues =
        entry.fieldValues.length > 0;
    const valuesHtml = hasValues
        ? html`<div
            class="mt-2 ml-6
                work-order-history-fields">
            ${entry.fieldValues.map(
                fv => html`
                <span
                    class="text-muted"
                >${fv.fieldName}</span>
                <span>${fv.value}</span>`,
            )}
        </div>`
        : html``;
    return html`<div
        class="py-3 border-b">
        <div
            class="flex items-center
                gap-3"
        >
            <span class="text-muted">
                ${iconClock(14, '')}
            </span>
            <span
                class="font-semibold"
            >${entry.fromNodeName}
                &rarr;
                ${entry.toNodeName}</span>
            <span
                class="text-muted
                    ml-auto"
            >${entry.userName}</span>
            <span
                class="text-muted
                    text-sm"
            >${relativeTime(
                entry.transitionedAt,
            )}</span>
        </div>
        ${valuesHtml}
    </div>`;
}

function buildDetailView(
    detail: WorkOrderDetail,
): SafeHtml {
    const complete = detail.isComplete();

    const fields = complete
        ? html``
        : html`<div id="work-order-fields"
            class="card mb-6 p-6">
            <h3 class="text-lg
                font-semibold mb-4">
                Fields
            </h3>
            ${detail.renderableFields()
                .toSorted(
                    (a, b) =>
                        a.sortOrder
                        - b.sortOrder,
                )
                .map(buildFieldRow)}
        </div>`;

    const transitions = complete
        ? html``
        : html`<div id="work-order-transitions"
            class="flex gap-3 mb-6
                flex-wrap">
            ${detail.outgoingEdgeList().map(
                e => html`<button
                    class="btn btn-primary"
                    data-edge-id="${e.id}">
                    ${e.name}
                </button>`,
            )}
        </div>`;

    const unclaimBtn = complete
        ? html``
        : html`<button
            id="unclaim-btn"
            class="btn btn-outline">
            Release Work Order
        </button>`;

    return html`<div class="content-wrap">
        <div id="work-order-header"
            class="flex items-center
                gap-4 mb-6">
            <button id="work-order-back-btn"
                class="btn btn-ghost
                    btn-icon">
                ${iconArrowLeft(20, '')}
            </button>
            <div>
                <h1 class="text-2xl
                    font-bold mb-1">
                    ${detail.flowNameText()}
                </h1>
                <div class="flex items-center
                    gap-3">
                    <span
                        class="badge
                            badge-neutral">
                        #${detail
                            .displayIdText()}
                    </span>
                    <span
                        class="badge
                            badge-info">
                        ${detail
                            .currentNodeName()}
                    </span>
                </div>
            </div>
        </div>

        ${fields}
        ${transitions}

        <div class="flex gap-3 mb-6">
            ${unclaimBtn}
        </div>

        <details id="work-order-history" open>
            <summary
                class="text-lg
                    font-semibold mb-3
                    cursor-pointer">
                History
            </summary>
            <div class="card p-4">
                ${!detail.hasHistory()
                    ? html`<p
                        class="text-muted">
                        No history yet.
                    </p>`
                    : detail.historyEntries()
                        .toReversed()
                        .map(
                            buildHistoryEntry,
                        )}
            </div>
        </details>
    </div>`;
}

/* ── Event wiring ────────── */

function initTransitionButtons(
    container: HTMLElement,
    detail: WorkOrderDetail,
    userId: string,
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
                try {
                    await
                        postWorkOrderTransition({
                            workOrderId:
                                detail.idValue(),
                            edgeId,
                            values,
                            userId,
                            currentNodeId:
                                detail
                                    .currentNodeId(),
                        });
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
                await postActivity({
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
    detail: WorkOrderDetail,
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
                    claimId,
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

    const { user } =
        await getCurrentUser();

    const detail = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        async () => {
            let wo = await getWorkOrderDetail(
                id, user.idForLink(),
            );
            const claim =
                wo.claimStatus();
            if (
                (claim.kind !== 'claimed'
                    || !claim.byCurrentUser)
                && !wo.isComplete()
            ) {
                await postWorkOrderClaim(
                    id, user.idForLink(),
                );
                wo = await getWorkOrderDetail(
                    id, user.idForLink(),
                );
            }
            return wo;
        },
        () => init(params),
    );
    if (!detail) return;

    mutateHtml(
        container,
        buildDetailView(detail),
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
            container, detail,
            user.idForLink(),
        );
        initUnclaimButton(
            container, detail,
        );
    }
}
