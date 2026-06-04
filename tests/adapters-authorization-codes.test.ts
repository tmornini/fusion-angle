import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateAuthorizationCodeEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    postCodeIssue,
    postCodeConsumption,
    getCodeState,
} from '../web-app/app/adapters/authorization-codes.ts';

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return {
        db, ctx: createRequestContext(db, await devToken()),
    };
}

const goodRow = {
    code: 'opaque-code-1',
    identity_id: 'current',
    client_id: 'web',
    status: 'issued',
    at: '2026-06-03T00:00:00.000Z',
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
    await db.createSchema();
    await db.authorizationCodes.put('a1', goodRow);
    await db.authorizationCodes.put('a2', {
        ...goodRow, status: 'consumed',
        at: '2026-06-03T00:01:00.000Z',
    });
    assert.equal(
        (await db.authorizationCodes.getAll()).length, 2);
});

test('issue then read reflects the issued state', async () => {
    const { ctx } = await adminCtx();
    const code = await postCodeIssue(ctx, 'current', 'web');
    const state = await getCodeState(ctx, code);
    assert.equal(state?.status, 'issued');
    assert.equal(state?.identityId, 'current');
    assert.equal(state?.clientId, 'web');
});

test('consume flips the state; ledger retains both',
async () => {
    const { db, ctx } = await adminCtx();
    const code = await postCodeIssue(ctx, 'current', 'web');
    await postCodeConsumption(ctx, code, 'current', 'web');
    assert.equal(
        (await db.authorizationCodes.getAll()).length, 2);
    assert.equal(
        (await getCodeState(ctx, code))?.status, 'consumed');
});

test('an unknown code has no state', async () => {
    const { ctx } = await adminCtx();
    assert.equal(await getCodeState(ctx, 'nope'), null);
});

test('an anonymous principal cannot read codes', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const anon = createRequestContext(
        db, await devToken('anonymous'));
    await assert.rejects(() => getCodeState(anon, 'x'));
});
