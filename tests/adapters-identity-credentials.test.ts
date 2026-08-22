import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedIdentityCredential } from './identity-fixtures.ts';
import {
    postIdentityCredentialRevocation,
    getIdentityCredentialState,
} from
    '../web-app/app/adapters/identity-credentials.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

// Phase Final Task 2: identity_credentials ROW half stripped —
// event count and active state live on the pair plane.

test('ledger retains set, rotate, revoke; latest wins',
async () => {
    const { db, ctx } = await setup();
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: 'phc-v1',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw', 'c2', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'rotated',
        secret: 'phc-v2',
        at: '2026-01-02T00:00:00.000000Z',
    });
    await postIdentityCredentialRevocation(
        ctx, 'pnXmXrxOWayANgDLdCjuBw', 'password',
    );
    const events = await deriveCredentialsFor(db, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal(events.length, 3);   // retained
    // Phase Final Stage B: identity spine tables retired.
    const state =
        await getIdentityCredentialState(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal(state.active.length, 0); // revoked
});

test('the secret never leaves the state adapter',
async () => {
    const { db, ctx } = await setup();
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: 'super-secret',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const state =
        await getIdentityCredentialState(ctx, 'pnXmXrxOWayANgDLdCjuBw');
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
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: '',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw', 'c2', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'revoked',
        secret: '',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const state =
        await getIdentityCredentialState(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.deepEqual(state.active, ['password']);
});
