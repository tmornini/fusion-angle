import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    handleRequest, UnauthorizedError, RequestError,
} from '../api/api.ts';
import { PUT, GET, DELETE } from './in-page-facade.ts';
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
    apiRequest,
} from './http-fixtures.ts';
import {
    deriveClientRegistration,
} from '../api/derive-identity-spine.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


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

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function rejectsWithStatus(
    fn: () => Promise<unknown>,
    status: number,
): Promise<void> {
    const err = await assertRejects(fn) as RequestError;
    assertInstanceOf(err, RequestError);
    assertStrictEquals(err.status, status);
}

async function rejectsOutside(
    fn: () => Promise<unknown>,
    method: string,
    path: string,
): Promise<void> {
    const err = await assertRejects(fn, RequestError);
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside(method, path) + ' ()',
    );
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
            operationIdHeader()),
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
            { ...REGISTRATION }, memberToken,
            operationIdHeader()),
        403,
    );
});

const SERVICE = 'uWzjNIEeEtVWqZoJMLeYpw';
const PERSON = 'pjQzgITAPDQVyvCVpzpIfQ';

Deno.test('an absent identity registration is forbidden',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const path = '/identities/' + id + '/registration';
    const before = (await db.messagePairs.getAll()).length;
    await rejectsOutside(
        () => PUT(
            db, 'identities/' + id + '/registration',
            { ...REGISTRATION }, DEV_TOKEN,
            operationIdHeader(),
        ),
        'PUT', path,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a membership-less person registration is forbidden',
async () => {
    const db = await freshDb();
    await seedPersonIdentity(db, PERSON, {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    const path = '/identities/' + PERSON + '/registration';
    await rejectsOutside(
        () => PUT(
            db, 'identities/' + PERSON + '/registration',
            { ...REGISTRATION }, DEV_TOKEN,
            operationIdHeader(),
        ),
        'PUT', path,
    );
});

Deno.test('a rogue registration body on a membership-less'
    + ' service is forbidden',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, SERVICE);
    const path = '/identities/' + SERVICE + '/registration';
    await rejectsOutside(
        () => PUT(
            db, 'identities/' + SERVICE + '/registration',
            { ...REGISTRATION, rogue: 'x' }, DEV_TOKEN,
            operationIdHeader(),
        ),
        'PUT', path,
    );
});

Deno.test('registering a membership-less service is forbidden',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, SERVICE);
    const path = '/identities/' + SERVICE + '/registration';
    const before = (await db.messagePairs.getAll()).length;
    await rejectsOutside(
        () => PUT(
            db, 'identities/' + SERVICE + '/registration',
            { ...REGISTRATION }, DEV_TOKEN,
            operationIdHeader(),
        ),
        'PUT', path,
    );
    await rejectsOutside(
        () => GET(
            db, 'identities/' + SERVICE + '/registration',
            DEV_TOKEN, operationIdHeader(),
        ),
        'GET', path,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    await assertRejects(
        () => deriveClientRegistration(db, SERVICE),
    );
});

Deno.test('a membership-less service has no registration'
    + ' to read',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, SERVICE);
    const path = '/identities/' + SERVICE + '/registration';
    await rejectsOutside(
        () => GET(
            db, 'identities/' + SERVICE + '/registration',
            DEV_TOKEN, operationIdHeader(),
        ),
        'GET', path,
    );
});

Deno.test('deregistering a membership-less service is'
    + ' forbidden',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, SERVICE);
    const path = '/identities/' + SERVICE + '/registration';
    const prefix = path + '/';
    const before = (await db.messagePairs.getAll()).filter(
        (row) => row.path === prefix,
    ).length;
    await rejectsOutside(
        () => PUT(
            db, 'identities/' + SERVICE + '/registration',
            { ...REGISTRATION }, DEV_TOKEN,
            operationIdHeader(),
        ),
        'PUT', path,
    );
    await rejectsOutside(
        () => DELETE(
            db, 'identities/' + SERVICE + '/registration',
            DEV_TOKEN, operationIdHeader(),
        ),
        'DELETE', path,
    );
    const after = (await db.messagePairs.getAll()).filter(
        (row) => row.path === prefix,
    );
    assertStrictEquals(after.length, before);
});

Deno.test('a membership-less registration stores nothing',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, SERVICE);
    const path = '/identities/' + SERVICE + '/registration';
    const before = (await db.messagePairs.getAll()).length;
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path,
        token: DEV_TOKEN,
        body: { ...REGISTRATION },
    }));
    assertStrictEquals(put.status, 403);
    assertEquals(await put.json(), {
        error: outside('PUT', path),
    });
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(got.status, 403);
    assertEquals(await got.json(), {
        error: outside('GET', path),
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
