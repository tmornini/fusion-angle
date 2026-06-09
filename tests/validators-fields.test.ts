import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateTimestampField,
    validateEnumField,
} from '../api/validators.ts';
import { nowUtc } from '../api/types.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

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

// The gate enforces the Office of Time's RFC-3339 zulu shape:
// the canonical mint passes, and the ambiguous near-misses
// Date.parse would otherwise wave through are rejected.
test('validateTimestampField accepts the canonical mint', () => {
    const at = nowUtc();
    assert.equal(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

test('validateTimestampField accepts 3-digit zulu', () => {
    const at = '2026-01-01T00:00:00.000Z';
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

test('validateTimestampField accepts a fractionless zulu', () => {
    // Unambiguous (a specific UTC second); width is the mint's
    // job, not the gate's. Accepted, not rejected.
    const at = '2026-01-01T00:00:00Z';
    assert.equal(
        validateTimestampField({ at }, 'at', 'Thing'), at);
});

test('validateTimestampField rejects an impossible date', () => {
    assert.throws(
        () => validateTimestampField(
            { at: '2026-13-45T00:00:00.000Z' }, 'at', 'Thing'),
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
