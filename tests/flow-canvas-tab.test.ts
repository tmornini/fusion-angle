import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nextCanvasTabIndex } from
    '../web-app/app/flow-interactions.ts';

test(
    'Tab from the last canvas item wraps to the first',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, 3, false),
            0,
        );
    },
);

test(
    'Shift+Tab from the first canvas item wraps'
    + ' to the last',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, 0, true),
            3,
        );
    },
);

test(
    'Tab walks forward inside the ring',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, 1, false),
            2,
        );
    },
);

test(
    'Shift+Tab walks backward inside the ring',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, 2, true),
            1,
        );
    },
);

test(
    'a lone canvas item Tab-wraps onto itself',
    () => {
        assert.equal(
            nextCanvasTabIndex(1, 0, false),
            0,
        );
        assert.equal(
            nextCanvasTabIndex(1, 0, true),
            0,
        );
    },
);

test(
    'Tab from the canvas SVG enters the first'
    + ' item',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, -1, false),
            0,
        );
        assert.equal(
            nextCanvasTabIndex(1, -1, false),
            0,
        );
    },
);

test(
    'Shift+Tab from the canvas SVG enters the'
    + ' last item',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, -1, true),
            3,
        );
        assert.equal(
            nextCanvasTabIndex(1, -1, true),
            0,
        );
    },
);

test(
    'Tab outside the canvas ring is a no-op',
    () => {
        assert.equal(
            nextCanvasTabIndex(0, 0, false),
            null,
        );
        assert.equal(
            nextCanvasTabIndex(0, -1, false),
            null,
        );
        assert.equal(
            nextCanvasTabIndex(4, 4, false),
            null,
        );
    },
);
