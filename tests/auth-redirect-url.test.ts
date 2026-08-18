import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    encodeReturnTarget,
    decodeReturnTarget,
    DEFAULT_POST_LOGIN_PAGE,
} from '../web-app/app/auth-redirect.ts';

// Simulate the wire: navigateTo percent-encodes the value into
// the URL; the auth page reads it back with URLSearchParams.
function throughWire(target: string): string {
    const url = new URLSearchParams({ return: target });
    return new URLSearchParams(url.toString()).get('return')!;
}

test('a page with nested params round-trips the wire', () => {
    const target = encodeReturnTarget(
        'flow-detail', { flowId: 'a', tab: 'b' });
    assert.deepEqual(
        decodeReturnTarget(throughWire(target)),
        {
            page: 'flow-detail',
            params: { flowId: 'a', tab: 'b' },
        });
});

test('a bare page encodes without a query', () => {
    assert.equal(
        encodeReturnTarget('dashboard', {}), 'dashboard');
});

test('an absent return resolves to the default page', () => {
    assert.deepEqual(
        decodeReturnTarget(null),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

test('a known gated page with no params decodes plainly', () => {
    assert.deepEqual(
        decodeReturnTarget('members'),
        { page: 'members', params: {} });
});

test('a raw URL return is rejected to the default', () => {
    assert.deepEqual(
        decodeReturnTarget('https://evil.com/pwn'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
    assert.deepEqual(
        decodeReturnTarget('//evil.com'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

test('an exempt page return is rejected to the default', () => {
    // auth/landing are login-free; returning to them post-login
    // is pointless, so they fall to the default.
    assert.deepEqual(
        decodeReturnTarget('auth'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

test('a retired snapshots return falls to default',
() => {
    assert.deepEqual(
        decodeReturnTarget('snapshots'),
        {
            page: DEFAULT_POST_LOGIN_PAGE,
            params: {},
        },
    );
});
