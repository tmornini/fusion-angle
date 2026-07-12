import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    PUT, GET, DELETE,
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
    await DELETE(db, 'identities/svc-1/registration',
        DEV_TOKEN);
    await assert.rejects(
        () => GET(db, 'identities/svc-1/registration',
            DEV_TOKEN),
        rejectsWithStatus(404),
    );
});
