// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };

let pageName = 'snapshots';
globalThis.document = {
    documentElement: {
        getAttribute: () => pageName,
    },
} as unknown as Document;

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { redirectToLogin } from
    '../web-app/app/auth-redirect.ts';

test('an unknown page bounces to auth with no return',
() => {
    pageName = 'snapshots';
    window.location.href = '';
    redirectToLogin();
    assert.match(
        window.location.href,
        /auth\/index\.html$/,
    );
    assert.equal(
        window.location.href.includes('return='),
        false,
    );
});

test('a gated page still carries return', () => {
    pageName = 'dashboard';
    window.location.href = '';
    redirectToLogin();
    assert.match(
        window.location.href,
        /auth.*return=dashboard/,
    );
});
