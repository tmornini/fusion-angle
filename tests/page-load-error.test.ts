// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
globalThis.document = {
    documentElement: {
        getAttribute: () => 'dashboard',
    },
    getElementById: () => null,
} as unknown as Document;

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import { handlePageLoadError } from
    '../web-app/app/page-loader.ts';

test('UnauthorizedError bounces to login', () => {
    window.location.href = '';
    handlePageLoadError(
        'dashboard',
        new UnauthorizedError('invalid_token'),
    );
    assert.match(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
