import { assertEquals } from '@std/assert';
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
    aud: 'fusion-angle',
    status: 'active' as const,
};

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    return createRequestContext(db, await devToken());
}

Deno.test('an unregistered service reads as registered: false',
async () => {
    const ctx = await setup();
    assertEquals(
        await getClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { registered: false },
    );
});

Deno.test('put then get round-trips through the camelCase'
+ ' domain shape', async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw', FIELDS);
    assertEquals(
        await getClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { registered: true, ...FIELDS },
    );
});

Deno.test('delete deregisters back to registered: false',
async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw', FIELDS);
    await deleteClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw');
    assertEquals(
        await getClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { registered: false },
    );
});
