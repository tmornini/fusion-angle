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
} from '../../../client/index.ts';
import type { Member } from '../../../shared/types.ts';
import {
    SECONDS_PER_DAY,
    MS_PER_SECOND,
} from '../../../shared/types.ts';
import type { Id } from '../../../shared/types.ts';

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

interface PlacedInboxItem {
    kind: 'placed';
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

// A head whose node its flow graph no longer holds: it has
// no state to name, no completion, and no instructions.
interface UnplacedInboxItem {
    kind: 'unplaced';
    id: string;
    displayId: string;
    flowName: string;
    transitionerName: string | null;
    claimedByName: string | null;
    lastTransitionedAt: string | null;
    position: number;
}

export type InboxItem = PlacedInboxItem | UnplacedInboxItem;

export type InboxMode = 'active' | 'archived';

// A work order's claim that is live now: the head's claim,
// judged against its expiresAt by the page that reads the
// twin. The inbox names the claim-holder on the item it
// renders — a claimed work order is shown, never hidden.
export interface ActiveClaim {
    memberId: Id;
    at: string;
}

// Static: no data-work-order-card, so the page neither
// navigates it to a detail page that cannot place it nor
// drags it; no link and no grip either.
function buildUnplacedRow(
    item: UnplacedInboxItem,
): SafeHtml {
    const from = item.transitionerName
        ?? DISPLAY_ABSENT;
    return html`
        <div class="card p-4">
            <div class="flex-fill">
                <div class="${
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
                </div>
                <div class="${
                    'flex items-center'
                    + ' gap-2 text-sm'
                    + ' text-muted'
                }">
                    <span
                        class="badge badge-warning"
                        >State unknown</span>
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
        </div>`;
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
        if (item.kind === 'unplaced')
            return buildUnplacedRow(item);
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
    activeClaimsByWo:
        ReadonlyMap<Id, ActiveClaim>,
    memberMap: Map<Id, Member>,
    mode: InboxMode,
): InboxItem[] {
    const items: InboxItem[] = [];
    for (const wo of workOrders) {
        const fg = wo.flowGraph;
        const curNode = fg.nodes.find(
            n => n.id === wo.nodeId,
        );
        // A head whose node is gone cannot claim to be
        // finished, so only the Active tab shows it.
        const shown = curNode
            ? itemMatchesMode(mode, curNode.isArchive)
            : mode === 'active';
        if (!shown)
            continue;

        const activeClaim =
            activeClaimsByWo.get(wo.id);
        const row = {
            id: wo.id,
            displayId: wo.displayId,
            flowName: fg.name,
            transitionerName: memberName(
                memberMap, wo.transition.memberId,
            ),
            claimedByName: activeClaim
                ? memberName(
                    memberMap,
                    activeClaim.memberId,
                )
                : null,
            lastTransitionedAt: wo.transition.at,
            position: wo.position,
        };
        items.push(curNode
            ? {
                kind: 'placed',
                ...row,
                stateName: curNode.name,
                completed: curNode.isArchive,
                taskInstructions:
                    curNode.taskInstructions,
            }
            : { kind: 'unplaced', ...row });
    }

    return items.toSorted(
        (a, b) => a.position - b.position,
    );
}
