import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedServiceIdentity,
} from './identity-fixtures.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getClientRegistration,
    putClientRegistration,
    deleteClientRegistration,
} from '../web-app/app/adapters/identities.ts';

const FIELDS = {
    grantTypes: 'client_credentials',
    redirectUris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-ai-web',
    status: 'active' as const,
};

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedServiceIdentity(db, 'svc-1');
    return createRequestContext(db, await devToken());
}

test('an unregistered service reads as registered: false',
async () => {
    const ctx = await setup();
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: false },
    );
});

test('put then get round-trips through the camelCase'
+ ' domain shape', async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'svc-1', FIELDS);
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: true, ...FIELDS },
    );
});

test('delete deregisters back to registered: false',
async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'svc-1', FIELDS);
    await deleteClientRegistration(ctx, 'svc-1');
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: false },
    );
});
