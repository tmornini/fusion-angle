const INDICATOR_HEIGHT = 3;
const INDICATOR_COLOR =
    'hsl(var(--primary))';
const DRAGGING_OPACITY = '0.4';

export function initDragReorder(
    container: HTMLElement,
    cardSelector: string,
    idAttribute: string,
    onReorder: (
        id: string,
        newPosition: number,
    ) => void,
): void {
    let dragId: string | null = null;
    let indicator: HTMLElement | null =
        null;
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

    function createIndicator():
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

    function removeIndicator(): void {
        indicator?.remove();
        indicator = null;
    }

    function dropIndex(
        y: number,
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
            if (y < mid) return i;
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
                    '[style*="grab"]',
                );
            if (!handle) {
                e.preventDefault();
                return;
            }
            dragId = card.getAttribute(
                idAttribute,
            );
            card.style.opacity =
                DRAGGING_OPACITY;
            e.dataTransfer!.effectAllowed =
                'move';
        },
    );

    container.addEventListener(
        'dragover',
        (e) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer!.dropEffect =
                'move';
            removeIndicator();
            const idx = dropIndex(
                e.clientY,
            );
            indicator = createIndicator();
            const items = cards();
            if (idx < items.length) {
                container.insertBefore(
                    indicator,
                    items[idx]!,
                );
            } else {
                container.appendChild(
                    indicator,
                );
            }
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
                removeIndicator();
            }
        },
    );

    container.addEventListener(
        'drop',
        (e) => {
            e.preventDefault();
            if (!dragId) return;
            removeIndicator();
            const items = cards();
            const idx = dropIndex(
                e.clientY,
            );
            const positions = items.map(
                c => parseFloat(
                    c.getAttribute(
                        'data-position',
                    ) ?? '0',
                ),
            );
            let newPos: number;
            if (items.length === 0) {
                newPos = 1;
            } else if (idx === 0) {
                newPos = positions[0]! - 1;
            } else if (
                idx >= items.length
            ) {
                newPos =
                    positions[
                        positions.length - 1
                    ]! + 1;
            } else {
                newPos = (
                    positions[idx - 1]!
                    + positions[idx]!
                ) / 2;
            }
            const id = dragId;
            dragId = null;
            for (const c of items) {
                c.style.opacity = '';
            }
            onReorder(id, newPos);
        },
    );

    container.addEventListener(
        'dragend',
        () => {
            removeIndicator();
            dragId = null;
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
