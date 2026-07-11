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
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    const id = await getIdentity(ctx, 'p1');
    assert.equal(id.isPerson(), true);
});

test('getMemberPii is present, then erased after delete',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    const before = await getMemberPii(ctx, 'p1');
    assert.equal(before.erased, false);
    await deleteIdentityPii(ctx, 'p1');
    const after = await getMemberPii(ctx, 'p1');
    assert.equal(after.erased, true);
});

test('erasing PII keeps identity and person kind',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    await deleteIdentityPii(ctx, 'p1');
    assert.equal((await getMemberPii(ctx, 'p1')).erased, true);
    assert.equal((await getIdentity(ctx, 'p1')).isPerson(), true);
});
