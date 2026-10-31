import {
    html, setHtml, SafeHtml,
    trusted, escapeForHtml,
} from '../safe-html.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    type WorkOrder,
} from '../../../client/index.ts';
import {
    SECONDS_PER_DAY,
    MS_PER_SECOND,
} from '../../../shared/types.ts';
import type { Id } from '../../../shared/types.ts';

const DAY_MS = SECONDS_PER_DAY * MS_PER_SECOND;

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

export type InboxListKind =
    | 'available'
    | 'claimed'
    | 'archivedByMe';

const EMPTY_COPY: Record<InboxListKind, string> = {
    available: 'No work orders available to me',
    claimed: 'No work orders claimed by me',
    archivedByMe: 'No work orders archived by me',
};

export interface InboxLists {
    available: InboxItem[];
    claimed: InboxItem[];
    archivedByMe: InboxItem[];
}

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
    readonly #kind: InboxListKind;

    constructor(
        items: readonly InboxItem[],
        kind: InboxListKind,
    ) {
        this.#items = items;
        this.#kind = kind;
    }

    renderList(
        container: HTMLElement,
    ): void {
        if (this.#items.length === 0) {
            setHtml(container, html`<p
                class="text-muted"
            >${EMPTY_COPY[this.#kind]}</p>`);
            return;
        }
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
        return html`
        <div
            class="card p-4 cursor-pointer"
            data-work-order-card="${item.id}"
            data-position="${item.position}">
            <div class="${
                'flex items-center gap-4'
            }">
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

function archiveNode(
    wo: WorkOrder,
): boolean {
    const node = wo.flowGraph.nodes.find(
        n => n.id === wo.nodeId,
    );
    return node?.isArchive === true;
}

function toItem(wo: WorkOrder): InboxItem {
    const fg = wo.flowGraph;
    const curNode = fg.nodes.find(
        n => n.id === wo.nodeId,
    );
    const row = {
        id: wo.id,
        displayId: wo.displayId,
        flowName: fg.name,
        transitionerName: null as string | null,
        claimedByName: null as string | null,
        lastTransitionedAt: wo.transition.at,
        position: wo.position,
    };
    return curNode
        ? {
            kind: 'placed',
            ...row,
            stateName: curNode.name,
            completed: curNode.isArchive,
            taskInstructions:
                curNode.taskInstructions,
        }
        : { kind: 'unplaced', ...row };
}

function byAtAsc(
    a: InboxItem, b: InboxItem,
): number {
    return (a.lastTransitionedAt ?? '')
        .localeCompare(
            b.lastTransitionedAt ?? '',
        );
}

function byAtDesc(
    a: InboxItem, b: InboxItem,
): number {
    return byAtAsc(b, a);
}

function byPosition(
    a: InboxItem, b: InboxItem,
): number {
    return a.position - b.position;
}

export function buildInboxItems(
    workOrders: readonly WorkOrder[],
    activeClaimsByWo:
        ReadonlyMap<Id, ActiveClaim>,
    currentMemberId: Id,
): InboxLists {
    const available: InboxItem[] = [];
    const claimed: InboxItem[] = [];
    const archivedByMe: InboxItem[] = [];
    for (const wo of workOrders) {
        if (archiveNode(wo)) {
            if (
                wo.transition.memberId
                    === currentMemberId
            ) {
                archivedByMe.push(toItem(wo));
            }
            continue;
        }
        const live = activeClaimsByWo.get(wo.id);
        if (live) {
            if (live.memberId === currentMemberId) {
                claimed.push(toItem(wo));
            }
            continue;
        }
        available.push(toItem(wo));
    }
    return {
        available: available.toSorted(byAtAsc),
        claimed: claimed.toSorted(byPosition),
        archivedByMe: archivedByMe.toSorted(byAtDesc),
    };
}
