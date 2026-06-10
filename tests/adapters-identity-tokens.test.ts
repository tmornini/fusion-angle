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
    postTokenIssue,
    postTokenRotation,
    postTokenRevocation,
    getTokenChainState,
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
    parent_jti: '',
    at: '2026-06-03T00:00:00.000000Z',
};

test('validates an issued token event', () => {
    assert.deepEqual(
        validateIdentityTokenEntity(goodRow), goodRow);
});

test('accepts a non-empty parent_jti for a rotation', () => {
    const rotated = {
        ...goodRow, action: 'rotated', parent_jti: 'jti-0',
    };
    assert.deepEqual(
        validateIdentityTokenEntity(rotated), rotated);
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
    await db.createSchema();
    await db.identityTokens.put('t1', {
        jti: 'jti-1', identity_id: 'current',
        action: 'issued', chain_id: 'c1',
        parent_jti: '', at: '2026-01-01T00:00:00.000000Z',
    });
    await db.identityTokens.put('t2', {
        jti: 'jti-1', identity_id: 'current',
        action: 'rotated', chain_id: 'c1',
        parent_jti: '', at: '2026-02-01T00:00:00.000000Z',
    });
    const rows = await db.identityTokens.getAll();
    assert.equal(rows.length, 2);   // append-only retained
});

test('issue then rotate appends a rotated + issued pair',
async () => {
    const { db, ctx } = await adminCtx();
    const jti = await postTokenIssue(ctx, 'current');
    const next = await postTokenRotation(ctx, jti);
    assert.notEqual(next, jti);
    // issued(root) + rotated(old) + issued(new) = 3
    assert.equal((await db.identityTokens.getAll()).length, 3);
    const state = await getTokenChainState(ctx, jti);
    assert.equal(state?.liveJti, next);
    assert.equal(state?.revoked, false);
});

test('replaying a rotated-away jti revokes the chain',
async () => {
    const { ctx } = await adminCtx();
    const jti = await postTokenIssue(ctx, 'current');
    await postTokenRotation(ctx, jti);   // jti rotated away
    await assert.rejects(
        () => postTokenRotation(ctx, jti),
        (e: unknown) => e instanceof TokenReuseError,
    );
    const state = await getTokenChainState(ctx, jti);
    assert.equal(state?.revoked, true);
    assert.equal(state?.liveJti, null);
});

test('rotating an unknown jti throws and appends nothing',
async () => {
    const { db, ctx } = await adminCtx();
    await assert.rejects(
        () => postTokenRotation(ctx, 'ghost'),
        (e: unknown) => e instanceof TokenReuseError,
    );
    assert.equal((await db.identityTokens.getAll()).length, 0);
});

test('revocation kills the whole chain', async () => {
    const { ctx } = await adminCtx();
    const jti = await postTokenIssue(ctx, 'current');
    const next = await postTokenRotation(ctx, jti);
    await postTokenRevocation(ctx, next);
    const state = await getTokenChainState(ctx, jti);
    assert.equal(state?.revoked, true);
});
