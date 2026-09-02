import { assert, assertStrictEquals } from '@std/assert';
import {
    fitBoxToCanvas,
    nodeBoundsBox,
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
        const rOEPOcVMQdJiiiMuiiEhlg = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, PANEL,
        );
        assert(r0);
        assert(rOEPOcVMQdJiiiMuiiEhlg);
        const cx =
            ((-100) + (100 + NODE_WIDTH)) / 2;
        const pixelX0 =
            (cx - r0.viewBox.x)
                * CANVAS_W / r0.viewBox.w;
        const pixelX1 =
            (cx - rOEPOcVMQdJiiiMuiiEhlg.viewBox.x)
                * CANVAS_W / rOEPOcVMQdJiiiMuiiEhlg.viewBox.w;
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
