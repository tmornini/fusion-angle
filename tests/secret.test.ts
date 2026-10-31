import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    PASSWORD_ASCII_LENGTH,
    PASSWORD_BYTE_LENGTH,
    SECRET_BYTE_LENGTH,
    generatePassword,
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

Deno.test('generatePassword returns 22 alphabet chars', () => {
    const s = generatePassword();
    assertStrictEquals(s.length, PASSWORD_ASCII_LENGTH);
    assertMatch(s, ALPHABET);
    assertStrictEquals(PASSWORD_BYTE_LENGTH, 16);
});

Deno.test('generatePassword yields distinct values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
        seen.add(generatePassword());
    }
    assertStrictEquals(seen.size, 1000);
});
