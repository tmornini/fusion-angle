import {
    html, setHtml, SafeHtml,
    trusted, escapeForHtml,
} from '../safe-html.ts';
import { ICON_SIZE, iconGripVertical } from '../icons.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    memberName,
    type WorkOrder,
    type TransitionEvent,
} from '../adapters/index.ts';
import type { Member } from '../adapters/index.ts';
import {
    SECONDS_PER_DAY,
    MS_PER_SECOND,
} from '../../../api/types.ts';
import type { Id } from '../../../api/types.ts';

const DAY_MS = SECONDS_PER_DAY * MS_PER_SECOND;

function itemMatchesMode(
    mode: InboxMode,
    completed: boolean,
): boolean {
    return mode === 'active'
        ? !completed
        : completed;
}

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

export interface InboxItem {
    id: string;
    displayId: string;
    flowName: string;
    stateName: string;
    transitionerName: string | null;
    claimedByName: string | null;
    lastTransitionedAt: string | null;
    completed: boolean;
    position: number;
    taskInstructions: string;
}

export type InboxMode = 'active' | 'archived';

// An active claim resolved from the states log for one
// work order. The inbox names the claim-holder on the
// item it renders — a claimed work order is shown, never
// hidden.
export interface ActiveClaim {
    memberId: Id;
    at: string;
}

export class WorkboxInboxPresenter {
    readonly #items: readonly InboxItem[];
    readonly #showGrip: boolean;

    constructor(
        items: readonly InboxItem[],
        showGrip: boolean,
    ) {
        this.#items = items;
        this.#showGrip = showGrip;
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, html`${
            this.#items.map(
                i => this.#buildRow(i),
            )
        }`);
    }

    #buildRow(
        item: InboxItem,
    ): SafeHtml {
        const titleAttr = item.taskInstructions
            ? trusted(' title="'
                + escapeForHtml(
                    item.taskInstructions,
                )
                + '"')
            : trusted('');
        const badge = item.completed
            ? html`<span
                class="badge badge-success"
                >Complete</span>`
            : html`<span
                class="badge badge-info"${
                titleAttr}
                >${item.stateName}</span>`;
        const claimedBadge =
            !item.completed && item.claimedByName
                ? html`<span
                    class="badge badge-warning"
                    >In progress — ${
                        item.claimedByName
                    }</span>`
                : html``;
        const from = item.transitionerName
            ?? DISPLAY_ABSENT;
        const grip = this.#showGrip
            ? html`<button
                type="button"
                class="${
                    'hidden-mobile text-muted'
                    + ' drag-handle'
                }"
                aria-label="${
                    'Reorder '
                    + item.flowName
                    + ' #' + item.displayId
                }">${
                iconGripVertical(ICON_SIZE.xl, '')
            }</button>`
            : html``;
        return html`
        <div
            class="card p-4 cursor-pointer"
            data-work-order-card="${item.id}"
            data-position="${item.position}">
            <div class="${
                'flex items-center gap-4'
            }">
                ${grip}
                <div class="flex-fill">
                    <a href="${
                        buildPageUrl(
                            'workbox-detail',
                            { id: item.id },
                        )
                    }" class="${
                        'flex items-center'
                        + ' gap-2 mb-1'
                    }">
                        <span class="${
                            'font-semibold'
                        }">${
                            item.flowName
                        }</span>
                        <span class="${
                            'text-xs text-muted'
                        }">#${
                            item.displayId
                        }</span>
                    </a>
                    <div class="${
                        'flex items-center'
                        + ' gap-2 text-sm'
                        + ' text-muted'
                    }">
                        ${badge}
                        ${claimedBadge}
                        <span>from ${
                            from
                        }</span>
                        <span class="ml-auto"
                            >${
                                item.lastTransitionedAt
                                    ? relativeTime(
                                        item.lastTransitionedAt,
                                    )
                                    : DISPLAY_ABSENT
                            }</span>
                    </div>
                </div>
            </div>
        </div>`;
    }
}

export function buildInboxItems(
    workOrders:
        readonly WorkOrder[],
    transitionsByWo:
        ReadonlyMap<Id, readonly TransitionEvent[]>,
    activeClaimsByWo:
        ReadonlyMap<Id, ActiveClaim>,
    memberMap: Map<Id, Member>,
    mode: InboxMode,
): InboxItem[] {
    const items: InboxItem[] = [];
    for (const wo of workOrders) {
        const fg = wo.flowGraph;
        const woTransitions =
            transitionsByWo.get(wo.id);
        if (!woTransitions
            || woTransitions.length === 0) {
            throw new Error(
                `Work order ${wo.id}`
                + ' has no transitions',
            );
        }
        const sorted = [...woTransitions]
            .sort(
                (a, b) =>
                    a.at.localeCompare(b.at),
            );
        const lastTransition = sorted.at(-1)!;
        const lastToId =
            lastTransition.toNodeId;
        const curNode = fg.nodes.find(
            n => n.id === lastToId,
        );
        if (!curNode) {
            throw new Error(
                'invariant violated:'
                + ' transition for work'
                + ' order ' + wo.id
                + ' references unknown'
                + ' node ' + lastToId,
            );
        }
        const completed = curNode.isArchive;

        const activeClaim =
            activeClaimsByWo.get(wo.id);
        if (!itemMatchesMode(mode, completed))
            continue;

        items.push({
            id: wo.id,
            displayId: wo.displayId,
            flowName: fg.name,
            stateName: curNode.name,
            transitionerName: memberName(
                memberMap, lastTransition.memberId,
            ),
            claimedByName: activeClaim
                ? memberName(
                    memberMap,
                    activeClaim.memberId,
                )
                : null,
            lastTransitionedAt:
                lastTransition.at,
            completed,
            position: wo.position,
            taskInstructions:
                curNode.taskInstructions,
        });
    }

    return items.toSorted(
        (a, b) => a.position - b.position,
    );
}
