import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    SECRET_BYTE_LENGTH,
    generateSecret,
} from '../shared/secret.ts';

const ALPHABET = /^[A-Za-z0-9_-]+$/;

Deno.test('generateSecret returns 43 alphabet chars', () => {
    const s = generateSecret();
    assertStrictEquals(s.length, 43);
    assertMatch(s, ALPHABET);
    assertStrictEquals(SECRET_BYTE_LENGTH, 32);
});

Deno.test('generateSecret yields distinct values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
        seen.add(generateSecret());
    }
    assertStrictEquals(seen.size, 1000);
});
