import { $, $required } from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import type { SafeHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import { navigateTo } from '../app/core';
import {
    getWorkboxItem,
    postWorkOrderTransition,
    postWorkOrderClaim,
    deleteWorkOrderClaim,
    getCurrentUser,
} from '../app/adapters';
import type {
    WorkboxDetail,
    HistoryEntry,
    HistoryFieldValue,
} from '../app/adapters';
import {
    iconArrowLeft,
    iconClock,
} from '../app/icons';
import type {
    GraphField,
} from '../../api/types';

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
        const fieldId =
            input.getAttribute(
                'data-field-id',
            ) ?? '';
        if (input.type === 'checkbox') {
            values[fieldId] = (
                input as HTMLInputElement
            ).checked
                ? 'true'
                : 'false';
        } else {
            values[fieldId] = input.value;
        }
    }
    return values;
}

/* ── Build functions ─────── */

function buildFieldInput(
    field: GraphField,
): SafeHtml {
    const id = field.id;
    const req = field.isRequired
        ? 'required'
        : '';
    switch (field.fieldType) {
        case 'text':
            return html`<input
                type="text"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'textarea':
            return html`<textarea
                class="input"
                rows="3"
                data-field-id="${id}"
                ${req}></textarea>`;
        case 'number':
            return html`<input
                type="number"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'date':
            return html`<input
                type="date"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'email':
            return html`<input
                type="email"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'url':
            return html`<input
                type="url"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'phone':
            return html`<input
                type="tel"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'currency':
            return html`<input
                type="number"
                step="0.01"
                class="input"
                data-field-id="${id}"
                ${req} />`;
        case 'checkbox':
            return html`<input
                type="checkbox"
                data-field-id="${id}" />`;
        case 'select':
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
        case 'radio':
            return html`<div
                class="flex flex-col
                    gap-2">
                ${field.options.map(
                    o => html`<label
                        class="flex
                            items-center
                            gap-2">
                        <input
                            type="radio"
                            name="${id}"
                            value="${o}"
                            data-field-id
                                ="${id}" />
                        ${o}
                    </label>`,
                )}
            </div>`;
        case 'multi_select':
            return html`<div
                class="flex flex-col
                    gap-2">
                ${field.options.map(
                    o => html`<label
                        class="flex
                            items-center
                            gap-2">
                        <input
                            type="checkbox"
                            value="${o}"
                            data-field-id
                                ="${id}" />
                        ${o}
                    </label>`,
                )}
            </div>`;
        case 'file':
            return html`<input
                type="file"
                class="input"
                data-field-id="${id}" />`;
        case 'image':
            return html`<input
                type="file"
                accept="image/*"
                class="input"
                data-field-id="${id}" />`;
    }
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
            class="mt-2 ml-6"
            style="display:grid;
                grid-template-columns:
                    auto 1fr;
                gap:0.25rem 0.75rem;
                font-size:0.8125rem">
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
        class="py-3"
        style="border-bottom:1px solid
            hsl(var(--border))">
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
    detail: WorkboxDetail,
): SafeHtml {
    const isComplete =
        detail.currentNode.isComplete
            === true;

    const fields = isComplete
        ? html``
        : html`<div id="wo-fields"
            class="card mb-6 p-6">
            <h3 class="text-lg
                font-semibold mb-4">
                Fields
            </h3>
            ${detail.currentNode.fields
                .toSorted(
                    (a, b) =>
                        a.sortOrder
                        - b.sortOrder,
                )
                .map(buildFieldRow)}
        </div>`;

    const transitions = isComplete
        ? html``
        : html`<div id="wo-transitions"
            class="flex gap-3 mb-6
                flex-wrap">
            ${detail.outgoingEdges.map(
                e => html`<button
                    class="btn btn-primary"
                    data-edge-id="${e.id}">
                    ${e.name}
                </button>`,
            )}
        </div>`;

    const unclaimBtn = isComplete
        ? html``
        : html`<button
            id="unclaim-btn"
            class="btn btn-outline">
            Release Work Order
        </button>`;

    return html`<div>
        <a href="#" id="wo-back-btn"
            class="flex items-center
                gap-1 text-muted mb-4"
            style="text-decoration:none;
                cursor:pointer">
            ${iconArrowLeft(16, '')}
            Workbox
        </a>
        <div id="wo-header" class="mb-6">
            <h1 class="text-2xl
                font-bold mb-1">
                ${detail.flowName}
            </h1>
            <div class="flex items-center
                gap-3">
                <span
                    class="badge
                        badge-neutral">
                    #${detail.displayId}
                </span>
                <span
                    class="badge
                        badge-info">
                    ${detail.currentNode
                        .name}
                </span>
            </div>
        </div>

        ${fields}
        ${transitions}

        <div class="flex gap-3 mb-6">
            ${unclaimBtn}
        </div>

        <details id="wo-history" open>
            <summary
                class="text-lg
                    font-semibold mb-3"
                style="cursor:pointer">
                History
            </summary>
            <div class="card p-4">
                ${detail.history.length === 0
                    ? html`<p
                        class="text-muted">
                        No history yet.
                    </p>`
                    : detail.history
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
    detail: WorkboxDetail,
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
                const edgeId =
                    btn.getAttribute(
                        'data-edge-id',
                    ) ?? '';
                const values =
                    collectFieldValues(
                        container,
                    );
                const hasEmpty =
                    detail.currentNode
                        .fields
                        .filter(
                            f => f.isRequired,
                        )
                        .some(
                            f =>
                                (values[f.id]
                                    ?? '') === '',
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
                try {
                    await
                        postWorkOrderTransition(
                            detail.id,
                            edgeId,
                            values,
                            userId,
                            detail.currentNode
                                .id,
                        );
                    showToast(
                        'Transition'
                        + ' complete',
                        'success',
                    );
                    navigateTo('workbox');
                } catch {
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
    detail: WorkboxDetail,
): void {
    const btn = $(
        '#unclaim-btn', container,
    );
    if (!btn) return;
    btn.addEventListener(
        'click',
        async () => {
            try {
                await deleteWorkOrderClaim(
                    detail.claimId,
                );
                showToast(
                    'Work order released',
                    'success',
                );
                navigateTo('workbox');
            } catch {
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
        '#wo-detail-content', document,
    );
    if (!container) return;

    const { user } =
        await getCurrentUser();

    const detail = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        async () => {
            let wo = await getWorkboxItem(
                id, user.id,
            );
            if (
                !wo.claimedByCurrentUser
                && !wo.currentNode.isComplete
            ) {
                await postWorkOrderClaim(
                    id, user.id,
                );
                wo = await getWorkboxItem(
                    id, user.id,
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
        '#wo-back-btn', container,
    );
    if (backBtn) {
        backBtn.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                navigateTo('workbox');
            },
        );
    }

    if (
        !detail.currentNode.isComplete
    ) {
        initTransitionButtons(
            container, detail, user.id,
        );
        initUnclaimButton(
            container, detail,
        );
    }
}
