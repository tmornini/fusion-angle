import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { EntityNotFoundError } from '../api/db.ts';
import {
    deriveClientRegistration,
    deriveIdentityKind,
} from '../api/derive-identity-spine.ts';
import {
    seedServiceIdentity,
    seedPersonIdentity,
    seedClientRegistration,
    seedClientRegistrationTombstone,
} from './identity-fixtures.ts';

const REGISTRATION = {
    grant_types: 'client_credentials',
    redirect_uris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-angle',
    status: 'active',
};

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

test('an absent registration throws EntityNotFoundError',
async () => {
    const db = await freshDb();
    await assert.rejects(
        () => deriveClientRegistration(db, 'svc-1'),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.table === 'client_registration'
            && err.id === 'svc-1',
    );
});

test('a seeded registration derives whole, id-first',
async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    assert.deepEqual(
        await deriveClientRegistration(db, 'svc-1'),
        { id: 'svc-1', ...REGISTRATION },
    );
});

test('a re-PUT supersedes: the latest body wins', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    await seedClientRegistration(db, 'svc-1', {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    });
    const derived =
        await deriveClientRegistration(db, 'svc-1');
    assert.equal(derived.jwks, '{"keys":[{"kty":"EC"}]}');
});

test('a tombstoned registration reads as absent', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    await seedClientRegistrationTombstone(db, 'svc-1');
    await assert.rejects(
        () => deriveClientRegistration(db, 'svc-1'),
        EntityNotFoundError,
    );
});

test('deriveIdentityKind: absent, person, service',
async () => {
    const db = await freshDb();
    assert.equal(
        await deriveIdentityKind(db, 'ghost'), undefined,
    );
    await seedPersonIdentity(db, 'p-1', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    assert.equal(await deriveIdentityKind(db, 'p-1'), 'person');
    await seedServiceIdentity(db, 'svc-1');
    assert.equal(
        await deriveIdentityKind(db, 'svc-1'), 'service',
    );
});
