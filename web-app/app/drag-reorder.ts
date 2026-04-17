const INDICATOR_HEIGHT = 3;
const INDICATOR_COLOR =
    'hsl(var(--primary))';
const DRAGGING_OPACITY = '0.4';
const FIRST_POSITION = 1;
const POSITION_GAP = 1;
const HYSTERESIS_PX = 8;

type DragState =
    | { kind: 'idle' }
    | {
        kind: 'active';
        id: string;
        indicator: HTMLElement | null;
        idx: number | null;
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
    let pointerTarget: Element | null =
        null;

    function cards(): HTMLElement[] {
        return [
            ...container
                .querySelectorAll<
                    HTMLElement
                >(cardSelector),
        ];
    }

    function buildIndicator():
        HTMLElement {
        const el =
            document.createElement('div');
        el.style.height =
            INDICATOR_HEIGHT + 'px';
        el.style.background =
            INDICATOR_COLOR;
        el.style.borderRadius = '2px';
        el.style.margin = '2px 0';
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
        };
    }

    function dropIndex(
        y: number,
        lastIdx: number | null,
    ): number {
        const items = cards();
        for (
            let i = 0; i < items.length; i++
        ) {
            const rect =
                items[i]!
                    .getBoundingClientRect();
            const mid =
                rect.top + rect.height / 2;
            let boundary = mid;
            if (lastIdx === i) {
                boundary =
                    mid + HYSTERESIS_PX;
            } else if (lastIdx === i + 1) {
                boundary =
                    mid - HYSTERESIS_PX;
            }
            if (y < boundary) return i;
        }
        return items.length;
    }

    container.addEventListener(
        'pointerdown',
        (e) => {
            pointerTarget =
                e.target as Element;
        },
    );

    container.addEventListener(
        'dragstart',
        (e) => {
            const card =
                (e.target as Element)
                    .closest<HTMLElement>(
                        cardSelector,
                    );
            if (!card) return;
            const handle =
                pointerTarget?.closest(
                    '.cursor-grab',
                );
            if (!handle) {
                e.preventDefault();
                return;
            }
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
            drag = {
                kind: 'active',
                id,
                indicator: null,
                idx: null,
            };
            card.style.opacity =
                DRAGGING_OPACITY;
            e.dataTransfer!.effectAllowed =
                'move';
        },
    );

    container.addEventListener(
        'dragover',
        (e) => {
            if (drag.kind !== 'active')
                return;
            e.preventDefault();
            e.dataTransfer!.dropEffect =
                'move';
            const newIdx = dropIndex(
                e.clientY,
                drag.idx,
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
            };
        },
    );

    container.addEventListener(
        'dragleave',
        (e) => {
            if (
                !container.contains(
                    e.relatedTarget
                    instanceof Node
                        ? e.relatedTarget
                        : null,
                )
            ) {
                clearIndicator();
            }
        },
    );

    container.addEventListener(
        'drop',
        (e) => {
            e.preventDefault();
            if (drag.kind !== 'active')
                return;
            const draggedId = drag.id;
            const committedIdx =
                drag.idx ?? dropIndex(
                    e.clientY, null,
                );
            clearIndicator();
            drag = { kind: 'idle' };
            const items = cards();
            const idx = committedIdx;
            const positions = items.map(
                c => {
                    const raw =
                        c.getAttribute(
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
                },
            );
            let newPos: number;
            if (items.length === 0) {
                newPos = FIRST_POSITION;
            } else if (idx === 0) {
                newPos = positions[0]!
                    - POSITION_GAP;
            } else if (
                idx >= items.length
            ) {
                newPos =
                    positions[
                        positions.length - 1
                    ]! + POSITION_GAP;
            } else {
                newPos = (
                    positions[idx - 1]!
                    + positions[idx]!
                ) / 2;
            }
            for (const c of items) {
                c.style.opacity = '';
            }
            onReorder(draggedId, newPos);
        },
    );

    container.addEventListener(
        'dragend',
        () => {
            clearIndicator();
            drag = { kind: 'idle' };
            for (const c of cards()) {
                c.style.opacity = '';
            }
        },
    );

    function setDraggable(): void {
        for (const c of cards()) {
            c.setAttribute(
                'draggable', 'true',
            );
        }
    }

    setDraggable();

    const observer =
        new MutationObserver(
            setDraggable,
        );
    observer.observe(
        container,
        { childList: true },
    );
}
