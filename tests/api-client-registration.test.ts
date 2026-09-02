import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    PUT, GET, DELETE, handleRequest,
    UnauthorizedError, RequestError,
} from '../api/api.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    seedOrganizationMember,
} from './root-admin-fixture.ts';
import {
    seedServiceIdentity,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';
import {
    deriveClientRegistration,
    registrationEntityOf,
} from '../api/derive-identity-spine.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const REGISTRATION = {
    grant_types: 'client_credentials',
    redirect_uris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-angle',
    status: 'active',
};

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function rejectsWithStatus(
    fn: () => Promise<unknown>,
    status: number,
): Promise<void> {
    const err = await assertRejects(fn) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, status);
}

Deno.test('unauthenticated registration access is 401,'
+ ' even for an unknown identity (401 before 404)',
async () => {
    const db = await freshDb();
    await assertRejects(
        () => GET(
            db,
            'identities/' + generateIdentifier()
                + '/registration',
            'not-a-token',
        ),
        UnauthorizedError,
    );
});

Deno.test('a member-tier caller is 403 (admin realm)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    const peonId = generateIdentifier();
    await seedOrganizationMember(db, peonId);
    const memberToken = await devToken(peonId);
    await rejectsWithStatus(
        () => PUT(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
            { ...REGISTRATION }, memberToken),
        403,
    );
});

Deno.test('an absent identity is 404', async () => {
    const db = await freshDb();
    await rejectsWithStatus(
        () => PUT(
            db,
            'identities/' + generateIdentifier()
                + '/registration',
            { ...REGISTRATION }, DEV_TOKEN,
        ),
        404,
    );
});

Deno.test("a kind-'person' identity is 400", async () => {
    const db = await freshDb();
    await seedPersonIdentity(db, 'pjQzgITAPDQVyvCVpzpIfQ', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    await rejectsWithStatus(
        () => PUT(db, 'identities/pjQzgITAPDQVyvCVpzpIfQ/registration',
            { ...REGISTRATION }, DEV_TOKEN),
        400,
    );
});

Deno.test('a rogue body key is 400 (validator at the gate)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    await rejectsWithStatus(
        () => PUT(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
            { ...REGISTRATION, rogue: 'x' }, DEV_TOKEN),
        400,
    );
});

Deno.test('PUT registers; GET reads it back; a second PUT'
+ ' overwrites (rotate-JWKS)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    const put = await PUT<Record<string, unknown>>(
        db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
        { ...REGISTRATION }, DEV_TOKEN,
    );
    assertEquals(put, { id: 'uWzjNIEeEtVWqZoJMLeYpw', ...REGISTRATION });
    const got = await GET<Record<string, unknown>>(
        db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration', DEV_TOKEN,
    );
    assertEquals(got, { id: 'uWzjNIEeEtVWqZoJMLeYpw', ...REGISTRATION });
    const rotated = {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    };
    await PUT(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
        { ...rotated }, DEV_TOKEN);
    const reread = await GET<{ jwks: string }>(
        db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration', DEV_TOKEN,
    );
    assertStrictEquals(reread.jwks, rotated.jwks);
});

Deno.test('GET with no registration yet is 404 (identity'
+ ' exists)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    await rejectsWithStatus(
        () => GET(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
            DEV_TOKEN),
        404,
    );
});

Deno.test('DELETE deregisters: a marked tombstone, then 404',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    await PUT(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
        { ...REGISTRATION }, DEV_TOKEN);
    const prefix = '/identities/uWzjNIEeEtVWqZoJMLeYpw/registration/';
    const afterPut = (await db.messagePairs.getAll()).filter(
        (row) => row.uri_collection === prefix,
    );
    assertStrictEquals(afterPut.length, 1);
    await DELETE(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
        DEV_TOKEN);
    const afterDel = (await db.messagePairs.getAll()).filter(
        (row) => row.uri_collection === prefix,
    );
    // G5: DELETE appends a tombstone; it does not replace
    // the prior pair the way /pii does.
    assertStrictEquals(afterDel.length, 2);
    assertStrictEquals(
        afterDel.filter((row) => row.method === 'PUT').length,
        1,
    );
    assertStrictEquals(
        afterDel.filter((row) => row.method === 'DELETE')
            .length,
        1,
    );
    await rejectsWithStatus(
        () => GET(db, 'identities/uWzjNIEeEtVWqZoJMLeYpw/registration',
            DEV_TOKEN),
        404,
    );
});

// G5: stored PUT = registrationEntityOf (GET derive).
Deno.test('stored PUT body equals registrationEntityOf',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'uWzjNIEeEtVWqZoJMLeYpw');
    const id = 'uWzjNIEeEtVWqZoJMLeYpw';
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + id + '/registration',
        token: DEV_TOKEN,
        body: { ...REGISTRATION },
        operationId: TEST_OPERATION_ID,
    }));
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/' + id + '/registration/', '',
        ),
    );
    const expected = registrationEntityOf(id, {
        uriId: '',
        messagePairId: id,
        method: 'PUT',
        body: { ...REGISTRATION },
    });
    assertStrictEquals(Object.keys(expected)[0], 'id');
    assertEquals(stored, expected);
    assertEquals(
        stored, await deriveClientRegistration(db, id),
    );
    assertEquals(stored, await put.json());
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/registration',
        token: DEV_TOKEN,
        operationId: TEST_OPERATION_ID,
    }));
    assertStrictEquals(got.status, 200);
    assertEquals(stored, await got.json());
});
