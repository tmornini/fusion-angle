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
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';

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
    await PUT(
        db, 'identities/abc', { kind: 'person' }, DEV_TOKEN);
    const got = await GET<{ id: string; kind: string }>(
        db, 'identities/abc', DEV_TOKEN,
    );
    assert.deepEqual(got, { id: 'abc', kind: 'person' });
});

test('bootstrap seeds an identity per member, id-equal',
async () => {
    const db = await freshDb();
    const { postBootstrap } =
        await import('../api/mock-data.ts');
    await postBootstrap(db);
    const sys = await GET<{ kind: string }>(
        db, 'identities/system', DEV_TOKEN);
    assert.equal(sys.kind, 'service');
    const cur = await GET<{ kind: string }>(
        db, 'identities/current', DEV_TOKEN);
    assert.equal(cur.kind, 'person');
});

// ---- /identities/:id/pii subtree authz ----
// GET self-only (tree ownership); PUT/DELETE self-or-admin.
// A roleless member reads/writes its OWN pii; an admin manages
// any; nobody reads another's pii here (the roster reads the
// identity-pii COLLECTION).

const PII = {
    name: 'Sarah', email: 's@x.io', phone: 'p', bio: 'b',
};

// Below-facade pair formation (the member-fixtures.ts idiom):
// the pii-subtree authz below reads through the membership
// pair plane once memberships flips, so a raw row here would go
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
        at,
    };
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function dbWithMember() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);   // 'current' admin in org '1'
    await seedMembershipPair(
        db, 'm-sarah', '1', 'sarah',
        '2026-06-08T00:00:00.000000Z',
    );
    await seedPersonIdentity(db, 'sarah', PII);
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
        db, 'identities/sarah/pii', await devToken('sarah'));
    assert.equal(pii.name, 'Sarah');
});

test('a member cannot read another identity pii',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'GET', '/identities/current/pii',
        await devToken('sarah')));
    assert.equal(res.status, 403);
});

test('a GET of another pii is forbidden even for an admin',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'GET', '/identities/sarah/pii', DEV_TOKEN));
    assert.equal(res.status, 403);
});

test('a member writes its own pii', async () => {
    const db = await dbWithMember();
    await PUT(db, 'identities/sarah/pii',
        { ...PII, name: 'Sarah Lee' }, await devToken('sarah'));
    const pii = await GET<{ name: string }>(
        db, 'identities/sarah/pii', await devToken('sarah'));
    assert.equal(pii.name, 'Sarah Lee');
});

test('an admin writes another identity pii', async () => {
    const db = await dbWithMember();
    await PUT(db, 'identities/sarah/pii',
        { ...PII, name: 'By Admin' }, DEV_TOKEN);
    const pii = await GET<{ name: string }>(
        db, 'identities/sarah/pii', await devToken('sarah'));
    assert.equal(pii.name, 'By Admin');
});

test('a non-admin cannot write another identity pii',
async () => {
    const db = await dbWithMember();
    const res = await handleRequest(db, piiReq(
        'PUT', '/identities/current/pii',
        await devToken('sarah'), PII));
    assert.equal(res.status, 403);
});

test('deleting pii on the subtree leaves the identity',
async () => {
    const db = await dbWithMember();
    await DELETE(db, 'identities/sarah/pii', DEV_TOKEN);
    const gone = await handleRequest(db, piiReq(
        'GET', '/identities/sarah/pii',
        await devToken('sarah')));
    assert.equal(gone.status, 404);
    const id = await GET<{ id: string }>(
        db, 'identities/sarah', DEV_TOKEN);
    assert.equal(id.id, 'sarah');
});
