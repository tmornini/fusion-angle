import { assertStrictEquals } from '@std/assert';
import { nextCanvasTabIndex } from
    '../web-app/app/flow-interactions.ts';

Deno.test(
    'Tab from the last canvas item wraps to the first',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, 3, false),
            0,
        );
    },
);

Deno.test(
    'Shift+Tab from the first canvas item wraps'
    + ' to the last',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, 0, true),
            3,
        );
    },
);

Deno.test(
    'Tab walks forward inside the ring',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, 1, false),
            2,
        );
    },
);

Deno.test(
    'Shift+Tab walks backward inside the ring',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, 2, true),
            1,
        );
    },
);

Deno.test(
    'a lone canvas item Tab-wraps onto itself',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(1, 0, false),
            0,
        );
        assertStrictEquals(
            nextCanvasTabIndex(1, 0, true),
            0,
        );
    },
);

Deno.test(
    'Tab from the canvas SVG enters the first'
    + ' item',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, -1, false),
            0,
        );
        assertStrictEquals(
            nextCanvasTabIndex(1, -1, false),
            0,
        );
    },
);

Deno.test(
    'Shift+Tab from the canvas SVG enters the'
    + ' last item',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(4, -1, true),
            3,
        );
        assertStrictEquals(
            nextCanvasTabIndex(1, -1, true),
            0,
        );
    },
);

Deno.test(
    'Tab outside the canvas ring is a no-op',
    () => {
        assertStrictEquals(
            nextCanvasTabIndex(0, 0, false),
            null,
        );
        assertStrictEquals(
            nextCanvasTabIndex(0, -1, false),
            null,
        );
        assertStrictEquals(
            nextCanvasTabIndex(4, 4, false),
            null,
        );
    },
);
