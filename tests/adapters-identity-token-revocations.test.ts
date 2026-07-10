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
} from
    '../web-app/app/adapters/identity-token-revocations.ts';
import { deriveTokenRevocationsFor } from
    '../api/derive-identity-spine.ts';

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

// Phase Final Task 2: identity_token_revocations ROW half
// stripped — append count lives on the pair plane.

test('logout-everywhere appends, never splices',
async () => {
    // Revoke a subject OTHER than the writer's ('current',
    // via devToken) so the second append's own Bearer is not
    // self-revoked by the first — the gate correctly revokes
    // the actor's stale token when it logs ITSELF out
    // everywhere. The latest-wins reduce is pinned at the
    // token-verify layer (access-token tests).
    const { db, ctx } = await setup();
    await postIdentityLogoutEverywhere(ctx, 'target');
    await postIdentityLogoutEverywhere(ctx, 'target');
    const rows = await deriveTokenRevocationsFor(
        db, 'target',
    );
    assert.equal(rows.length, 2);            // retained
    assert.ok(rows.every(
        r => r.identity_id === 'target'));
    // Phase Final Stage B: identity spine tables retired.
});
