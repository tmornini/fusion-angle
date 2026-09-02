import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    base64UrlEncode,
    base64UrlDecode,
    bytesToBase64Url,
    base64UrlToBytes,
} from '../shared/base64url.ts';

Deno.test('round-trips UTF-8 JSON', () => {
    const json = JSON.stringify({ name: 'Tóny ✦', n: 1 });
    const encoded = base64UrlEncode(json);
    assertStrictEquals(base64UrlDecode(encoded), json);
});

Deno.test('is URL-safe with no padding', () => {
    const encoded = base64UrlEncode('???>>>???');
    assertStrictEquals(/[+/=]/.test(encoded), false);
});

Deno.test('round-trips arbitrary bytes including high values', () => {
    const bytes =
        new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    assertEquals(base64UrlToBytes(encoded), bytes);
});

Deno.test('round-trips an empty byte array', () => {
    const empty = new Uint8Array([]);
    assertStrictEquals(bytesToBase64Url(empty), '');
    assertEquals(base64UrlToBytes(''), empty);
});

Deno.test('encodes a known vector with both URL-safe chars', () => {
    // 0xFB 0xFF 0xBF -> base64 "+/+/" -> base64url "-_-_"
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    assertStrictEquals(bytesToBase64Url(bytes), '-_-_');
});
