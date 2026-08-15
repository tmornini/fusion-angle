import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const REGISTRATION = {
    grant_types: 'client_credentials',
    redirect_uris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-ai-web',
    status: 'active',
};

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function rejectsWithStatus(status: number) {
    return (err: unknown) =>
        err instanceof RequestError
        && err.status === status;
}

test('unauthenticated registration access is 401,'
+ ' even for an unknown identity (401 before 404)',
async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'identities/ghost/registration',
            'not-a-token'),
        UnauthorizedError,
    );
});

test('a member-tier caller is 403 (admin realm)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await seedOrganizationMember(db, 'peon');
    const memberToken = await devToken('peon');
    await assert.rejects(
        () => PUT(db, 'identities/svc-1/registration',
            { ...REGISTRATION }, memberToken),
        rejectsWithStatus(403),
    );
});

test('an absent identity is 404', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => PUT(db, 'identities/ghost/registration',
            { ...REGISTRATION }, DEV_TOKEN),
        rejectsWithStatus(404),
    );
});

test("a kind-'person' identity is 400", async () => {
    const db = await freshDb();
    await seedPersonIdentity(db, 'p-1', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    await assert.rejects(
        () => PUT(db, 'identities/p-1/registration',
            { ...REGISTRATION }, DEV_TOKEN),
        rejectsWithStatus(400),
    );
});

test('a rogue body key is 400 (validator at the gate)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await assert.rejects(
        () => PUT(db, 'identities/svc-1/registration',
            { ...REGISTRATION, rogue: 'x' }, DEV_TOKEN),
        rejectsWithStatus(400),
    );
});

test('PUT registers; GET reads it back; a second PUT'
+ ' overwrites (rotate-JWKS)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    const put = await PUT<Record<string, unknown>>(
        db, 'identities/svc-1/registration',
        { ...REGISTRATION }, DEV_TOKEN,
    );
    assert.deepEqual(put, { id: 'svc-1', ...REGISTRATION });
    const got = await GET<Record<string, unknown>>(
        db, 'identities/svc-1/registration', DEV_TOKEN,
    );
    assert.deepEqual(got, { id: 'svc-1', ...REGISTRATION });
    const rotated = {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    };
    await PUT(db, 'identities/svc-1/registration',
        { ...rotated }, DEV_TOKEN);
    const reread = await GET<{ jwks: string }>(
        db, 'identities/svc-1/registration', DEV_TOKEN,
    );
    assert.equal(reread.jwks, rotated.jwks);
});

test('GET with no registration yet is 404 (identity'
+ ' exists)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await assert.rejects(
        () => GET(db, 'identities/svc-1/registration',
            DEV_TOKEN),
        rejectsWithStatus(404),
    );
});

test('DELETE deregisters: a marked tombstone, then 404',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await PUT(db, 'identities/svc-1/registration',
        { ...REGISTRATION }, DEV_TOKEN);
    const prefix = '/identities/svc-1/registration/';
    const afterPut = (await db.requests.getAll()).filter(
        (row) => row.uri_collection === prefix,
    );
    assert.equal(afterPut.length, 1);
    await DELETE(db, 'identities/svc-1/registration',
        DEV_TOKEN);
    const afterDel = (await db.requests.getAll()).filter(
        (row) => row.uri_collection === prefix,
    );
    // G5: DELETE appends a tombstone; it does not replace
    // the prior pair the way /pii does.
    assert.equal(afterDel.length, 2);
    assert.equal(
        afterDel.filter((row) => row.method === 'PUT').length,
        1,
    );
    assert.equal(
        afterDel.filter((row) => row.method === 'DELETE')
            .length,
        1,
    );
    await assert.rejects(
        () => GET(db, 'identities/svc-1/registration',
            DEV_TOKEN),
        rejectsWithStatus(404),
    );
});

// G5: stored PUT = registrationEntityOf (GET derive).
test('stored PUT body equals registrationEntityOf',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    const id = 'svc-1';
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/' + id + '/registration',
        token: DEV_TOKEN,
        body: { ...REGISTRATION },
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/' + id + '/registration/', '',
        ),
    );
    const expected = registrationEntityOf(id, {
        uriId: '',
        pairId: id,
        method: 'PUT',
        body: { ...REGISTRATION },
    });
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored, await deriveClientRegistration(db, id),
    );
    assert.deepEqual(stored, await put.json());
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/registration',
        token: DEV_TOKEN,
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(got.status, 200);
    assert.deepEqual(stored, await got.json());
});
