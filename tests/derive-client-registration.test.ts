import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
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

Deno.test('an absent registration throws EntityNotFoundError',
async () => {
    const db = await freshDb();
    const err = await assertRejects(
        () => deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
    ) as EntityNotFoundError;
    assertInstanceOf(err, EntityNotFoundError);
    assertStrictEquals(err.table, 'client_registration');
    assertStrictEquals(err.id, 'uWzjNIEeEtVWqZoJMLeYpw');
});

Deno.test('a seeded registration derives whole, id-first',
async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    assertEquals(
        await deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
        { id: 'uWzjNIEeEtVWqZoJMLeYpw', ...REGISTRATION },
    );
});

Deno.test('a re-PUT supersedes: the latest body wins', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    });
    const derived =
        await deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    assertStrictEquals(derived.jwks, '{"keys":[{"kty":"EC"}]}');
});

Deno.test('a tombstoned registration reads as absent', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw', REGISTRATION);
    await seedClientRegistrationTombstone(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    await assertRejects(
        () => deriveClientRegistration(db, 'uWzjNIEeEtVWqZoJMLeYpw'),
        EntityNotFoundError,
    );
});

Deno.test('deriveIdentityKind: absent, person, service',
async () => {
    const db = await freshDb();
    assertStrictEquals(
        await deriveIdentityKind(db, 'ghost'), undefined,
    );
    await seedPersonIdentity(db, 'pjQzgITAPDQVyvCVpzpIfQ', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    assertStrictEquals(await deriveIdentityKind(db, 'pjQzgITAPDQVyvCVpzpIfQ')
        , 'person');
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    assertStrictEquals(
        await deriveIdentityKind(db, 'uWzjNIEeEtVWqZoJMLeYpw'), 'service',
    );
});
