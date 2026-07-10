import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { verifyPassword } from '../shared/password-hash.ts';
import {
    postIdentityCreation,
} from '../web-app/app/adapters/identities.ts';
import {
    deriveIdentityPii,
    deriveCredentialsFor,
} from '../api/derive-identity-spine.ts';
import { GET } from '../api/api.ts';
import { DEV_TOKEN } from './token-fixtures.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: createRequestContext(db, await devToken()),
    };
}

// Phase Final Task 2: identities / identity_pii /
// identity_credentials ROW halves stripped — oracles are the
// pair plane (GET + derive).

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
    const identity = await GET<{ kind: string }>(
        db, 'identities/i1', DEV_TOKEN,
    );
    assert.equal(identity.kind, 'person');
    const pii = await deriveIdentityPii(db, 'i1');
    assert.equal(pii.email, 'pat@example.com');
    // Phase Final Stage B: identity spine tables retired.
    // Phase Final Stage B: identity spine tables retired.
});

test('postIdentityCreation mints a service identity'
    + ' with a hashed client_secret', async () => {
    const { db, ctx } = await setup();
    await postIdentityCreation(ctx, 's1', {
        kind: 'service', secret: 'top-secret',
    });
    const identity = await GET<{ kind: string }>(
        db, 'identities/s1', DEV_TOKEN,
    );
    assert.equal(identity.kind, 'service');
    const creds = await deriveCredentialsFor(db, 's1');
    const cred = creds.find(r => r.kind === 'client_secret');
    assert.ok(cred, 'credential exists on pair plane');
    assert.equal(cred.status, 'set');
    assert.notEqual(cred.secret, 'top-secret');
    assert.equal(
        await verifyPassword('top-secret', cred.secret),
        true);
    await assert.rejects(
        () => deriveIdentityPii(db, 's1'),
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
    // Pair-plane document at identities/:id is one head.
    const identity = await GET<{ kind: string }>(
        db, 'identities/i1', DEV_TOKEN,
    );
    assert.equal(identity.kind, 'person');
    const pii = await deriveIdentityPii(db, 'i1');
    assert.equal(pii.email, 'a@example.com');
});

test('two service creations for the same id leave'
    + ' exactly one client_secret head', async () => {
    const { db, ctx } = await setup();
    const spec = {
        kind: 'service' as const, secret: 'top-secret',
    };
    await postIdentityCreation(ctx, 's1', spec);
    await postIdentityCreation(ctx, 's1', spec);
    const creds = (await deriveCredentialsFor(db, 's1'))
        .filter(r => r.kind === 'client_secret');
    assert.equal(creds.length, 1);
});
