import {
    html, SafeHtml,
    trusted, escapeForHtml,
} from '../safe-html.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import { idLabel } from './id-label.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    type WorkOrder,
} from '../../../client/index.ts';
import {
    SECONDS_PER_DAY,
    MS_PER_SECOND,
} from '../../../shared/types.ts';
import type { Id } from '../../../shared/types.ts';
import type { PressedPill } from './workbox-pills.ts';

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
    flowName: string;
    stateName: string;
    lastTransitionedAt: string | null;
    completed: boolean;
    taskInstructions: string;
}

// A head whose node its flow graph no longer holds: it has
// no state to name, no completion, and no instructions.
interface UnplacedInboxItem {
    kind: 'unplaced';
    id: string;
    flowName: string;
    lastTransitionedAt: string | null;
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

const LIST_TITLE: Record<InboxListKind, string> = {
    available: 'Work Orders available to me',
    claimed: 'Work Orders claimed by me',
    archivedByMe: 'Work Orders archived by me',
};

const LIST_ID: Record<InboxListKind, string> = {
    available: 'available-list',
    claimed: 'claimed-list',
    archivedByMe: 'archived-list',
};

// What narrows a painted list: nothing, or the search
// text whose QUERY answer the list holds.
export type InboxFilter =
    | { readonly kind: 'none' }
    | { readonly kind: 'matched'; readonly text: string };

export interface InboxLists {
    available: InboxItem[];
    claimed: InboxItem[];
    archivedByMe: InboxItem[];
}

// A live claim on a work-order head. This member's
// claim is on the claimed list; another's is omitted.
export interface ActiveClaim {
    memberId: Id;
    at: string;
}

// One headed list the left box draws: which list, and the
// rows the pressed pill leaves in it.
export interface InboxSection {
    readonly kind: InboxListKind;
    readonly items: readonly InboxItem[];
}

// Static: no data-work-order-card and no link, so the page
// never opens it in the box, which could not place it.
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
                        'text-xs text-muted min-w-0'
                    }">${
                        idLabel('Work order', item.id)
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

// A row: its title links to its work order, its state
// badge and age below.
function buildInboxRow(
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
        data-work-order-card="${item.id}">
        <div class="${
            'flex items-center gap-4'
        }">
            <div class="flex-fill">
                <a href="${
                    buildPageUrl(
                        'workbox',
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
                        'text-xs text-muted min-w-0'
                    }">${
                        idLabel('Work order', item.id)
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

// What the left box draws for the pressed pill: both
// lists, claimed first; the claimed list alone; the
// archive alone; or both lists narrowed to one flow.
export function inboxSectionsOf(
    lists: InboxLists,
    pressed: PressedPill,
): InboxSection[] {
    if (pressed.kind === 'claimed') {
        return [{ kind: 'claimed', items: lists.claimed }];
    }
    if (pressed.kind === 'archivedByMe') {
        return [{
            kind: 'archivedByMe', items: lists.archivedByMe,
        }];
    }
    if (pressed.kind === 'flow') {
        return [
            {
                kind: 'claimed',
                items: inFlow(lists.claimed, pressed.flowName),
            },
            {
                kind: 'available',
                items: inFlow(
                    lists.available, pressed.flowName,
                ),
            },
        ];
    }
    return [
        { kind: 'claimed', items: lists.claimed },
        { kind: 'available', items: lists.available },
    ];
}

function inFlow(
    items: readonly InboxItem[],
    flowName: string,
): InboxItem[] {
    return items.filter((item) => item.flowName === flowName);
}

// The headed lists; an empty one keeps its heading and
// says so.
export function buildInboxLists(
    sections: readonly InboxSection[],
    filter: InboxFilter,
    pressed: PressedPill,
): SafeHtml {
    return html`${sections.map(
        (section, index) => buildInboxSection(
            section, index === 0, filter, pressed,
        ),
    )}`;
}

function buildInboxSection(
    section: InboxSection,
    first: boolean,
    filter: InboxFilter,
    pressed: PressedPill,
): SafeHtml {
    const rows = section.items.length === 0
        ? html`<p class="text-muted">${
            emptyCopyOf(section.kind, filter, pressed)
        }</p>`
        : html`${section.items.map(buildInboxRow)}`;
    return html`<h2 class="${
        first
            ? 'text-lg font-semibold mb-4'
            : 'text-lg font-semibold mt-6 mb-4'
    }">${LIST_TITLE[section.kind]}</h2>
    <div
        id="${LIST_ID[section.kind]}"
        class="flex flex-col gap-3"
        data-inbox-list="${section.kind}">${rows}</div>`;
}

// A search's empty line names its text; under a flow pill
// a list's own line names the flow.
function emptyCopyOf(
    kind: InboxListKind,
    filter: InboxFilter,
    pressed: PressedPill,
): string {
    if (filter.kind === 'matched') {
        return 'No work orders match “' + filter.text + '”';
    }
    if (pressed.kind === 'flow') {
        return EMPTY_COPY[kind] + ' in ' + pressed.flowName;
    }
    return EMPTY_COPY[kind];
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
        flowName: fg.name,
        lastTransitionedAt: wo.transition.at,
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

// Each work order into the list its membership rules name,
// in the order given: a QUERY answer keeps its best match
// first.
export function partitionInboxItems(
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
    return { available, claimed, archivedByMe };
}

export function buildInboxItems(
    workOrders: readonly WorkOrder[],
    activeClaimsByWo:
        ReadonlyMap<Id, ActiveClaim>,
    currentMemberId: Id,
): InboxLists {
    const lists = partitionInboxItems(
        workOrders, activeClaimsByWo, currentMemberId,
    );
    return {
        available: lists.available.toSorted(byAtAsc),
        claimed: lists.claimed.toSorted(byAtAsc),
        archivedByMe:
            lists.archivedByMe.toSorted(byAtDesc),
    };
}
