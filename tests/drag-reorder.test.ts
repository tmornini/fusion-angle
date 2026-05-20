import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    computeNewPosition,
    dropIndex,
    FIRST_POSITION,
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

test(
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
        assert.equal(
            dropIndex(60, null, items), 1,
        );
    },
);

test(
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
        assert.equal(
            dropIndex(55, 0, items), 0,
        );
    },
);

test(
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
        assert.equal(
            dropIndex(45, 1, items), 1,
        );
    },
);

test(
    'computeNewPosition returns FIRST_POSITION'
    + ' on empty list',
    () => {
        assert.equal(
            computeNewPosition([], 0), FIRST_POSITION,
        );
    },
);

test(
    'computeNewPosition prepends with negative'
    + ' gap when idx is 0',
    () => {
        assert.equal(
            computeNewPosition([5, 10, 15], 0),
            4,
        );
    },
);

test(
    'computeNewPosition appends with positive'
    + ' gap when idx >= length',
    () => {
        assert.equal(
            computeNewPosition([5, 10, 15], 3),
            16,
        );
    },
);

test(
    'computeNewPosition inserts midway between'
    + ' neighbors',
    () => {
        assert.equal(
            computeNewPosition([5, 10, 15], 1),
            7.5,
        );
    },
);

test(
    'computeNewPosition inserts midway between'
    + ' neighbors at end',
    () => {
        assert.equal(
            computeNewPosition([5, 10, 15], 2),
            12.5,
        );
    },
);

test(
    'positionBetween returns the midpoint of two'
    + ' integer positions',
    () => {
        assert.equal(positionBetween(5, 10), 7.5);
    },
);

test(
    'positionBetween wedges between adjacent'
    + ' fractional positions',
    () => {
        assert.equal(positionBetween(7, 7.5), 7.25);
    },
);

test(
    'positionBetween handles a negative-anchor'
    + ' prepend chain',
    () => {
        assert.equal(positionBetween(-1, 1), 0);
    },
);

test(
    'nextPosition returns FIRST_POSITION on'
    + ' empty list',
    () => {
        assert.equal(nextPosition([]), FIRST_POSITION);
    },
);

test(
    'nextPosition appends one POSITION_GAP past'
    + ' the last integer entry',
    () => {
        assert.equal(nextPosition([5, 10, 15]), 16);
    },
);

test(
    'nextPosition preserves fractional baseline'
    + ' when appending',
    () => {
        assert.equal(nextPosition([7.5]), 8.5);
    },
);
