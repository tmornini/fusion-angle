import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityTokenEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    TokenReuseError,
} from '../web-app/app/adapters/identity-tokens.ts';

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db, ctx: createRequestContext(db, await devToken()),
    };
}

const goodRow = {
    jti: 'jti-1',
    identity_id: 'current',
    action: 'issued',
    chain_id: 'chain-1',
    at: '2026-06-03T00:00:00.000000Z',
};

test('validates an issued token event', () => {
    assert.deepEqual(
        validateIdentityTokenEntity(goodRow), goodRow);
});

test('rejects the retired parent_jti key', () => {
    assert.throws(() =>
        validateIdentityTokenEntity({
            ...goodRow, parent_jti: 'jti-0',
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

test('identity_tokens store retains appended events',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.identityTokens.put('t1', {
        jti: 'jti-1', identity_id: 'current',
        action: 'issued', chain_id: 'c1',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await db.identityTokens.put('t2', {
        jti: 'jti-1', identity_id: 'current',
        action: 'rotated', chain_id: 'c1',
        at: '2026-02-01T00:00:00.000000Z',
    });
    const rows = await db.identityTokens.getAll();
    assert.equal(rows.length, 2);   // append-only retained
});
