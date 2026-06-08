import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityProviderEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postProviderLink,
    postProviderUnlink,
    getProvidersFor,
} from '../web-app/app/adapters/identity-providers.ts';

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db, ctx: createRequestContext(db, await devToken()),
    };
}

const goodRow = {
    identity_id: 'current',
    provider: 'google',
    provider_subject: 'sub-123',
    action: 'linked',
    at: '2026-06-03T00:00:00.000Z',
};

test('validates an identity-provider link', () => {
    assert.deepEqual(
        validateIdentityProviderEntity(goodRow), goodRow);
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateIdentityProviderEntity({
            ...goodRow, action: 'merged',
        }));
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityProviderEntity({
            ...goodRow, extra: 1,
        }));
});

test('identity_providers store retains events', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.identityProviders.put('p1', goodRow);
    await db.identityProviders.put('p2', {
        ...goodRow, action: 'unlinked',
        at: '2026-07-01T00:00:00.000Z',
    });
    assert.equal(
        (await db.identityProviders.getAll()).length, 2);
});

test('link then read reflects the provider', async () => {
    const { ctx } = await adminCtx();
    await postProviderLink(ctx, 'p2', 'google', 'g-1');
    assert.deepEqual(
        await getProvidersFor(ctx, 'p2'), ['google']);
});

test('unlink removes it; ledger retains all', async () => {
    const { db, ctx } = await adminCtx();
    await postProviderLink(ctx, 'p2', 'google', 'g-1');
    await postProviderUnlink(ctx, 'p2', 'google', 'g-1');
    assert.equal(
        (await db.identityProviders.getAll()).length, 2);
    assert.deepEqual(await getProvidersFor(ctx, 'p2'), []);
});

test('an anonymous principal cannot read providers',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const anon = createRequestContext(
        db, await devToken('anonymous'));
    await assert.rejects(() => getProvidersFor(anon, 'p2'));
});

test('linked providers are latest by at, not array order',
async () => {
    const { db, ctx } = await adminCtx();
    // Appended in REVERSE chronological order: the later
    // 'linked' precedes the earlier 'unlinked', so
    // array-order "last wins" would wrongly drop it.
    await db.identityProviders.put('pl', {
        ...goodRow, identity_id: 'p2', action: 'linked',
        at: '2026-02-01T00:00:00.000Z',
    });
    await db.identityProviders.put('pe', {
        ...goodRow, identity_id: 'p2', action: 'unlinked',
        at: '2026-01-01T00:00:00.000Z',
    });
    assert.deepEqual(
        await getProvidersFor(ctx, 'p2'), ['google']);
});
