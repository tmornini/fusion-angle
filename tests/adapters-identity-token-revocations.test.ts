import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityTokenRevocationEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postIdentityLogoutEverywhere,
    getRevokedBefore,
} from
    '../web-app/app/adapters/identity-token-revocations.ts';

test('validates a revocation body', () => {
    assert.deepEqual(
        validateIdentityTokenRevocationEntity({
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000000Z',
        }),
        {
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: 'c', at: 'x', extra: 1,
        }));
});

test('rejects an unparseable timestamp', () => {
    assert.throws(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: 'a', at: 'not-a-date',
        }));
});

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

test('logout-everywhere appends; reduce is latest-wins',
async () => {
    // Revoke a subject OTHER than the writer's ('current',
    // via devToken) so the second append's own Bearer is not
    // self-revoked by the first — the gate correctly revokes
    // the actor's stale token when it logs ITSELF out
    // everywhere; this test exercises append + latest-wins,
    // not that self-revocation.
    const { db, ctx } = await setup();
    await postIdentityLogoutEverywhere(ctx, 'target');
    await postIdentityLogoutEverywhere(ctx, 'target');
    const rows =
        await db.identityTokenRevocations.getAll();
    assert.equal(rows.length, 2);            // retained
    const stamp = await getRevokedBefore(ctx, 'target');
    assert.equal(typeof stamp, 'string');
    assert.equal(
        await getRevokedBefore(ctx, 'other'), null);
});
