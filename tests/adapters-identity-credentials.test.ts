import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    postIdentityCredentialSet,
    postIdentityCredentialRotation,
    postIdentityCredentialRevocation,
    getIdentityCredentialState,
} from
    '../web-app/app/adapters/identity-credentials.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return { db, ctx: createRequestContext(db, devToken()) };
}

test('set marks the kind active', async () => {
    const { ctx } = await setup();
    await postIdentityCredentialSet(
        ctx, 'p1', 'password', 'secret-v1',
    );
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.deepEqual(state.active, ['password']);
});

test('ledger retains set, rotate, revoke; latest wins',
async () => {
    const { db, ctx } = await setup();
    await postIdentityCredentialSet(
        ctx, 'p1', 'password', 'secret-v1',
    );
    await postIdentityCredentialRotation(
        ctx, 'p1', 'password', 'secret-v2',
    );
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
    const { ctx } = await setup();
    await postIdentityCredentialSet(
        ctx, 'p1', 'password', 'super-secret',
    );
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.equal('secret' in state, false);
    assert.equal(
        JSON.stringify(state)
            .includes('super-secret'),
        false,
    );
});
