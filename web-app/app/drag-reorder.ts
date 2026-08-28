import { $$, createElement } from './dom.ts';
import {
    computeNewPosition,
    dropIndex as computeDropIndex,
    followTranslateY,
} from './drag-reorder-positions.ts';

const INDICATOR_HEIGHT = 3;
const INDICATOR_COLOR =
    'hsl(var(--primary))';
const INDICATOR_BORDER_RADIUS = '2px';
const INDICATOR_MARGIN = '2px 0';
const DRAGGING_OPACITY = '0.4';
const DRAG_HANDLE_SELECTOR = '.drag-handle';

type CardRect = {
    readonly top: number;
    readonly height: number;
};

type DragState =
    | { kind: 'idle' }
    | {
        kind: 'active';
        id: string;
        indicator: HTMLElement | null;
        idx: number | null;
        // Layout snapshot for the active drag.
        // Measured once (not per pointermove) so
        // getBoundingClientRect stays off the
        // hot path after the first read.
        rects: readonly CardRect[] | null;
        startClientY: number;
        card: HTMLElement;
    };

export function initDragReorder(
    container: HTMLElement,
    cardSelector: string,
    idAttribute: string,
    onReorder: (
        id: string,
        newPosition: number,
    ) => void,
): void {
    let drag: DragState =
        { kind: 'idle' };

    function cards(): HTMLElement[] {
        return $$(cardSelector, container);
    }

    function buildIndicator():
        HTMLElement {
        const el = createElement('div');
        el.style.height =
            INDICATOR_HEIGHT + 'px';
        el.style.background =
            INDICATOR_COLOR;
        el.style.borderRadius =
            INDICATOR_BORDER_RADIUS;
        el.style.margin = INDICATOR_MARGIN;
        el.style.pointerEvents = 'none';
        return el;
    }

    function clearIndicator(): void {
        if (drag.kind !== 'active') return;
        drag.indicator?.remove();
        drag = {
            kind: 'active',
            id: drag.id,
            indicator: null,
            idx: null,
            rects: drag.rects,
            startClientY: drag.startClientY,
            card: drag.card,
        };
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
                    'drag-reorder:'
                    + ' card missing'
                    + ' data-position',
                );
            }
            return parseFloat(raw);
        });
    }

    // Layout cache (Task 20 / Commandment XII):
    // pointermove fires many times per gesture;
    // re-reading every card's
    // getBoundingClientRect on each event forced
    // a sync layout pass per event (O(cards)
    // forced reflow). Measure once at the first
    // dropIndex during the active drag; reuse
    // until idle. Indicator insertion shifts
    // later cards by ~7px — original list
    // geometry is the intentional drop-target
    // space (re-measuring after insert would
    // chase the indicator).
    function dropIndex(
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
            rects = cards().map((c) => {
                const r =
                    c.getBoundingClientRect();
                return {
                    top: r.top,
                    height: r.height,
                };
            });
            if (drag.kind === 'active') {
                drag = {
                    kind: 'active',
                    id: drag.id,
                    indicator: drag.indicator,
                    idx: drag.idx,
                    rects,
                    startClientY: drag.startClientY,
                    card: drag.card,
                };
            }
        }
        return computeDropIndex(
            y, lastIdx, rects,
        );
    }

    container.addEventListener(
        'pointerdown',
        (e) => {
            if (e.button !== 0) return;
            const handle =
                (e.target as Element)
                    .closest(
                        DRAG_HANDLE_SELECTOR,
                    );
            if (!handle) return;
            const card = handle
                .closest<HTMLElement>(
                    cardSelector,
                );
            if (!card) return;
            const id = card.getAttribute(
                idAttribute,
            );
            if (id === null) {
                throw new Error(
                    'drag-reorder: card'
                    + ' missing '
                    + idAttribute
                    + ' attribute',
                );
            }
            e.preventDefault();
            card.setPointerCapture(
                e.pointerId,
            );
            drag = {
                kind: 'active',
                id,
                indicator: null,
                idx: null,
                rects: null,
                startClientY: e.clientY,
                card,
            };
            card.style.opacity =
                DRAGGING_OPACITY;
        },
    );

    container.addEventListener(
        'pointermove',
        (e) => {
            if (drag.kind !== 'active')
                return;
            const newIdx = dropIndex(
                e.clientY,
                drag.idx,
            );
            drag.card.style.transform =
                followTranslateY(
                    drag.startClientY,
                    e.clientY,
                );
            if (
                newIdx === drag.idx
                && drag.indicator
            ) {
                return;
            }
            drag.indicator?.remove();
            const ind = buildIndicator();
            const items = cards();
            if (newIdx < items.length) {
                container.insertBefore(
                    ind,
                    items[newIdx]!,
                );
            } else {
                container.appendChild(ind);
            }
            drag = {
                kind: 'active',
                id: drag.id,
                indicator: ind,
                idx: newIdx,
                rects: drag.rects,
                startClientY: drag.startClientY,
                card: drag.card,
            };
        },
    );

    container.addEventListener(
        'pointerup',
        (e) => {
            if (drag.kind !== 'active')
                return;
            const draggedId = drag.id;
            const committedIdx =
                drag.idx ?? dropIndex(
                    e.clientY, null,
                );
            const card = drag.card;
            clearIndicator();
            card.style.transform = '';
            drag = { kind: 'idle' };
            const items = cards();
            const newPos = computeNewPosition(
                positionsOf(items),
                committedIdx,
            );
            for (const c of items) {
                c.style.opacity = '';
            }
            onReorder(draggedId, newPos);
        },
    );

    container.addEventListener(
        'pointercancel',
        () => {
            if (drag.kind !== 'active')
                return;
            const card = drag.card;
            clearIndicator();
            card.style.transform = '';
            drag = { kind: 'idle' };
            for (const c of cards()) {
                c.style.opacity = '';
            }
        },
    );

    // The keyboard path: arrow keys on a
    // focused handle move its card one slot
    // and announce the landing place.
    const live = createElement('div');
    live.className = 'sr-only';
    live.setAttribute(
        'aria-live', 'polite',
    );
    container.insertAdjacentElement(
        'afterend', live,
    );

    let focusId: string | null = null;

    container.addEventListener(
        'keydown',
        (e) => {
            if (
                e.key !== 'ArrowUp'
                && e.key !== 'ArrowDown'
            ) return;
            if (
                !(e.target
                    instanceof Element)
            ) return;
            const handle = e.target.closest(
                DRAG_HANDLE_SELECTOR,
            );
            if (!handle) return;
            const card = handle
                .closest<HTMLElement>(
                    cardSelector,
                );
            if (!card) return;
            e.preventDefault();
            const items = cards();
            const idx = items.indexOf(card);
            const isUp =
                e.key === 'ArrowUp';
            if (isUp && idx === 0) return;
            if (
                !isUp
                && idx === items.length - 1
            ) return;
            const id = card.getAttribute(
                idAttribute,
            );
            if (id === null) {
                throw new Error(
                    'drag-reorder: card'
                    + ' missing '
                    + idAttribute
                    + ' attribute',
                );
            }
            const newPos =
                computeNewPosition(
                    positionsOf(items),
                    isUp
                        ? idx - 1
                        : idx + 2,
                );
            focusId = id;
            live.textContent =
                'Moved to position '
                + (isUp ? idx : idx + 2)
                + ' of ' + items.length;
            onReorder(id, newPos);
        },
    );

    // The list rebuilds after a reorder
    // commits; put focus back on the moved
    // card's handle so arrow keys keep
    // working from where the user was.
    function restoreFocus(): void {
        if (focusId === null) return;
        const card = cards().find(
            c => c.getAttribute(
                idAttribute,
            ) === focusId,
        );
        if (!card) return;
        const handle = card
            .querySelector<HTMLElement>(
                DRAG_HANDLE_SELECTOR,
            );
        if (!handle) return;
        focusId = null;
        handle.focus();
    }

    const observer =
        new MutationObserver(() => {
            restoreFocus();
        });
    observer.observe(
        container,
        { childList: true },
    );
}
