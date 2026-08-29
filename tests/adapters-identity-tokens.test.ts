import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityTokenEntity,
} from '../api/validators.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const goodRow = {
    jti: generateIdentifier(),
    identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    action: 'issued',
    chain_id: generateIdentifier(),
    at: '2026-06-03T00:00:00.000000Z',
};

test('validates an issued token event', () => {
    assert.deepEqual(
        validateIdentityTokenEntity(goodRow), goodRow);
});

test('rejects the retired parent_jti key', () => {
    assert.throws(() =>
        validateIdentityTokenEntity({
            ...goodRow, parent_jti: generateIdentifier(),
        }));
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateIdentityTokenEntity({
            ...goodRow, action: 'minted',
        }));
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityTokenEntity({
            ...goodRow, extra: 1,
        }));
});

test('rejects an unparseable timestamp', () => {
    assert.throws(() =>
        validateIdentityTokenEntity({
            ...goodRow, at: 'not-a-date',
        }));
});
