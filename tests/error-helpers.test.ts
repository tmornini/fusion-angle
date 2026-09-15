import { assertStrictEquals } from '@std/assert';
import {
    extractErrorMessage as apiExtract,
} from '../shared/error-helpers.ts';
import {
    extractErrorMessage as webExtract,
    isAbortFault,
    shouldSurfaceFault,
} from '../web-app/app/error-helpers.ts';

const layers = [
    ['api', apiExtract] as const,
    ['web-app', webExtract] as const,
];

for (const [layer, extract] of layers) {
    Deno.test(layer + ' extractErrorMessage uses an Error message',
        () => {
            assertStrictEquals(extract(new Error('boom')), 'boom');
        });

    Deno.test(layer + ' extractErrorMessage stringifies a non-Error',
        () => {
            assertStrictEquals(extract('plain'), 'plain');
            assertStrictEquals(extract(42), '42');
        });

    Deno.test(layer + ' extractErrorMessage prefers a fallback for'
        + ' a non-Error', () => {
            assertStrictEquals(extract('x', 'Import failed'),
                'Import failed');
            assertStrictEquals(extract(new Error('boom'), 'fb'),
                'boom');
        });
}

Deno.test('isAbortFault is true for AbortError', () => {
    assertStrictEquals(
        isAbortFault(
            new DOMException(
                'The operation was aborted.',
                'AbortError',
            ),
        ),
        true,
    );
});

Deno.test(
    'isAbortFault is true for an Error named AbortError',
    () => {
        const err = new Error('The user aborted a request');
        err.name = 'AbortError';
        assertStrictEquals(isAbortFault(err), true);
    },
);

Deno.test(
    'isAbortFault is false for Failed to fetch',
    () => {
        assertStrictEquals(
            isAbortFault(new TypeError('Failed to fetch')),
            false,
        );
    },
);

Deno.test(
    'shouldSurfaceFault hides abort and unload faults',
    () => {
        const abort = new DOMException(
            'The operation was aborted.',
            'AbortError',
        );
        const fetchErr = new TypeError('Failed to fetch');
        const boom = new Error('boom');
        assertStrictEquals(
            shouldSurfaceFault(abort, false), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, true), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, true), false,
        );
    },
);
