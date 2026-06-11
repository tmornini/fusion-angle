import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateAuthorizationCodeEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

const goodRow = {
    code: 'opaque-code-1',
    identity_id: 'current',
    client_id: 'web',
    status: 'issued',
    at: '2026-06-03T00:00:00.000000Z',
};

test('validates an authorization code', () => {
    assert.deepEqual(
        validateAuthorizationCodeEntity(goodRow), goodRow);
});

test('rejects an unknown status', () => {
    assert.throws(() =>
        validateAuthorizationCodeEntity({
            ...goodRow, status: 'expired',
        }));
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateAuthorizationCodeEntity({
            ...goodRow, extra: 1,
        }));
});

test('authorization_codes store retains events', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.authorizationCodes.put('a1', goodRow);
    await db.authorizationCodes.put('a2', {
        ...goodRow, status: 'consumed',
        at: '2026-06-03T00:01:00.000000Z',
    });
    assert.equal(
        (await db.authorizationCodes.getAll()).length, 2);
});
