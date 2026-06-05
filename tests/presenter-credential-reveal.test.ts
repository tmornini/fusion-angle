import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    credentialRevealPanel,
    credentialsCopyText,
} from '../web-app/app/presenters/credential-reveal.ts';

test('renders every seeded identity username and password',
() => {
    const out = credentialRevealPanel({
        identities: [
            {
                identityId: 'current',
                username: 'demo@example.com',
                password: 'aB3xY7zQ9w',
            },
            {
                identityId: 'u2',
                username: 'sarah@example.com',
                password: 'kP9mN2rT4x',
            },
        ],
    }).toString();
    assert.match(out, /demo@example\.com/);
    assert.match(out, /aB3xY7zQ9w/);
    assert.match(out, /sarah@example\.com/);
    assert.match(out, /kP9mN2rT4x/);
    assert.match(out, /class="credential-reveal"/);
});

test('the panel offers a copy-all button', () => {
    const out = credentialRevealPanel({
        identities: [{
            identityId: 'current',
            username: 'demo@example.com',
            password: 'aB3xY7zQ9w',
        }],
    }).toString();
    assert.match(out, /id="credential-copy-all-btn"/);
});

test('credentialsCopyText emits one credential per line',
() => {
    const text = credentialsCopyText({
        identities: [
            {
                identityId: 'a',
                username: 'a@example.com',
                password: 'pw-one',
            },
            {
                identityId: 'b',
                username: 'b@example.com',
                password: 'pw-two',
            },
        ],
    });
    const lines = text.split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /a@example\.com/);
    assert.match(lines[0]!, /pw-one/);
    assert.match(lines[1]!, /b@example\.com/);
    assert.match(lines[1]!, /pw-two/);
});

test('HTML-escapes a hostile password', () => {
    const out = credentialRevealPanel({
        identities: [{
            identityId: 'x',
            username: 'admin',
            password: '<img src=x onerror="alert(1)">',
        }],
    }).toString();
    // the raw injection must not survive; its escaped form must
    assert.equal(out.includes('<img src=x'), false);
    assert.match(out, /&lt;img src=x/);
    assert.match(out, /onerror=&quot;alert/);
});
