import { assertStrictEquals } from '@std/assert';
import { pointerIsShift } from
    '../web-app/app/flow-interactions.ts';

Deno.test(
    'pointerIsShift is true when the window'
    + ' tracks Shift even if the pointer event'
    + ' reports false',
    () => {
        assertStrictEquals(
            pointerIsShift(true, false),
            true,
        );
    },
);

Deno.test(
    'pointerIsShift is true when the pointer'
    + ' event reports Shift',
    () => {
        assertStrictEquals(
            pointerIsShift(false, true),
            true,
        );
        assertStrictEquals(
            pointerIsShift(true, true),
            true,
        );
    },
);

Deno.test(
    'pointerIsShift is false when neither'
    + ' source is Shift',
    () => {
        assertStrictEquals(
            pointerIsShift(false, false),
            false,
        );
    },
);
