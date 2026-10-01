import { assert, assertEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedServiceIdentity,
} from './identity-fixtures.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
import {
    getClientRegistration,
    putClientRegistration,
    deleteClientRegistration,
} from '../client/identities.ts';

const FIELDS = {
    grantTypes: 'client_credentials',
    redirectUris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-angle',
    status: 'active' as const,
};

const SERVICE = 'uWzjNIEeEtVWqZoJMLeYpw';

async function seededDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedServiceIdentity(db, SERVICE);
    return db;
}

async function setup() {
    return inPageContext(await seededDb(), await devToken());
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
    await putClientRegistration(
        ctx, 'uWzjNIEeEtVWqZoJMLeYpw', FIELDS,
        { registered: false },
    );
    const registration = await getClientRegistration(
        ctx, 'uWzjNIEeEtVWqZoJMLeYpw',
    );
    assert(registration.registered);
    const { message: _message, ...domain } = registration;
    assertEquals(domain, { registered: true, ...FIELDS });
});

Deno.test('delete deregisters back to registered: false',
async () => {
    const ctx = await setup();
    await putClientRegistration(
        ctx, 'uWzjNIEeEtVWqZoJMLeYpw', FIELDS,
        { registered: false },
    );
    await deleteClientRegistration(
        ctx, 'uWzjNIEeEtVWqZoJMLeYpw',
        await getClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw'),
    );
    assertEquals(
        await getClientRegistration(ctx, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { registered: false },
    );
});

Deno.test('a first registration sends no latch', async () => {
    const { ctx, sent } = recordedContext(
        await seededDb(), await devToken(),
    );
    await putClientRegistration(
        ctx, SERVICE, FIELDS, { registered: false },
    );
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['PUT', null],
    ]);
});

Deno.test('a registration update latches the held registration',
async () => {
    const { ctx, sent } = recordedContext(
        await seededDb(), await devToken(),
    );
    await putClientRegistration(
        ctx, SERVICE, FIELDS, { registered: false },
    );
    const held = await getClientRegistration(ctx, SERVICE);
    assert(held.registered);
    sent.length = 0;
    await putClientRegistration(
        ctx, SERVICE, { ...FIELDS, status: 'disabled' }, held,
    );
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['PUT', held.message.query('header.etag').toText()],
    ]);
});

Deno.test('a deregistration latches the held registration',
async () => {
    const { ctx, sent } = recordedContext(
        await seededDb(), await devToken(),
    );
    await putClientRegistration(
        ctx, SERVICE, FIELDS, { registered: false },
    );
    const held = await getClientRegistration(ctx, SERVICE);
    assert(held.registered);
    sent.length = 0;
    await deleteClientRegistration(ctx, SERVICE, held);
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['DELETE', held.message.query('header.etag').toText()],
    ]);
});
