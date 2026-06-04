import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    base64UrlEncode,
    base64UrlDecode,
    bytesToBase64Url,
    base64UrlToBytes,
} from '../api/base64url.ts';

test('round-trips UTF-8 JSON', () => {
    const json = JSON.stringify({ name: 'Tóny ✦', n: 1 });
    const encoded = base64UrlEncode(json);
    assert.equal(base64UrlDecode(encoded), json);
});

test('is URL-safe with no padding', () => {
    const encoded = base64UrlEncode('???>>>???');
    assert.equal(/[+/=]/.test(encoded), false);
});

test('round-trips arbitrary bytes including high values', () => {
    const bytes =
        new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    assert.deepEqual(base64UrlToBytes(encoded), bytes);
});

test('round-trips an empty byte array', () => {
    const empty = new Uint8Array([]);
    assert.equal(bytesToBase64Url(empty), '');
    assert.deepEqual(base64UrlToBytes(''), empty);
});

test('encodes a known vector with both URL-safe chars', () => {
    // 0xFB 0xFF 0xBF -> base64 "+/+/" -> base64url "-_-_"
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    assert.equal(bytesToBase64Url(bytes), '-_-_');
});
