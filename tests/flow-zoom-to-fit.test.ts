import { assert, assertStrictEquals } from '@std/assert';
import {
    buildInteractionState,
    fitBoxToCanvas,
    nodeBoundsBox,
    zoomIn,
    zoomOut,
} from '../web-app/app/flow-interactions.ts';
import {
    NODE_WIDTH,
    NODE_HEIGHT,
} from '../web-app/app/flow-layout.ts';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const PANEL = 288;

Deno.test('nodeBoundsBox returns null for empty input', () => {
    assertStrictEquals(nodeBoundsBox([]), null);
});

Deno.test(
    'nodeBoundsBox spans every node rectangle'
    + ' (position to position + node size)',
    () => {
        const box = nodeBoundsBox([
            { x: -200, y: -100 },
            { x: 200, y: 100 },
        ]);
        assert(box);
        assertStrictEquals(box.minX, -200);
        assertStrictEquals(box.minY, -100);
        assertStrictEquals(box.maxX, 200 + NODE_WIDTH);
        assertStrictEquals(box.maxY, 100 + NODE_HEIGHT);
    },
);

Deno.test(
    'fitBoxToCanvas with panelOffsetPx=0 reproduces'
    + ' today\'s full-canvas centered fit',
    () => {
        const box = nodeBoundsBox([
            { x: -200, y: -100 },
            { x: 200, y: 100 },
        ])!;
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, 0,
        );
        assert(r);
        const cx =
            ((-200) + (200 + NODE_WIDTH)) / 2;
        const cy =
            ((-100) + (100 + NODE_HEIGHT)) / 2;
        const vb = r.viewBox;
        assert(
            Math.abs((vb.x + vb.w / 2) - cx)
                < 0.001,
        );
        assert(
            Math.abs((vb.y + vb.h / 2) - cy)
                < 0.001,
        );
        assert(
            Math.abs(
                vb.w / vb.h
                - CANVAS_W / CANVAS_H,
            ) < 0.001,
        );
    },
);

Deno.test(
    'fitBoxToCanvas with panel offset centers content'
    + ' in the right visible region (panel is'
    + ' on the left)',
    () => {
        const box = nodeBoundsBox([
            { x: -300, y: -200 },
            { x: 300, y: 200 },
        ])!;
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r);
        const cx =
            ((-300) + (300 + NODE_WIDTH)) / 2;
        const vb = r.viewBox;
        const pixelXOfContentCenter =
            (cx - vb.x) * CANVAS_W / vb.w;
        assert(
            Math.abs(
                pixelXOfContentCenter
                - (CANVAS_W + PANEL) / 2,
            ) < 0.5,
        );
    },
);

Deno.test(
    'fitBoxToCanvas with panel offset preserves'
    + ' canvas aspect ratio in viewBox',
    () => {
        const box = nodeBoundsBox([
            { x: 0, y: 0 },
            { x: 500, y: 100 },
        ])!;
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r);
        const vb = r.viewBox;
        assert(
            Math.abs(
                vb.w / vb.h
                - CANVAS_W / CANVAS_H,
            ) < 0.001,
        );
    },
);

Deno.test(
    'fitBoxToCanvas with panel offset fits content'
    + ' in effectiveW pixels (width-bound)',
    () => {
        const box = nodeBoundsBox([
            { x: -400, y: -50 },
            { x: 400, y: 50 },
        ])!;
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r);
        const vb = r.viewBox;
        const effectiveW = CANVAS_W - PANEL;
        const contentW =
            (400 + NODE_WIDTH) - (-400);
        const padded =
            contentW + 70 * 2;
        const contentPixelW =
            padded * CANVAS_W / vb.w;
        assert(
            Math.abs(contentPixelW - effectiveW)
                < 0.5,
            'content width-bound: should fill'
            + ' effectiveW pixels exactly',
        );
    },
);

Deno.test(
    'fitBoxToCanvas clamps zoom to MAX_ZOOM for'
    + ' tiny content with panel offset',
    () => {
        const box = nodeBoundsBox([
            { x: 0, y: 0 },
        ])!;
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r);
        assert(r.zoom <= 2.0 + 0.001);
    },
);

Deno.test(
    'fitBoxToCanvas clamps zoom to MIN_ZOOM for'
    + ' a huge box',
    () => {
        const box = {
            minX: 0,
            minY: 0,
            maxX: 20000,
            maxY: 20000,
        };
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, 0,
        );
        assert(
            Math.abs(r.zoom - 0.25) < 1e-9,
            'zoom lands on MIN_ZOOM',
        );
        assertStrictEquals(
            r.viewBox.w, CANVAS_W / 0.25,
        );
        assertStrictEquals(
            r.viewBox.h, CANVAS_H / 0.25,
        );
        assert(
            Math.abs(
                r.viewBox.x + r.viewBox.w / 2
                - (box.minX + box.maxX) / 2,
            ) < 0.001,
            'viewBox centers on the box (x)',
        );
        assert(
            Math.abs(
                r.viewBox.y + r.viewBox.h / 2
                - (box.minY + box.maxY) / 2,
            ) < 0.001,
            'viewBox centers on the box (y)',
        );
    },
);

