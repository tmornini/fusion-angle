import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    credentialRevealPanel,
} from '../web-app/app/presenters/credential-reveal.ts';

test('renders the username and the password once', () => {
    const out = credentialRevealPanel({
        adminUsername: 'demo@example.com',
        adminPassword: 'aB3xY7zQ9w',
    }).toString();
    assert.match(out, /demo@example\.com/);
    assert.match(out, /aB3xY7zQ9w/);
    assert.match(out, /class="credential-reveal"/);
});

test('HTML-escapes a hostile password', () => {
    const out = credentialRevealPanel({
        adminUsername: 'admin',
        adminPassword: '<img src=x onerror="alert(1)">',
    }).toString();
    // the raw injection must not survive; its escaped form must
    assert.equal(out.includes('<img src=x'), false);
    assert.match(out, /&lt;img src=x/);
    assert.match(out, /onerror=&quot;alert/);
});
