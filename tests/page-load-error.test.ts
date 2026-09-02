// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
globalThis.document = {
    documentElement: {
        getAttribute: () => 'dashboard',
    },
    getElementById: () => null,
} as unknown as Document;

import { assertMatch } from '@std/assert';
import { UnauthorizedError } from
    '../api/http-errors.ts';
import { handlePageLoadError } from
    '../web-app/app/page-loader.ts';

Deno.test('UnauthorizedError bounces to login', () => {
    window.location.href = '';
    handlePageLoadError(
        'dashboard',
        new UnauthorizedError('invalid_token'),
    );
    assertMatch(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
