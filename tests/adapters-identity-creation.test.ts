import { operationIdHeader } from './operation-id-header.ts';
import {
    assert,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext, GET } from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { verifyPassword } from '../shared/password-hash.ts';
import {
    postIdentityCreation,
} from '../client/identities.ts';
import {
    deriveIdentityPii,
    deriveCredentialsFor,
} from '../api/derive-identity-spine.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { RequestError } from '../shared/http-errors.ts';

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: inPageContext(db, await devToken()),
    };
}

// Phase Final Task 2: identities / identity_pii /
// identity_credentials ROW halves stripped — oracles are the
// message plane (GET + derive).

Deno.test('postIdentityCreation mints a service identity'
    + ' with a hashed client_secret', async () => {
    const { db, ctx } = await setup();
    await postIdentityCreation(ctx, 'syWUUcdBSbBgMwBiCrgbDw', {
        kind: 'service', secret: 'top-secret',
    });
    const read = await assertRejects(
        () => GET<{ kind: string }>(
            db, 'identities/syWUUcdBSbBgMwBiCrgbDw',
            DEV_TOKEN, operationIdHeader(),
        ),
        RequestError,
    );
    assertStrictEquals(read.status, 403);
    assertStrictEquals(
        read.message,
        outside(
            'GET', '/identities/syWUUcdBSbBgMwBiCrgbDw',
        ) + ' ()',
    );
    const creds = await deriveCredentialsFor(db, 'syWUUcdBSbBgMwBiCrgbDw');
    const cred = creds.find(r => r.kind === 'client_secret');
    assert(cred, 'credential exists on message plane');
    assertStrictEquals(cred.status, 'set');
    assertNotStrictEquals(cred.secret, 'top-secret');
    assertStrictEquals(
        await verifyPassword('top-secret', cred.secret),
        true);
    await assertRejects(
        () => deriveIdentityPii(db, 'syWUUcdBSbBgMwBiCrgbDw'),
    );
});

Deno.test('a second service creation for the same id is 409'
    + ' and leaves exactly one client_secret head', async () => {
    const { db, ctx } = await setup();
    const spec = {
        kind: 'service' as const, secret: 'top-secret',
    };
    await postIdentityCreation(ctx, 'syWUUcdBSbBgMwBiCrgbDw', spec);
    const second = await assertRejects(
        () => postIdentityCreation(
            ctx, 'syWUUcdBSbBgMwBiCrgbDw', spec,
        ),
        RequestError,
    );
    assertStrictEquals(second.status, 409);
    const creds = (await deriveCredentialsFor(db, 'syWUUcdBSbBgMwBiCrgbDw'))
        .filter(r => r.kind === 'client_secret');
    assertStrictEquals(creds.length, 1);
});
