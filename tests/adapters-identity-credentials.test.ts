import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postIdentityCredentialRevocation,
    getIdentityCredentialState,
} from
    '../web-app/app/adapters/identity-credentials.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

test('ledger retains set, rotate, revoke; latest wins',
async () => {
    const { db, ctx } = await setup();
    await db.identityCredentials.put('c1', {
        identity_id: 'p1',
        kind: 'password',
        status: 'set',
        secret: 'phc-v1',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await db.identityCredentials.put('c2', {
        identity_id: 'p1',
        kind: 'password',
        status: 'rotated',
        secret: 'phc-v2',
        at: '2026-01-02T00:00:00.000000Z',
    });
    await postIdentityCredentialRevocation(
        ctx, 'p1', 'password',
    );
    const events =
        await db.identityCredentials.getAll();
    assert.equal(events.length, 3);   // retained
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.equal(state.active.length, 0); // revoked
});

test('the secret never leaves the state adapter',
async () => {
    const { db, ctx } = await setup();
    await db.identityCredentials.put('c1', {
        identity_id: 'p1',
        kind: 'password',
        status: 'set',
        secret: 'super-secret',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.equal('secret' in state, false);
    assert.equal(
        JSON.stringify(state)
            .includes('super-secret'),
        false,
    );
});

test('credential state is latest by at, not array order',
async () => {
    const { db, ctx } = await setup();
    // Appended in REVERSE chronological order: the later
    // 'set' precedes the earlier 'revoked' in the array,
    // so array-order "last wins" would wrongly revoke.
    await db.identityCredentials.put('c1', {
        identity_id: 'p1',
        kind: 'password',
        status: 'set',
        secret: '',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await db.identityCredentials.put('c2', {
        identity_id: 'p1',
        kind: 'password',
        status: 'revoked',
        secret: '',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.deepEqual(state.active, ['password']);
});