Deno.test(
    'fitBoxToCanvas clamps zoom to MIN_ZOOM for'
    + ' a huge box with panel offset',
    () => {
        const box = {
            minX: 0,
            minY: 0,
            maxX: 20000,
            maxY: 20000,
        };
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(
            Math.abs(r.zoom - 0.25) < 1e-9,
            'zoom lands on MIN_ZOOM',
        );
        assertStrictEquals(
            r.viewBox.w, CANVAS_W / 0.25,
        );
        const cx = (box.minX + box.maxX) / 2;
        const pixelXOfBoxCenter =
            (cx - r.viewBox.x) * CANVAS_W / r.viewBox.w;
        assert(
            Math.abs(
                pixelXOfBoxCenter
                - (CANVAS_W + PANEL) / 2,
            ) < 0.5,
            'box center sits mid visible region',
        );
    },
);

// Oct 3 walk (F29): Auto Fit off, a fit just under
// MIN_ZOOM. Zoom in, then out, must restore it.
Deno.test(
    'a fit just under MIN_ZOOM restores after'
    + ' zoom in and out',
    () => {
        const wrapW = 910;
        const wrapH = 549;
        const box = {
            minX: 0,
            minY: 0,
            maxX: 2000,
            maxY: 2060,
        };
        const fit = fitBoxToCanvas(
            box, wrapW, wrapH, 0,
        );
        const vb = fit.viewBox;
        assert(
            vb.y <= box.minY,
            'fit covers box top',
        );
        assert(
            vb.y + vb.h >= box.maxY,
            'fit covers box bottom',
        );
        assert(
            vb.x <= box.minX,
            'fit covers box left',
        );
        assert(
            vb.x + vb.w >= box.maxX,
            'fit covers box right',
        );
        const fitted = {
            ...buildInteractionState(vb.w, vb.h),
            zoom: fit.zoom,
            viewBox: { ...vb },
        };
        const zoomedIn = zoomIn(fitted);
        assert(
            zoomedIn.viewBox.w < vb.w
                && zoomedIn.viewBox.h < vb.h,
            'zoom in shrinks the camera',
        );
        const restored = zoomOut(zoomedIn);
        assert(
            Math.abs(restored.viewBox.w - vb.w)
                < 1e-9,
            'zoom out restores the fitted width',
        );
        assert(
            Math.abs(restored.viewBox.h - vb.h)
                < 1e-9,
            'zoom out restores the fitted height',
        );
        assert(
            Math.abs(restored.zoom - fit.zoom) < 1e-9,
            'zoom out restores the fitted zoom',
        );
        assert(
            Math.abs(fit.zoom - 0.25) < 1e-9,
            'fit lands on MIN_ZOOM',
        );
    },
);

Deno.test(
    'fitBoxToCanvas panel offset shifts content'
    + ' pixel position from full-canvas center'
    + ' to right-visible center (panel on left)',
    () => {
        const box = nodeBoundsBox([
            { x: -100, y: -100 },
            { x: 100, y: 100 },
        ])!;
        const r0 = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, 0,
        );
        const r1 = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r0);
        assert(r1);
        const cx =
            ((-100) + (100 + NODE_WIDTH)) / 2;
        const pixelX0 =
            (cx - r0.viewBox.x)
                * CANVAS_W / r0.viewBox.w;
        const pixelX1 =
            (cx - r1.viewBox.x)
                * CANVAS_W / r1.viewBox.w;
        assert(
            Math.abs(pixelX0 - CANVAS_W / 2)
                < 0.5,
        );
        assert(
            Math.abs(
                pixelX1 - (CANVAS_W + PANEL) / 2,
            ) < 0.5,
        );
        assert(pixelX1 > pixelX0);
    },
);

// The fix's contract: the fitted viewBox contains
// the ENTIRE box it is given, even when that box
// extends far past where nodes sit — i.e. when the
// box carries edge/waypoint geometry that bows
// below the lowest node. This is the property the
// getBBox-measured bounds rely on.
Deno.test(
    'fitBoxToCanvas viewBox contains a box that'
    + ' extends far beyond the node cluster',
    () => {
        const box = {
            minX: 0,
            minY: 0,
            maxX: 400,
            maxY: 900,
        };
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, 0,
        );
        assert(r);
        const vb = r.viewBox;
        assert(
            vb.y <= box.minY + 0.001,
            'viewBox top covers box top',
        );
        assert(
            vb.y + vb.h >= box.maxY - 0.001,
            'viewBox bottom covers the low dip',
        );
        assert(
            vb.x <= box.minX + 0.001,
            'viewBox left covers box left',
        );
        assert(
            vb.x + vb.w >= box.maxX - 0.001,
            'viewBox right covers box right',
        );
    },
);
