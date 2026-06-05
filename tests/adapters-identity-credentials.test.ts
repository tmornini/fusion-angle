import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { verifyPassword } from '../api/password-hash.ts';
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
    return { db, ctx: createRequestContext(db, await devToken()) };
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

test('the stored secret is a hashed PHC, not plaintext',
async () => {
    const { db, ctx } = await setup();
    await postIdentityCredentialSet(
        ctx, 'p1', 'password', 'super-secret',
    );
    const row = (await db.identityCredentials.getAll())
        .find(r => r.identity_id === 'p1');
    assert.ok(row, 'credential row exists');
    assert.match(row.secret, /^\$pbkdf2-sha256\$/);
    assert.notEqual(row.secret, 'super-secret');
    assert.equal(
        await verifyPassword('super-secret', row.secret),
        true);
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
        at: '2026-02-01T00:00:00.000Z',
    });
    await db.identityCredentials.put('c2', {
        identity_id: 'p1',
        kind: 'password',
        status: 'revoked',
        secret: '',
        at: '2026-01-01T00:00:00.000Z',
    });
    const state =
        await getIdentityCredentialState(ctx, 'p1');
    assert.deepEqual(state.active, ['password']);
});
