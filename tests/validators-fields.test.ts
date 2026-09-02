import { assertStrictEquals, assertThrows } from '@std/assert';
import {
    validateTimestampField,
    validateEnumField,
} from '../api/validators.ts';
import { nowUtc } from '../api/types.ts';

const STAMP = '2026-01-01T00:00:00.000000Z';

Deno.test('validateTimestampField returns a parseable stamp', () => {
    assertStrictEquals(
        validateTimestampField({ at: STAMP }, 'at', 'Thing'),
        STAMP);
});

Deno.test('validateTimestampField rejects an unparseable stamp', () => {
    assertThrows(
        () =>
            validateTimestampField(
                { at: 'nope' }, 'at', 'Thing',
            ),
        Error, 'invalid timestamp "nope" on Thing');
});

// The gate enforces the Office of Time's RFC-3339 zulu shape
// at EXACTLY six fraction digits — the one width the ledgers
// sort. Off-width stamps mis-sort under lexical compare (a
// fractionless second sorts after every fractional stamp in
// it), so the gate rejects them; ambiguous near-misses
// Date.parse would wave through are rejected too.
Deno.test('validateTimestampField accepts the canonical mint', () => {
    const at = nowUtc();
    assertStrictEquals(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

Deno.test('validateTimestampField accepts 6-digit zulu', () => {
    const at = '2026-01-01T00:00:00.000000Z';
    assertStrictEquals(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

Deno.test('validateTimestampField rejects a date-only stamp', () => {
    assertThrows(
        () => validateTimestampField(
            { at: '2026-01-01' }, 'at', 'Thing'),
        Error, 'invalid timestamp');
});

Deno.test('validateTimestampField rejects a zoned offset', () => {
    assertThrows(
        () => validateTimestampField(
            { at: '2026-01-01T00:00:00.000+00:00' },
            'at', 'Thing'),
        Error, 'invalid timestamp');
});

Deno.test('validateTimestampField rejects off-width fractions',
() => {
    for (const at of [
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.00000Z',
        '2026-01-01T00:00:00.0000000Z',
        '2026-01-01T00:00:00.000000000Z',
    ]) {
        assertThrows(
            () => validateTimestampField(
                { at }, 'at', 'Thing'),
            Error, 'invalid timestamp', at);
    }
});

Deno.test('validateTimestampField rejects an impossible date', () => {
    assertThrows(
        () => validateTimestampField(
            { at: '2026-13-45T00:00:00.000000Z' }, 'at', 'Thing'),
        Error, 'invalid timestamp');
});

Deno.test('validateEnumField returns the matched option', () => {
    assertStrictEquals(
        validateEnumField(
            { k: 'ai' }, 'k', ['human', 'ai'],
            'member type', 'Thing',
        ),
        'ai');
});

Deno.test('validateEnumField rejects a value outside the set', () => {
    assertThrows(
        () =>
            validateEnumField(
                { k: 'x' }, 'k', ['human', 'ai'],
                'member type', 'Thing',
            ),
        Error, 'invalid member type "x" on Thing');
});
