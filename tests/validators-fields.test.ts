import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateTimestampField,
    validateEnumField,
} from '../api/validators.ts';
import { nowUtc } from '../api/types.ts';

const STAMP = '2026-01-01T00:00:00.000000Z';

test('validateTimestampField returns a parseable stamp', () => {
    assert.equal(
        validateTimestampField({ at: STAMP }, 'at', 'Thing'),
        STAMP);
});

test('validateTimestampField rejects an unparseable stamp', () => {
    assert.throws(
        () =>
            validateTimestampField(
                { at: 'nope' }, 'at', 'Thing',
            ),
        /invalid timestamp "nope" on Thing/);
});

// The gate enforces the Office of Time's RFC-3339 zulu shape
// at EXACTLY six fraction digits — the one width the ledgers
// sort. Off-width stamps mis-sort under lexical compare (a
// fractionless second sorts after every fractional stamp in
// it), so the gate rejects them; ambiguous near-misses
// Date.parse would wave through are rejected too.
test('validateTimestampField accepts the canonical mint', () => {
    const at = nowUtc();
    assert.equal(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

test('validateTimestampField accepts 6-digit zulu', () => {
    const at = '2026-01-01T00:00:00.000000Z';
    assert.equal(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

test('validateTimestampField rejects a date-only stamp', () => {
    assert.throws(
        () => validateTimestampField(
            { at: '2026-01-01' }, 'at', 'Thing'),
        /invalid timestamp/);
});

test('validateTimestampField rejects a zoned offset', () => {
    assert.throws(
        () => validateTimestampField(
            { at: '2026-01-01T00:00:00.000+00:00' },
            'at', 'Thing'),
        /invalid timestamp/);
});

test('validateTimestampField rejects off-width fractions',
() => {
    for (const at of [
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.00000Z',
        '2026-01-01T00:00:00.0000000Z',
        '2026-01-01T00:00:00.000000000Z',
    ]) {
        assert.throws(
            () => validateTimestampField(
                { at }, 'at', 'Thing'),
            /invalid timestamp/,
            at);
    }
});

test('validateTimestampField rejects an impossible date', () => {
    assert.throws(
        () => validateTimestampField(
            { at: '2026-13-45T00:00:00.000000Z' }, 'at', 'Thing'),
        /invalid timestamp/);
});

test('validateEnumField returns the matched option', () => {
    assert.equal(
        validateEnumField(
            { k: 'ai' }, 'k', ['human', 'ai'],
            'member type', 'Thing',
        ),
        'ai');
});

test('validateEnumField rejects a value outside the set', () => {
    assert.throws(
        () =>
            validateEnumField(
                { k: 'x' }, 'k', ['human', 'ai'],
                'member type', 'Thing',
            ),
        /invalid member type "x" on Thing/);
});
