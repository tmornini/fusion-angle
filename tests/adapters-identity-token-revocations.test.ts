import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityTokenRevocationEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postIdentityLogoutEverywhere,
    getRevokedBefore,
} from
    '../web-app/app/adapters/identity-token-revocations.ts';

test('validates a revocation body', () => {
    assert.deepEqual(
        validateIdentityTokenRevocationEntity({
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000Z',
        }),
        {
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: 'c', at: 'x', extra: 1,
        }));
});

async function setup() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return { db, ctx: createRequestContext(db) };
}

test('logout-everywhere appends; reduce is latest-wins',
async () => {
    const { db, ctx } = await setup();
    await postIdentityLogoutEverywhere(ctx, 'current');
    await postIdentityLogoutEverywhere(ctx, 'current');
    const rows =
        await db.identityTokenRevocations.getAll();
    assert.equal(rows.length, 2);            // retained
    const stamp = await getRevokedBefore(ctx, 'current');
    assert.equal(typeof stamp, 'string');
    assert.equal(
        await getRevokedBefore(ctx, 'other'), null);
});
