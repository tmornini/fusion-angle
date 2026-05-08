import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    zoomToFit,
} from '../web-app/app/flow-interactions.ts';
import {
    NODE_WIDTH,
    NODE_HEIGHT,
} from '../web-app/app/flow-layout.ts';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const PANEL = 288;

test('zoomToFit returns null for empty input', () => {
    const r = zoomToFit(
        [], CANVAS_W, CANVAS_H, 0,
    );
    assert.equal(r, null);
});

test(
    'zoomToFit with panelOffsetPx=0 reproduces'
    + ' today\'s full-canvas centered fit',
    () => {
        const positions = [
            { x: -200, y: -100 },
            { x: 200, y: 100 },
        ];
        const r = zoomToFit(
            positions, CANVAS_W, CANVAS_H, 0,
        );
        assert.ok(r);
        const cx =
            ((-200) + (200 + NODE_WIDTH)) / 2;
        const cy =
            ((-100) + (100 + NODE_HEIGHT)) / 2;
        const vb = r.viewBox;
        assert.ok(
            Math.abs((vb.x + vb.w / 2) - cx)
                < 0.001,
        );
        assert.ok(
            Math.abs((vb.y + vb.h / 2) - cy)
                < 0.001,
        );
        assert.ok(
            Math.abs(
                vb.w / vb.h
                - CANVAS_W / CANVAS_H,
            ) < 0.001,
        );
    },
);

test(
    'zoomToFit with panel offset centers content'
    + ' in the right visible region (panel is'
    + ' on the left)',
    () => {
        const positions = [
            { x: -300, y: -200 },
            { x: 300, y: 200 },
        ];
        const r = zoomToFit(
            positions, CANVAS_W, CANVAS_H, PANEL,
        );
        assert.ok(r);
        const cx =
            ((-300) + (300 + NODE_WIDTH)) / 2;
        const vb = r.viewBox;
        const pixelXOfContentCenter =
            (cx - vb.x) * CANVAS_W / vb.w;
        assert.ok(
            Math.abs(
                pixelXOfContentCenter
                - (CANVAS_W + PANEL) / 2,
            ) < 0.5,
        );
    },
);

test(
    'zoomToFit with panel offset preserves'
    + ' canvas aspect ratio in viewBox',
    () => {
        const positions = [
            { x: 0, y: 0 },
            { x: 500, y: 100 },
        ];
        const r = zoomToFit(
            positions, CANVAS_W, CANVAS_H, PANEL,
        );
        assert.ok(r);
        const vb = r.viewBox;
        assert.ok(
            Math.abs(
                vb.w / vb.h
                - CANVAS_W / CANVAS_H,
            ) < 0.001,
        );
    },
);

test(
    'zoomToFit with panel offset fits content'
    + ' in effectiveW pixels (width-bound)',
    () => {
        const positions = [
            { x: -400, y: -50 },
            { x: 400, y: 50 },
        ];
        const r = zoomToFit(
            positions, CANVAS_W, CANVAS_H, PANEL,
        );
        assert.ok(r);
        const vb = r.viewBox;
        const effectiveW = CANVAS_W - PANEL;
        const contentW =
            (400 + NODE_WIDTH) - (-400);
        const padded =
            contentW + 70 * 2;
        const contentPixelW =
            padded * CANVAS_W / vb.w;
        assert.ok(
            Math.abs(contentPixelW - effectiveW)
                < 0.5,
            'content width-bound: should fill'
            + ' effectiveW pixels exactly',
        );
    },
);

test(
    'zoomToFit clamps zoom to MAX_ZOOM for'
    + ' tiny content with panel offset',
    () => {
        const positions = [
            { x: 0, y: 0 },
        ];
        const r = zoomToFit(
            positions, CANVAS_W, CANVAS_H, PANEL,
        );
        assert.ok(r);
        assert.ok(r.zoom <= 2.0 + 0.001);
    },
);

test(
    'zoomToFit panel offset shifts content'
    + ' pixel position from full-canvas center'
    + ' to right-visible center (panel on left)',
    () => {
        const positions = [
            { x: -100, y: -100 },
            { x: 100, y: 100 },
        ];
        const r0 = zoomToFit(
            positions, CANVAS_W, CANVAS_H, 0,
        );
        const r1 = zoomToFit(
            positions, CANVAS_W, CANVAS_H, PANEL,
        );
        assert.ok(r0);
        assert.ok(r1);
        const cx =
            ((-100) + (100 + NODE_WIDTH)) / 2;
        const pixelX0 =
            (cx - r0.viewBox.x)
                * CANVAS_W / r0.viewBox.w;
        const pixelX1 =
            (cx - r1.viewBox.x)
                * CANVAS_W / r1.viewBox.w;
        assert.ok(
            Math.abs(pixelX0 - CANVAS_W / 2)
                < 0.5,
        );
        assert.ok(
            Math.abs(
                pixelX1 - (CANVAS_W + PANEL) / 2,
            ) < 0.5,
        );
        assert.ok(pixelX1 > pixelX0);
    },
);
