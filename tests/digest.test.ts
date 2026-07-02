import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sha256Bytes,
    sha256Hex,
} from '../shared/digest.ts';

test('sha256Bytes returns 32 bytes', async () => {
    const bytes = await sha256Bytes('abc');
    assert.equal(bytes.length, 32);
});

test('sha256Hex matches the known vector', async () => {
    // NIST test vector for "abc"
    assert.equal(
        await sha256Hex('abc'),
        'ba7816bf8f01cfea414140de5dae2223'
        + 'b00361a396177a9cb410ff61f20015ad',
    );
});

test('sha256Hex is lower-case hex, 64 chars', async () => {
    const hex = await sha256Hex('');
    assert.match(hex, /^[0-9a-f]{64}$/);
});
