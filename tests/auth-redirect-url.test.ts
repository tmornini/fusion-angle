import { assertEquals, assertStrictEquals } from '@std/assert';
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

Deno.test('a page with nested params round-trips the wire', () => {
    const target = encodeReturnTarget(
        'flow-detail', { flowId: 'a', tab: 'b' });
    assertEquals(
        decodeReturnTarget(throughWire(target)),
        {
            page: 'flow-detail',
            params: { flowId: 'a', tab: 'b' },
        });
});

Deno.test('a bare page encodes without a query', () => {
    assertStrictEquals(
        encodeReturnTarget('dashboard', {}), 'dashboard');
});

Deno.test('an absent return resolves to the default page', () => {
    assertEquals(
        decodeReturnTarget(null),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

Deno.test('a known gated page with no params decodes plainly', () => {
    assertEquals(
        decodeReturnTarget('members'),
        { page: 'members', params: {} });
});

Deno.test('a raw URL return is rejected to the default', () => {
    assertEquals(
        decodeReturnTarget('https://evil.com/pwn'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
    assertEquals(
        decodeReturnTarget('//evil.com'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

Deno.test('an exempt page return is rejected to the default', () => {
    // auth/landing are login-free; returning to them post-login
    // is pointless, so they fall to the default.
    assertEquals(
        decodeReturnTarget('auth'),
        { page: DEFAULT_POST_LOGIN_PAGE, params: {} });
});

Deno.test('a retired snapshots return falls to default',
() => {
    assertEquals(
        decodeReturnTarget('snapshots'),
        {
            page: DEFAULT_POST_LOGIN_PAGE,
            params: {},
        },
    );
});
