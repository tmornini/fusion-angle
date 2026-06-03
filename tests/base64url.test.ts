import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    base64UrlEncode,
    base64UrlDecode,
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
