import {
    $, $required, attr,
} from '../app/dom';
import {
    html, setHtml, trusted,
} from '../app/safe-html';
import type { SafeHtml } from '../app/safe-html';
import { log } from '../app/logger';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import { navigateTo } from '../app/core';
import {
    getWorkOrderDetail,
    postActivity,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentUser,
} from '../app/adapters';
import type {
    WorkOrderDetail,
    HistoryEntry,
    HistoryFieldValue,
    GraphField,
} from '../app/adapters';
import {
    iconArrowLeft,
    iconClock,
} from '../app/icons';

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
        const fieldId = attr(
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

const FIELD_HTML_TYPE: Record<
    string,
    { type: string; extra?: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    email: { type: 'email' },
    url: { type: 'url' },
    phone: { type: 'tel' },
    currency: {
        type: 'number',
        extra: 'step="0.01"',
    },
    checkbox: { type: 'checkbox' },
    file: { type: 'file' },
    image: {
        type: 'file',
        extra: 'accept="image/*"',
    },
};

function buildFieldInput(
    field: GraphField,
): SafeHtml {
    const id = field.id;
    const req = field.isRequired
        ? 'required'
        : '';
    if (field.fieldType === 'textarea') {
        return html`<textarea
            class="input"
            rows="3"
            data-field-id="${id}"
            ${req}></textarea>`;
    }
    if (field.fieldType === 'select') {
        return html`<select
            class="input"
            data-field-id="${id}"
            ${req}>
            <option value="">
                Select...
            </option>
            ${field.options.map(
                o => html`<option
                    value="${o}"
                    >${o}</option>`,
            )}
        </select>`;
    }
    if (
        field.fieldType === 'radio'
        || field.fieldType
            === 'multi_select'
    ) {
        const inputType =
            field.fieldType === 'radio'
                ? 'radio' : 'checkbox';
        return html`<div
            class="flex flex-col
                gap-2">
            ${field.options.map(
                o => html`<label
                    class="flex
                        items-center
                        gap-2">
                    <input
                        type="${inputType}"
                        name="${id}"
                        value="${o}"
                        data-field-id
                            ="${id}" />
                    ${o}
                </label>`,
            )}
        </div>`;
    }
    const spec =
        FIELD_HTML_TYPE[field.fieldType];
    if (!spec) {
        return html`<input
            type="text"
            class="input"
            data-field-id="${id}"
            ${req} />`;
    }
    if (spec.type === 'checkbox') {
        return html`<input
            type="checkbox"
            data-field-id="${id}"
            ${req} />`;
    }
    const extra = spec.extra
        ? trusted(spec.extra)
        : html``;
    return html`<input
        type="${spec.type}"
        class="input"
        data-field-id="${id}"
        ${extra}
        ${req} />`;
}

function buildFieldRow(
    field: GraphField,
): SafeHtml {
    const label = field.name
        + (field.isRequired ? ' *' : '');
    return html`<div class="mb-4">
        <label class="label">${label}</label>
        ${buildFieldInput(field)}
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
            >${entry.userName
                || '\u2014'}</span>
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
                const edgeId = attr(
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
                        'Transition'
                        + ' complete',
                        'success',
                    );
                    navigateTo('workbox');
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
                }
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
                showToast(
                    'Work order released',
                    'success',
                );
                navigateTo('workbox');
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
            }
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

    setHtml(
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
