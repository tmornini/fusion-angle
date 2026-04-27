import {
    html, mutateHtml, SafeHtml,
} from '../safe-html.ts';
import { iconGripVertical } from '../icons.ts';
import { DISPLAY_ABSENT } from '../core.ts';
import type {
    WorkOrderInboxRow,
} from '../adapters/index.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

function relativeTime(iso: string): string {
    const ms = Date.now()
        - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const d = Math.floor(ms / DAY_MS);
    if (d > 0) return d + 'd ago';
    if (hr > 0) return hr + 'h ago';
    if (min > 0) return min + 'm ago';
    return 'just now';
}

export class WorkboxInboxPresenter {
    readonly #items: readonly WorkOrderInboxRow[];
    readonly #showGrip: boolean;

    constructor(
        items: readonly WorkOrderInboxRow[],
        showGrip: boolean,
    ) {
        this.#items = items;
        this.#showGrip = showGrip;
    }

    renderList(
        container: HTMLElement,
    ): void {
        mutateHtml(container, html`${
            this.#items.map(
                i => this.#buildRow(i),
            )
        }`);
    }

    #buildRow(
        item: WorkOrderInboxRow,
    ): SafeHtml {
        const badge = item.isCompleted()
            ? html`<span
                class="badge badge-success"
                >Complete</span>`
            : html`<span
                class="badge badge-info"
                >${
                item.currentStateName()
            }</span>`;
        const name =
            item.lastTransitionerName();
        const from = name ? name : DISPLAY_ABSENT;
        const grip = this.#showGrip
            ? html`<div class="${
                'hidden-mobile text-muted'
                + ' cursor-grab'
            }">${
                iconGripVertical(20, '')
            }</div>`
            : html``;
        return html`
        <div
            class="card p-4 cursor-pointer"
            data-work-order-card="${
                item.idForLink()
            }"
            data-position="${
                item.positionSortKey()
            }">
            <div class="${
                'flex items-center gap-4'
            }">
                ${grip}
                <div class="flex-fill">
                    <div class="${
                        'flex items-center'
                        + ' gap-2 mb-1'
                    }">
                        <span class="${
                            'font-semibold'
                        }">${
                            item.flowNameText()
                        }</span>
                        <span class="${
                            'text-xs text-muted'
                        }">#${
                            item.displayIdText()
                        }</span>
                    </div>
                    <div class="${
                        'flex items-center'
                        + ' gap-2 text-sm'
                        + ' text-muted'
                    }">
                        ${badge}
                        <span>from ${
                            from
                        }</span>
                        <span class="ml-auto"
                            >${
                                item.lastTransitionedAtDate()
                                    ? relativeTime(
                                        item.lastTransitionedAtDate()!,
                                    )
                                    : DISPLAY_ABSENT
                            }</span>
                    </div>
                </div>
            </div>
        </div>`;
    }
}
