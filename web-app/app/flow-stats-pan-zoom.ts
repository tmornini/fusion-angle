import {
    cameraZoomedAt,
    cameraZoomedToward,
    viewBoxPannedBy,
    viewBoxPointAt,
    wheelZoomDirection,
    type Camera,
    type CanvasRect,
    type ZoomDirection,
} from './flow-camera.ts';

// The stats canvas's pan and zoom, for a flow whose Auto
// Fit is off: a drag pans, the wheel zooms about the
// pointer, and the keys pan and zoom about the centre.
// Every move goes through flow-camera.ts, so the step,
// range, and focal point are the designer's. The camera
// is the page's; this module reads it and hands back the
// next one.

// A press becomes a pan once the pointer travels this
// far, so a click that wobbles still pins its state.
export const PAN_SLOP_PX = 4;
// One arrow key's pan, in screen pixels.
export const KEYBOARD_PAN_STEP_PX = 48;

// The wrap's class while a pan runs. Its paint lives in
// pages-flow-stats.css.
const PANNING_CLASS = 'flow-stats-panning';

const ARROW_PANS: Readonly<Record<string, readonly [number, number]>>
    = {
        ArrowLeft: [KEYBOARD_PAN_STEP_PX, 0],
        ArrowRight: [-KEYBOARD_PAN_STEP_PX, 0],
        ArrowUp: [0, KEYBOARD_PAN_STEP_PX],
        ArrowDown: [0, -KEYBOARD_PAN_STEP_PX],
    };

const KEY_ZOOMS: Readonly<Record<string, ZoomDirection>> = {
    '+': 'in',
    '=': 'in',
    '-': 'out',
};

// The canvas as drawn: the wrap's inside, in client
// pixels. The svg fills it, and its viewBox shares its
// aspect, so this rect is the svg's viewport.
function canvasRectOf(wrap: HTMLElement): CanvasRect {
    const rect = wrap.getBoundingClientRect();
    return {
        left: rect.left + wrap.clientLeft,
        top: rect.top + wrap.clientTop,
        w: wrap.clientWidth,
        h: wrap.clientHeight,
    };
}

// A key the keyboard gives to a text field: typing there
// must not move the canvas.
function isTextEntryFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || active instanceof HTMLSelectElement
        || (active instanceof HTMLElement
            && active.isContentEditable);
}

// Ctrl, Cmd, and Alt make a key a chord: Ctrl or Cmd
// with + or - is the browser's own zoom. Shift is not
// one, since + is a shifted key.
function isChord(e: KeyboardEvent): boolean {
    return e.ctrlKey || e.metaKey || e.altKey;
}

// A canvas that measures nothing has no pixel to pan or
// zoom by; its camera waits for a resize.
function measuresNothing(wrap: HTMLElement): boolean {
    return wrap.clientWidth <= 0 || wrap.clientHeight <= 0;
}

interface Press {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    lastX: number;
    lastY: number;
    isPanning: boolean;
}

export function bindStatsPanZoom(
    wrap: HTMLElement,
    camera: () => Camera,
    onCamera: (next: Camera) => void,
    signal: AbortSignal,
): void {
    let press: Press | null = null;
    // The screen pixels dragged since the last frame.
    let pendingDx = 0;
    let pendingDy = 0;
    let frame: number | null = null;
    // A pan's release is not a click: it neither pins
    // nor unpins a card.
    let isClickSwallowed = false;

    const panBy = (dxPx: number, dyPx: number): void => {
        if (measuresNothing(wrap)) return;
        const current = camera();
        onCamera({
            zoom: current.zoom,
            viewBox: viewBoxPannedBy(
                current.viewBox, dxPx, dyPx, canvasRectOf(wrap),
            ),
        });
    };

    const flushPan = (): void => {
        if (frame !== null) {
            cancelAnimationFrame(frame);
            frame = null;
        }
        if (pendingDx === 0 && pendingDy === 0) return;
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        panBy(dx, dy);
    };

    const endPress = (): void => {
        if (press?.isPanning === true) {
            flushPan();
            wrap.classList.remove(PANNING_CLASS);
            isClickSwallowed = true;
        }
        press = null;
    };

    wrap.addEventListener(
        'pointerdown',
        (e) => {
            isClickSwallowed = false;
            if (!e.isPrimary || e.button !== 0) return;
            press = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                isPanning: false,
            };
        },
        { signal },
    );

    // On the window, so a drag that leaves the canvas
    // keeps panning until its release.
    window.addEventListener(
        'pointermove',
        (e) => {
            if (press === null || e.pointerId !== press.pointerId) {
                return;
            }
            if (!press.isPanning) {
                const travel = Math.hypot(
                    e.clientX - press.startX,
                    e.clientY - press.startY,
                );
                if (travel < PAN_SLOP_PX) return;
                press.isPanning = true;
                wrap.classList.add(PANNING_CLASS);
            }
            pendingDx += e.clientX - press.lastX;
            pendingDy += e.clientY - press.lastY;
            press.lastX = e.clientX;
            press.lastY = e.clientY;
            if (frame === null) {
                frame = requestAnimationFrame(() => {
                    frame = null;
                    flushPan();
                });
            }
        },
        { signal },
    );

    for (const type of ['pointerup', 'pointercancel'] as const) {
        window.addEventListener(
            type,
            (e) => {
                if (
                    press === null
                    || e.pointerId !== press.pointerId
                ) return;
                endPress();
            },
            { signal },
        );
    }

    // Captured at the wrap, before the page's own click
    // handler, which pins and unpins.
    wrap.addEventListener(
        'click',
        (e) => {
            if (!isClickSwallowed) return;
            isClickSwallowed = false;
            e.stopPropagation();
        },
        { capture: true, signal },
    );

    wrap.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            const current = camera();
            onCamera(cameraZoomedAt(
                current,
                wheelZoomDirection(e.deltaY),
                viewBoxPointAt(
                    current.viewBox, canvasRectOf(wrap),
                    e.clientX, e.clientY,
                ),
            ));
        },
        { passive: false, signal },
    );

    document.addEventListener(
        'keydown',
        (e) => {
            if (isChord(e) || isTextEntryFocused()) return;
            if (measuresNothing(wrap)) return;
            const pan = ARROW_PANS[e.key];
            if (pan !== undefined) {
                e.preventDefault();
                panBy(pan[0], pan[1]);
                return;
            }
            const direction = KEY_ZOOMS[e.key];
            if (direction !== undefined) {
                e.preventDefault();
                onCamera(cameraZoomedToward(
                    camera(), direction, null,
                ));
            }
        },
        { signal },
    );

    signal.addEventListener('abort', () => {
        if (frame !== null) cancelAnimationFrame(frame);
    });
}
