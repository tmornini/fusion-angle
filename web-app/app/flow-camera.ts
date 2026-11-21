import type { ViewBox } from './flow-interactions.ts';

// The flow canvas camera: a zoom and the viewBox it
// shows. One arithmetic for the zoom range and step, the
// button zoom, the wheel zoom, the pan, the point map,
// and the keep-center resize, so every canvas that moves
// a camera agrees on step, range, and focal point. Pure:
// each function returns a new value and mutates nothing.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.0;
export const ZOOM_STEP = 0.1;

export type ZoomDirection = 'in' | 'out';

export interface Camera {
    readonly zoom: number;
    readonly viewBox: ViewBox;
}

interface Point {
    readonly x: number;
    readonly y: number;
}

// A canvas viewport in client pixels.
export interface CanvasRect {
    readonly left: number;
    readonly top: number;
    readonly w: number;
    readonly h: number;
}

// A scroll down (a positive delta) zooms out. Any other
// delta zooms in, zero included.
export function wheelZoomDirection(
    deltaY: number,
): ZoomDirection {
    return deltaY > 0 ? 'out' : 'in';
}

// One step from a zoom, held inside the range.
function steppedZoom(
    zoom: number,
    direction: ZoomDirection,
): number {
    const delta = direction === 'out'
        ? -ZOOM_STEP
        : ZOOM_STEP;
    return Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoom + delta),
    );
}

// The zoom buttons' step. The view rescales and
// recenters on the focal point, or about its own center
// where there is none.
export function cameraZoomedToward(
    camera: Camera,
    direction: ZoomDirection,
    focal: Point | null,
): Camera {
    const viewBox = camera.viewBox;
    const prevCx = viewBox.x + viewBox.w / 2;
    const prevCy = viewBox.y + viewBox.h / 2;
    const prevZoom = camera.zoom;
    const nextZoom = steppedZoom(prevZoom, direction);
    const ratio = prevZoom / nextZoom;
    const nextW = viewBox.w * ratio;
    const nextH = viewBox.h * ratio;
    const center = focal ?? { x: prevCx, y: prevCy };
    return {
        zoom: nextZoom,
        viewBox: {
            x: center.x - nextW / 2,
            y: center.y - nextH / 2,
            w: nextW,
            h: nextH,
        },
    };
}

// The wheel's step. The view rescales about the anchor,
// so the point under the pointer stays under it.
export function cameraZoomedAt(
    camera: Camera,
    direction: ZoomDirection,
    anchor: Point,
): Camera {
    const viewBox = camera.viewBox;
    const prevZoom = camera.zoom;
    const nextZoom = steppedZoom(prevZoom, direction);
    const ratio = prevZoom / nextZoom;
    const nextW = viewBox.w * ratio;
    const nextH = viewBox.h * ratio;
    const nextX =
        anchor.x - (anchor.x - viewBox.x) * ratio;
    const nextY =
        anchor.y - (anchor.y - viewBox.y) * ratio;
    return {
        zoom: nextZoom,
        viewBox: {
            x: nextX, y: nextY,
            w: nextW, h: nextH,
        },
    };
}

// A drag of dxPx by dyPx screen pixels across a canvas
// drawn rect.w by rect.h pixels. The view moves against
// the drag, each axis scaled from pixels to user units.
export function viewBoxPannedBy(
    viewBox: ViewBox,
    dxPx: number,
    dyPx: number,
    rect: { readonly w: number; readonly h: number },
): ViewBox {
    const scaleX = viewBox.w / rect.w;
    const scaleY = viewBox.h / rect.h;
    return {
        ...viewBox,
        x: viewBox.x - dxPx * scaleX,
        y: viewBox.y - dyPx * scaleY,
    };
}

// The user-space point under a client point. Exact
// when the viewBox shares the canvas's aspect, so
// the rect is the viewport and each axis scales
// from pixels to user units. It reads the viewBox
// it is given, so a viewBox that moves mid-gesture
// stays true where a cached screen CTM would not.
export function viewBoxPointAt(
    viewBox: ViewBox,
    rect: CanvasRect,
    clientX: number,
    clientY: number,
): Point {
    return {
        x: viewBox.x + (clientX - rect.left)
            * (viewBox.w / rect.w),
        y: viewBox.y + (clientY - rect.top)
            * (viewBox.h / rect.h),
    };
}

// A canvas resized to w by h pixels at an unchanged
// zoom. The view takes the new size about its own
// center.
export function viewBoxResized(
    viewBox: ViewBox,
    zoom: number,
    w: number,
    h: number,
): ViewBox {
    const centerX = viewBox.x + viewBox.w / 2;
    const centerY = viewBox.y + viewBox.h / 2;
    const nextW = w / zoom;
    const nextH = h / zoom;
    return {
        x: centerX - nextW / 2,
        y: centerY - nextH / 2,
        w: nextW,
        h: nextH,
    };
}
