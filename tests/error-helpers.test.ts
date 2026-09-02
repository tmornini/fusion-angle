import { assertStrictEquals } from '@std/assert';
import {
    extractErrorMessage as apiExtract,
} from '../shared/error-helpers.ts';
import {
    extractErrorMessage as webExtract,
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
