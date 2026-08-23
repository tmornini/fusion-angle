import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityEntity,
    validateIdentityPiiEntity,
} from '../api/validators.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { PUT, GET, DELETE, handleRequest } from '../api/api.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    generateIdentifier, NIL_IDENTIFIER,
} from '../shared/identifier.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

test('SYSTEM_MEMBER_ID is NIL_IDENTIFIER', () => {
    assert.equal(SYSTEM_MEMBER_ID, NIL_IDENTIFIER);
});

test('validateIdentityEntity accepts person/service', () => {
    assert.deepEqual(
        validateIdentityEntity({ kind: 'person' }),
        { kind: 'person' },
    );
    assert.deepEqual(
        validateIdentityEntity({ kind: 'service' }),
        { kind: 'service' },
    );
});

test('validateIdentityEntity rejects a partial profile', () => {
    assert.throws(
        () => validateIdentityEntity({
            kind: 'person', title: 'Engineer',
        }),
        /missing required key "department"/,
    );
    const whole = {
        kind: 'person',
        title: 'Engineer',
        department: 'Product',
        strengths: ['Leadership'],
        team_dimensions: { driver: 60 },
    };
    assert.deepEqual(
        validateIdentityEntity(whole), whole,
    );
});

test('validateIdentityEntity rejects bad kind', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'robot' }));
});

test('validateIdentityEntity rejects extra keys', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'person', name: 'x' }));
});

test('validateIdentityPiiEntity requires four fields', () => {
    assert.deepEqual(
        validateIdentityPiiEntity({
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        }),
        {
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        },
    );
});

test('validateIdentityPiiEntity rejects missing field', () => {
    assert.throws(() =>
        validateIdentityPiiEntity({
            name: 'x', email: 'y', phone: 'z',
        }));
});

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('PUT then GET an identity round-trips', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await PUT(
        db, 'identities/' + id, { kind: 'person' }, DEV_TOKEN);
    const got = await GET<{ id: string; kind: string }>(
        db, 'identities/' + id, DEV_TOKEN,
    );
    assert.deepEqual(got, { id, kind: 'person' });
});

test('bootstrap seeds an identity per member, id-equal',
async () => {
    const db = await freshDb();
    const { postBootstrap } =
        await import('../api/mock-data.ts');
    await postBootstrap(db);
    const sys = await GET<{ kind: string }>(
        db, 'identities/' + SYSTEM_MEMBER_ID, DEV_TOKEN);
    assert.equal(sys.kind, 'service');
    const cur = await GET<{ kind: string }>(
        db, 'identities/XXZruirZyAOoRpNxaDnpSA', DEV_TOKEN);
    assert.equal(cur.kind, 'person');
});

// ---- /identities/:id/pii subtree authz ----
// GET is self-or-admin; PUT/DELETE self-or-admin.
// A roleless member reads/writes its OWN pii; an admin
// reads or writes any. The flat identity-pii collection
// is retired (router 404).

const PII = {
    name: 'Sarah', email: 's@x.io', phone: 'p', bio: 'b',
};

// Below-facade pair formation (the member-fixtures.ts idiom):
// the pii-subtree authz below reads through the membership
// message plane once memberships flips, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw put this replaces — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    organization: string,
    identityId: string,
    at: string,
): Promise<void> {
    const body = {
        organization_id: organization,
        identity_id: identityId,
        type: identityId === 'XXZruirZyAOoRpNxaDnpSA' ? 'admin' : 'member',
        at,
    };
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

async function dbWithMember() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipPair(
        db, generateIdentifier(), 'AjdvjuECVZEgZoFajaIEkg',
        'toccYYkLEABmlbpHJalgtQ',
        '2026-06-08T00:00:00.000000Z',
    );
    await seedPersonIdentity(db, 'toccYYkLEABmlbpHJalgtQ', PII);
    return db;
}

function piiReq(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return new Request('http://localhost' + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

test('a member reads its own pii on the subtree', async () => {
    const db = await dbWithMember();
    const pii = await GET<{ name: string }>(
        db, 'identities/toccYYkLEABmlbpHJalgtQ/pii'
            , await devToken('toccYYkLEABmlbpHJalgtQ'));
    assert.equal(pii.name, 'Sarah');
});

test('a member cannot read another identity pii',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/pii',
        await devToken('toccYYkLEABmlbpHJalgtQ')));
    assert.equal(res.status, 403);
});

test('admin GET reads another identity nested pii',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'GET', '/identities/toccYYkLEABmlbpHJalgtQ/pii', DEV_TOKEN));
    assert.equal(res.status, 200);
    const pii = await res.json() as {
        name: string;
        email: string;
        phone: string;
        bio: string;
    };
    assert.equal(pii.name, PII.name);
    assert.equal(pii.email, PII.email);
    assert.equal(pii.phone, PII.phone);
    assert.equal(pii.bio, PII.bio);
});

test('a member writes its own pii', async () => {
    const db = await dbWithMember();
    await PUT(db, 'identities/toccYYkLEABmlbpHJalgtQ/pii',
        { ...PII, name: 'Sarah Lee' }
            , await devToken('toccYYkLEABmlbpHJalgtQ'));
    const pii = await GET<{ name: string }>(
        db, 'identities/toccYYkLEABmlbpHJalgtQ/pii'
            , await devToken('toccYYkLEABmlbpHJalgtQ'));
    assert.equal(pii.name, 'Sarah Lee');
});

test('an admin writes another identity pii', async () => {
    const db = await dbWithMember();
    await PUT(db, 'identities/toccYYkLEABmlbpHJalgtQ/pii',
        { ...PII, name: 'By Admin' }, DEV_TOKEN);
    const pii = await GET<{ name: string }>(
        db, 'identities/toccYYkLEABmlbpHJalgtQ/pii'
            , await devToken('toccYYkLEABmlbpHJalgtQ'));
    assert.equal(pii.name, 'By Admin');
});

test('a non-admin cannot write another identity pii',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/pii',
        await devToken('toccYYkLEABmlbpHJalgtQ'), PII));
    assert.equal(res.status, 403);
});

test('deleting pii on the subtree leaves the identity',
async () => {
    const db = await dbWithMember();
    await DELETE(db, 'identities/toccYYkLEABmlbpHJalgtQ/pii', DEV_TOKEN);
    const gone = await handleRequest(db, piiReq(
        'GET', '/identities/toccYYkLEABmlbpHJalgtQ/pii',
        await devToken('toccYYkLEABmlbpHJalgtQ')));
    assert.equal(gone.status, 404);
    const id = await GET<{ id: string }>(
        db, 'identities/toccYYkLEABmlbpHJalgtQ', DEV_TOKEN);
    assert.equal(id.id, 'toccYYkLEABmlbpHJalgtQ');
});
