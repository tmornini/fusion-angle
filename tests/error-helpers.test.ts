import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractErrorMessage as apiExtract,
} from '../api/error-helpers.ts';
import {
    extractErrorMessage as webExtract,
} from '../web-app/app/error-helpers.ts';

const layers = [
    ['api', apiExtract] as const,
    ['web-app', webExtract] as const,
];

for (const [layer, extract] of layers) {
    test(layer + ' extractErrorMessage uses an Error message',
        () => {
            assert.equal(extract(new Error('boom')), 'boom');
        });

    test(layer + ' extractErrorMessage stringifies a non-Error',
        () => {
            assert.equal(extract('plain'), 'plain');
            assert.equal(extract(42), '42');
        });

    test(layer + ' extractErrorMessage prefers a fallback for'
        + ' a non-Error', () => {
            assert.equal(extract('x', 'Import failed'),
                'Import failed');
            assert.equal(extract(new Error('boom'), 'fb'),
                'boom');
        });
}
