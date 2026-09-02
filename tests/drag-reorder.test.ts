import { assertStrictEquals } from '@std/assert';
import {
    computeNewPosition,
    dropIndex,
    FIRST_POSITION,
    followTranslateY,
    nextPosition,
    positionBetween,
    type CardRect,
} from '../web-app/app/drag-reorder-positions.ts';

function rects(
    ...specs: readonly [number, number][]
): readonly CardRect[] {
    return specs.map(
        ([top, height]) => ({ top, height }),
    );
}

Deno.test(
    'dropIndex returns slot when cursor below'
    + ' midpoint without hysteresis',
    () => {
        const items = rects(
            [0, 100],
            [100, 100],
            [200, 100],
        );
        // cursor at 60 is past midpoint (50) of
        // first item, so the next slot (1) wins.
        assertStrictEquals(
            dropIndex(60, null, items), 1,
        );
    },
);

Deno.test(
    'dropIndex respects hysteresis when'
    + ' lastIdx === current slot',
    () => {
        const items = rects(
            [0, 100],
            [100, 100],
        );
        // midpoint of slot 0 is 50; without
        // hysteresis cursor at 55 would advance
        // to slot 1. With lastIdx=0 the boundary
        // shifts to 50 + 8 = 58, so slot 0 sticks.
        assertStrictEquals(
            dropIndex(55, 0, items), 0,
        );
    },
);

Deno.test(
    'dropIndex respects hysteresis when'
    + ' lastIdx === next slot',
    () => {
        const items = rects(
            [0, 100],
            [100, 100],
        );
        // midpoint of slot 0 is 50; without
        // hysteresis cursor at 45 stays on slot 0.
        // With lastIdx=1 the boundary shifts to
        // 50 - 8 = 42, so slot 1 holds.
        assertStrictEquals(
            dropIndex(45, 1, items), 1,
        );
    },
);

Deno.test(
    'computeNewPosition returns FIRST_POSITION'
    + ' on empty list',
    () => {
        assertStrictEquals(
            computeNewPosition([], 0), FIRST_POSITION,
        );
    },
);

Deno.test(
    'computeNewPosition prepends with negative'
    + ' gap when idx is 0',
    () => {
        assertStrictEquals(
            computeNewPosition([5, 10, 15], 0),
            4,
        );
    },
);

Deno.test(
    'computeNewPosition appends with positive'
    + ' gap when idx >= length',
    () => {
        assertStrictEquals(
            computeNewPosition([5, 10, 15], 3),
            16,
        );
    },
);

Deno.test(
    'computeNewPosition inserts midway between'
    + ' neighbors',
    () => {
        assertStrictEquals(
            computeNewPosition([5, 10, 15], 1),
            7.5,
        );
    },
);

Deno.test(
    'computeNewPosition inserts midway between'
    + ' neighbors at end',
    () => {
        assertStrictEquals(
            computeNewPosition([5, 10, 15], 2),
            12.5,
        );
    },
);

Deno.test(
    'positionBetween returns the midpoint of two'
    + ' integer positions',
    () => {
        assertStrictEquals(positionBetween(5, 10), 7.5);
    },
);

Deno.test(
    'positionBetween wedges between adjacent'
    + ' fractional positions',
    () => {
        assertStrictEquals(positionBetween(7, 7.5), 7.25);
    },
);

Deno.test(
    'positionBetween handles a negative-anchor'
    + ' prepend chain',
    () => {
        assertStrictEquals(positionBetween(-1, 1), 0);
    },
);

Deno.test(
    'nextPosition returns FIRST_POSITION on'
    + ' empty list',
    () => {
        assertStrictEquals(nextPosition([]), FIRST_POSITION);
    },
);

Deno.test(
    'nextPosition appends one POSITION_GAP past'
    + ' the last integer entry',
    () => {
        assertStrictEquals(nextPosition([5, 10, 15]), 16);
    },
);

Deno.test(
    'nextPosition preserves fractional baseline'
    + ' when appending',
    () => {
        assertStrictEquals(nextPosition([7.5]), 8.5);
    },
);

Deno.test(
    'followTranslateY writes translateY of the'
    + ' pointer delta',
    () => {
        assertStrictEquals(
            followTranslateY(100, 130),
            'translateY(30px)',
        );
        assertStrictEquals(
            followTranslateY(100, 70),
            'translateY(-30px)',
        );
        assertStrictEquals(
            followTranslateY(50, 50),
            'translateY(0px)',
        );
    },
);
