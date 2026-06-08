import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    makeFieldKeyValidator,
} from '../web-app/app/field-key-validator.ts';

test('makeFieldKeyValidator accepts a known field key', () => {
    const isKey = makeFieldKeyValidator(
        new Set(['name', 'email']));
    assert.equal(isKey('name'), true);
    assert.equal(isKey('email'), true);
});

test('makeFieldKeyValidator rejects unknown keys and null',
    () => {
        const isKey = makeFieldKeyValidator(new Set(['name']));
        assert.equal(isKey('phone'), false);
        assert.equal(isKey(null), false);
    });
