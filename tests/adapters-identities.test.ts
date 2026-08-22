import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdentity,
    getMemberPii,
    deleteIdentityPii,
} from '../web-app/app/adapters/identities.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

test('getIdentity reads kind', async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const id = await getIdentity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal(id.isPerson(), true);
});

test('getMemberPii is present, then erased after delete',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const before = await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal(before.erased, false);
    await deleteIdentityPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    const after = await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal(after.erased, true);
});

test('erasing PII keeps identity and person kind',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    await deleteIdentityPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert.equal((await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw')).erased
        , true);
    assert.equal((await getIdentity(ctx
        , 'pnXmXrxOWayANgDLdCjuBw')).isPerson(), true);
});
