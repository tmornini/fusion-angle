import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    SECRET_BYTE_LENGTH,
    generateSecret,
} from '../shared/secret.ts';

const ALPHABET = /^[A-Za-z0-9_-]+$/;

test('generateSecret returns 43 alphabet chars', () => {
    const s = generateSecret();
    assert.equal(s.length, 43);
    assert.match(s, ALPHABET);
    assert.equal(SECRET_BYTE_LENGTH, 32);
});

test('generateSecret yields distinct values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
        seen.add(generateSecret());
    }
    assert.equal(seen.size, 1000);
});
