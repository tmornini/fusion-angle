// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };

let pageName = 'snapshots';
globalThis.document = {
    documentElement: {
        getAttribute: () => pageName,
    },
} as unknown as Document;

import { assertMatch, assertStrictEquals } from '@std/assert';
import { redirectToLogin } from
    '../web-app/app/auth-redirect.ts';

Deno.test('an unknown page bounces to auth with no return',
() => {
    pageName = 'snapshots';
    window.location.href = '';
    redirectToLogin();
    assertMatch(
        window.location.href,
        /auth\/index\.html$/,
    );
    assertStrictEquals(
        window.location.href.includes('return='),
        false,
    );
});

Deno.test('a gated page still carries return', () => {
    pageName = 'dashboard';
    window.location.href = '';
    redirectToLogin();
    assertMatch(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
