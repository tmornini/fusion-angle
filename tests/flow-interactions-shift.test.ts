import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pointerIsShift } from
    '../web-app/app/flow-interactions.ts';

test(
    'pointerIsShift is true when the window'
    + ' tracks Shift even if the pointer event'
    + ' reports false',
    () => {
        assert.equal(
            pointerIsShift(true, false),
            true,
        );
    },
);

test(
    'pointerIsShift is true when the pointer'
    + ' event reports Shift',
    () => {
        assert.equal(
            pointerIsShift(false, true),
            true,
        );
        assert.equal(
            pointerIsShift(true, true),
            true,
        );
    },
);

test(
    'pointerIsShift is false when neither'
    + ' source is Shift',
    () => {
        assert.equal(
            pointerIsShift(false, false),
            false,
        );
    },
);
