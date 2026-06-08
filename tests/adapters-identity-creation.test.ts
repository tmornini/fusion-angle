import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { verifyPassword } from '../api/password-hash.ts';
import {
    postIdentityCreation,
} from '../web-app/app/adapters/identities.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: createRequestContext(db, await devToken()),
    };
}

test('postIdentityCreation mints a person identity'
    + ' with PII', async () => {
    const { db, ctx } = await setup();
    await postIdentityCreation(ctx, 'i1', {
        kind: 'person',
        pii: {
            name: 'Pat', email: 'pat@example.com',
            phone: '555-0100', bio: 'bio',
        },
    });
    const identity = await db.identities.getById('i1');
    assert.equal(identity.kind, 'person');
    const pii = (await db.identityPii.getAll())
        .find(r => r.id === 'i1');
    assert.ok(pii, 'pii row exists');
    assert.equal(pii.email, 'pat@example.com');
});

test('postIdentityCreation mints a service identity'
    + ' with a hashed client_secret', async () => {
    const { db, ctx } = await setup();
    await postIdentityCreation(ctx, 's1', {
        kind: 'service', secret: 'top-secret',
    });
    const identity = await db.identities.getById('s1');
    assert.equal(identity.kind, 'service');
    const cred = (await db.identityCredentials.getAll())
        .find(r => r.identity_id === 's1');
    assert.ok(cred, 'credential row exists');
    assert.equal(cred.kind, 'client_secret');
    assert.equal(cred.status, 'set');
    assert.notEqual(cred.secret, 'top-secret');
    assert.equal(
        await verifyPassword('top-secret', cred.secret),
        true);
    const pii = (await db.identityPii.getAll())
        .find(r => r.id === 's1');
    assert.equal(
        pii, undefined,
        'service identity carries no pii',
    );
});

test('postIdentityCreation is idempotent on re-put',
async () => {
    const { db, ctx } = await setup();
    const spec = {
        kind: 'person' as const,
        pii: {
            name: 'A', email: 'a@example.com',
            phone: '1', bio: 'b',
        },
    };
    await postIdentityCreation(ctx, 'i1', spec);
    await postIdentityCreation(ctx, 'i1', spec);
    const dupes = (await db.identities.getAll())
        .filter(r => r.id === 'i1');
    assert.equal(dupes.length, 1);
});

test('two service creations for the same id leave'
    + ' exactly one client_secret row', async () => {
    const { db, ctx } = await setup();
    const spec = {
        kind: 'service' as const, secret: 'top-secret',
    };
    await postIdentityCreation(ctx, 's1', spec);
    await postIdentityCreation(ctx, 's1', spec);
    const creds = (await db.identityCredentials.getAll())
        .filter(r => r.identity_id === 's1'
            && r.kind === 'client_secret');
    assert.equal(creds.length, 1);
});
