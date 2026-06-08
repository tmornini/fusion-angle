import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateTimestampField,
    validateEnumField,
} from '../api/validators.ts';

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
