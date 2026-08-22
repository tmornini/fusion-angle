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
        () => deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.table === 'client_registration'
            && err.id === 'uWzjNIEeEtVWqZoJMLeYpw',
    );
});

test('a seeded registration derives whole, id-first',
async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    assert.deepEqual(
        await deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { id: 'uWzjNIEeEtVWqZoJMLeYpw', ...REGISTRATION },
    );
});

test('a re-PUT supersedes: the latest body wins', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    });
    const derived =
        await deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    assert.equal(derived.jwks, '{"keys":[{"kty":"EC"}]}');
});

test('a tombstoned registration reads as absent', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    await seedClientRegistrationTombstone(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    await assert.rejects(
        () => deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
        EntityNotFoundError,
    );
});

test('deriveIdentityKind: absent, person, service',
async () => {
    const db = await freshDb();
    assert.equal(
        await deriveIdentityKind(db, 'ghost'), undefined,
    );
    await seedPersonIdentity(db, 'pjQzgITAPDQVyvCVpzpIfQ', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    assert.equal(await deriveIdentityKind(db, 'pjQzgITAPDQVyvCVpzpIfQ')
        , 'person');
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    assert.equal(
        await deriveIdentityKind(db, 'uWzjNIEeEtVWqZoJMLeYpw'), 'service',
    );
});
