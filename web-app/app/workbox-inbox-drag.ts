import { $$, createElement } from './dom.ts';
import {
    computeNewPosition,
    dropIndex as computeDropIndex,
    followTranslate,
} from './drag-reorder-positions.ts';
import {
    WorkboxInboxPresenter,
    type InboxListKind,
} from './presenters/workbox-inbox.ts';
import {
    deleteWorkOrderClaim,
    putWorkOrderClaim,
    putWorkOrderPosition,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';

export type InboxDropDestination =
    | InboxListKind
    | 'outside';

export const INBOX_DRAG_THRESHOLD_PX = 4;

export function inboxPointerMoved(
    startX: number,
    startY: number,
    x: number,
    y: number,
): boolean {
    return Math.max(
        Math.abs(x - startX),
        Math.abs(y - startY),
    ) >= INBOX_DRAG_THRESHOLD_PX;
}

export function inboxDragMoved(
    alreadyMoved: boolean,
    startX: number,
    startY: number,
    x: number,
    y: number,
): boolean {
    return alreadyMoved
        || inboxPointerMoved(startX, startY, x, y);
}

export function inboxShowsDropIndicator(
    dest: InboxDropDestination,
): boolean {
    return dest === 'claimed';
}

export type InboxListRect = {
    readonly kind: InboxListKind;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
};

export function inboxListKindAtPoint(
    x: number,
    y: number,
    lists: readonly InboxListRect[],
): InboxDropDestination {
    for (const list of lists) {
        if (
            x >= list.left
            && x <= list.right
            && y >= list.top
            && y <= list.bottom
        ) {
            return list.kind;
        }
    }
    return 'outside';
}

export type InboxDropAction =
    | 'claim'
    | 'release'
    | 'reorder'
    | 'none';

export function inboxListKindFromHash(
    hash: string,
): 'claimed' | 'archivedByMe' {
    return hash === '#archived'
        ? 'archivedByMe'
        : 'claimed';
}

export function classifyInboxDrop(
    source: InboxListKind,
    destination: InboxDropDestination,
    rightListKind: 'claimed' | 'archivedByMe',
): InboxDropAction {
    if (rightListKind === 'archivedByMe') {
        return 'none';
    }
    if (
        destination === 'outside'
        || destination === 'archivedByMe'
        || source === 'archivedByMe'
    ) {
        return 'none';
    }
    if (
        source === 'available'
        && destination === 'claimed'
    ) {
        return 'claim';
    }
    if (
        source === 'claimed'
        && destination === 'available'
    ) {
        return 'release';
    }
    if (
        source === 'claimed'
        && destination === 'claimed'
    ) {
        return 'reorder';
    }
    return 'none';
}

export type InboxTransfer =
    | { kind: 'claim'; position: number }
    | { kind: 'release' }
    | { kind: 'reorder'; position: number }
    | { kind: 'none' };

export async function transferInboxDrop(
    ctx: RequestContext,
    held: WorkOrder,
    drop: InboxTransfer,
): Promise<WorkOrder> {
    if (drop.kind === 'none') {
        return held;
    }
    if (drop.kind === 'release') {
        return await deleteWorkOrderClaim(
            ctx, held,
        );
    }
    if (drop.kind === 'reorder') {
        return await putWorkOrderPosition(
            ctx, held, drop.position,
        );
    }
    const claimed = await putWorkOrderClaim(
        ctx, held,
    );
    return await putWorkOrderPosition(
        ctx, claimed, drop.position,
    );
}

function stripEmptyCopy(list: HTMLElement): void {
    for (const child of [...list.children]) {
        if (child.tagName === 'P') {
            child.remove();
        }
    }
}

function paintEmptyIfNoCards(
    list: HTMLElement,
    kind: InboxListKind,
): void {
    if (list.querySelector('[data-work-order-card]')) {
        return;
    }
    new WorkboxInboxPresenter([], kind)
        .renderList(list);
}

function insertClaimedByPosition(
    list: HTMLElement,
    card: HTMLElement,
    position: number,
): void {
    const cards = $$('[data-work-order-card]', list);
    const before = cards.find(c => {
        const raw = c.getAttribute('data-position');
        return raw !== null
            && parseFloat(raw) > position;
    });
    if (before) {
        list.insertBefore(card, before);
    } else {
        list.appendChild(card);
    }
}

export function paintInboxDrop(
    card: HTMLElement,
    transfer: InboxTransfer,
    lists: {
        available: HTMLElement;
        claimed: HTMLElement;
    },
): void {
    if (transfer.kind === 'none') {
        return;
    }
    if (transfer.kind === 'release') {
        stripEmptyCopy(lists.available);
        lists.available.appendChild(card);
        paintEmptyIfNoCards(
            lists.claimed, 'claimed',
        );
        return;
    }
    stripEmptyCopy(lists.claimed);
    insertClaimedByPosition(
        lists.claimed, card, transfer.position,
    );
    if (transfer.kind === 'claim') {
        paintEmptyIfNoCards(
            lists.available, 'available',
        );
    }
}

type CardRect = {
    readonly top: number;
    readonly height: number;
};

type DragState =
    | { kind: 'idle' }
    | {
        kind: 'active';
        id: string;
        source: InboxListKind;
        indicator: HTMLElement | null;
        idx: number | null;
        rects: readonly CardRect[] | null;
        startClientX: number;
        startClientY: number;
        moved: boolean;
        card: HTMLElement;
        pointerId: number;
    };

function readListKind(
    el: Element,
): InboxListKind | null {
    const list = el.closest('[data-inbox-list]');
    const kind = list?.getAttribute(
        'data-inbox-list',
    );
    if (
        kind === 'available'
        || kind === 'claimed'
        || kind === 'archivedByMe'
    ) {
        return kind;
    }
    return null;
}

export function initInboxDrag(
    root: HTMLElement,
    options: {
        cardSelector: string;
        idAttribute: string;
        rightListKind: () =>
            'claimed' | 'archivedByMe';
        onDrop: (
            id: string,
            transfer: InboxTransfer,
        ) => void;
    },
): void {
    let drag: DragState = { kind: 'idle' };
    let suppressClick = false;

    root.addEventListener(
        'click',
        (e) => {
            if (!suppressClick) return;
            suppressClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        { capture: true },
    );

    function claimedList(): HTMLElement | null {
        return root.querySelector<HTMLElement>(
            '#claimed-list',
        );
    }

    function claimedCards(): HTMLElement[] {
        const list = claimedList();
        if (!list) return [];
        return $$(options.cardSelector, list);
    }

    function listKindAt(
        x: number,
        y: number,
    ): InboxDropDestination {
        const lists: InboxListRect[] = [];
        for (const list of $$('[data-inbox-list]', root)) {
            const kind = readListKind(list);
            if (kind === null) continue;
            const column = list.closest('.card');
            const r = (column ?? list)
                .getBoundingClientRect();
            lists.push({
                kind,
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
            });
        }
        return inboxListKindAtPoint(x, y, lists);
    }

    function buildIndicator(): HTMLElement {
        const el = createElement('div');
        el.className = 'inbox-drop-indicator';
        return el;
    }

    function clearIndicator(): void {
        if (drag.kind !== 'active') return;
        drag.indicator?.remove();
        drag = {
            ...drag,
            indicator: null,
            idx: null,
        };
    }

    function paintDropTarget(
        dest: InboxDropDestination,
    ): void {
        const markAvailable = drag.kind === 'active'
            && drag.source === 'claimed'
            && dest === 'available';
        for (
            const list of $$('[data-inbox-list]', root)
        ) {
            const kind = readListKind(list);
            const column = list.closest('.card')
                ?? list;
            column.classList.toggle(
                'inbox-drop-target',
                markAvailable
                    && kind === 'available',
            );
        }
    }

    function positionsOf(
        items: readonly HTMLElement[],
    ): number[] {
        return items.map(c => {
            const raw = c.getAttribute(
                'data-position',
            );
            if (raw === null) {
                throw new Error(
                    'inbox-drag: card missing'
                    + ' data-position',
                );
            }
            return parseFloat(raw);
        });
    }

    function dropSlot(
        y: number,
        lastIdx: number | null,
    ): number {
        let rects: readonly CardRect[];
        if (
            drag.kind === 'active'
            && drag.rects !== null
        ) {
            rects = drag.rects;
        } else {
            rects = claimedCards().map((c) => {
                const r =
                    c.getBoundingClientRect();
                return {
                    top: r.top,
                    height: r.height,
                };
            });
            if (drag.kind === 'active') {
                drag = { ...drag, rects };
            }
        }
        return computeDropIndex(y, lastIdx, rects);
    }

    function transferOf(
        source: InboxListKind,
        dest: InboxDropDestination,
        y: number,
        idx: number | null,
    ): InboxTransfer {
        const action = classifyInboxDrop(
            source, dest, options.rightListKind(),
        );
        if (action === 'release') {
            return { kind: 'release' };
        }
        if (action === 'none') {
            return { kind: 'none' };
        }
        const slot = idx ?? dropSlot(y, null);
        const position = computeNewPosition(
            positionsOf(claimedCards()),
            slot,
        );
        if (action === 'claim') {
            return { kind: 'claim', position };
        }
        return { kind: 'reorder', position };
    }

    root.addEventListener('pointerdown', (e) => {
        suppressClick = false;
        if (e.button !== 0) return;
        const card = (e.target as Element)
            .closest<HTMLElement>(
                options.cardSelector,
            );
        if (!card || !root.contains(card)) return;
        const source = readListKind(card);
        if (source === null) return;
        const id = card.getAttribute(
            options.idAttribute,
        );
        if (id === null) {
            throw new Error(
                'inbox-drag: card missing '
                + options.idAttribute,
            );
        }
        drag = {
            kind: 'active',
            id,
            source,
            indicator: null,
            idx: null,
            rects: null,
            startClientX: e.clientX,
            startClientY: e.clientY,
            moved: false,
            card,
            pointerId: e.pointerId,
        };
    });

    root.addEventListener('pointermove', (e) => {
        if (drag.kind !== 'active') return;
        const moved = inboxDragMoved(
            drag.moved,
            drag.startClientX,
            drag.startClientY,
            e.clientX,
            e.clientY,
        );
        if (moved && !drag.moved) {
            drag.card.setPointerCapture(
                drag.pointerId,
            );
        }
        drag = { ...drag, moved };
        if (!drag.moved) return;
        drag.card.classList.add('inbox-dragging');
        const dest = listKindAt(e.clientX, e.clientY);
        const newIdx = inboxShowsDropIndicator(dest)
            ? dropSlot(e.clientY, drag.idx)
            : null;
        const follow = !(
            drag.source === 'available'
            && dest === 'available'
        );
        drag.card.style.transform = follow
            ? followTranslate(
                drag.startClientX,
                drag.startClientY,
                e.clientX,
                e.clientY,
            )
            : '';
        paintDropTarget(dest);
        if (newIdx === null) {
            clearIndicator();
            return;
        }
        if (newIdx === drag.idx && drag.indicator) {
            return;
        }
        drag.indicator?.remove();
        const ind = buildIndicator();
        const items = claimedCards();
        const list = claimedList();
        if (!list) return;
        if (newIdx < items.length) {
            list.insertBefore(ind, items[newIdx]!);
        } else {
            list.appendChild(ind);
        }
        drag = {
            ...drag,
            indicator: ind,
            idx: newIdx,
        };
    });

    root.addEventListener('pointerup', (e) => {
        if (drag.kind !== 'active') return;
        const { id, source, card, idx, moved } = drag;
        paintDropTarget('outside');
        clearIndicator();
        card.style.transform = '';
        card.classList.remove('inbox-dragging');
        drag = { kind: 'idle' };
        if (!moved) return;
        suppressClick = true;
        const dest = listKindAt(e.clientX, e.clientY);
        const transfer = transferOf(
            source, dest, e.clientY, idx,
        );
        options.onDrop(id, transfer);
    });

    root.addEventListener('pointercancel', () => {
        if (drag.kind !== 'active') return;
        const card = drag.card;
        paintDropTarget('outside');
        clearIndicator();
        card.style.transform = '';
        card.classList.remove('inbox-dragging');
        drag = { kind: 'idle' };
    });
}
