import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import { requestMessageHash } from '../api/message-form.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';
import { seedIdentityPii } from './identity-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Phase 8 Task 6: the invitation document plane — the grant's
// PUT-shaped invitation document (the entity minus id, NO email
// by construction) and the accept's PUT-shaped memberships
// document (the B2 closure: the third memberships writer to join
// the document plane, after the live PUT route and the seed).
// Neither document routes anywhere (Author gate 2 — the
// invitations side channel never joins the route table); both
// are storage-only.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows, so a raw identityPii.put is
// derivation-invisible. seedIdentityPii dual-writes the row
// AND the identities/:id/pii pair — id/field values stay
// identical; only the write mechanism changes.
async function person(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the invitation grant/accept authz below derives from the pair
// plane once role_grants/memberships flip, so a raw row here
// would go derivation-invisible. Every id/field value stays
// IDENTICAL to the raw puts these replace — only the write
// mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body.organization_id),
        String(body.identity_id),
        body.type as 'admin' | 'member',
        String(body.at),
    );
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // Phase Final Stage B: organizations table retired —
    // seed the tenant root on the pair plane.
    const { seedOrganizationDocument } = await import(
        './root-admin-fixture.ts'
    );
    await seedOrganizationDocument(db, '1', 'Stark');
    await seedMembershipPair(db, 'm-current-1', {
        organization_id: '1', identity_id: 'current',
        type: 'admin', at: AT,
    });
    await person(db, 'current', 'Tony', 'demo@example.com');
    await person(db, 'sarah', 'Sarah', 'sarah@x.com');
    return db;
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email = 'sarah@x.com',
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/1/invitations/',
        await organizationToken(),
        {
            email,
            invitationId,
            grantEventId: 'ev-grant-' + invitationId,
            grantAt: AT,
        },
    ));
}

// ── grant: the invitation document pair ──

test('a fresh grant appends 2 pairs — the operation and the'
+ ' invitation document, email ABSENT by construction',
async () => {
    const db = await freshDb();
    const res = await grant(db, 'inv-doc-1');
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    // 6: the fixture's own membership pair (Phase 13 Task 1;
    // role-grant retired), two identities/:id/pii pairs
    // (Phase 15 gate 6), the organizations/:id document
    // (Stage B), and the grant's own 2 pairs.
    assert.equal(requests.length, 6);
    const atAddress = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === 'inv-doc-1',
    );
    assert.equal(atAddress.length, 2);
    // The document head: the ONE PUT/2xx pair at this address —
    // documentPairsAt excludes the operation pair's POST method
    // by construction (design decision 6), so a match here IS
    // the document.
    const documents = documentPairsAt(
        requests, responses, '/invitations/',
    ).filter(pair => pair.uriId === 'inv-doc-1');
    assert.equal(documents.length, 1);
    const wire = documents[0]!.body;
    assert.deepEqual(
        Object.keys(wire).sort(),
        ['at', 'identity_id', 'organization_id'],
    );
    assert.equal(wire.organization_id, '1');
    assert.equal(wire.identity_id, 'sarah');
    assert.equal(wire.at, AT);
    assert.equal(wire.email, undefined);
});

test('a duplicate grant appends ONLY its operation pair — no'
+ ' phantom document at the duplicate\'s submitted id',
async () => {
    const db = await freshDb();
    const first = await grant(db, 'inv-doc-2a');
    assert.equal(first.status, 200);
    const second = await grant(db, 'inv-doc-2b');
    assert.equal(second.status, 200);
    const requests = await db.requests.getAll();
    const atDuplicateId = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === 'inv-doc-2b',
    );
    assert.equal(atDuplicateId.length, 1);
    const atFreshId = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === 'inv-doc-2a',
    );
    assert.equal(atFreshId.length, 2);
});

test('a failed (member-conflict) grant appends nothing',
async () => {
    const db = await freshDb();
    await seedMembershipPair(db, 'm-sarah-conflict', {
        organization_id: '1', identity_id: 'sarah',
        type: 'member', at: AT,
    });
    const res = await grant(db, 'inv-doc-fail');
    assert.equal(res.status, 409);
    // 5: the fixture's own membership pair, two
    // identities/:id/pii pairs (Phase 15 gate 6), the
    // organizations/:id document (Stage B), plus sarah's own
    // conflicting membership pair (Phase 13 Task 1) — the
    // failed grant appends nothing further. Role-grant retired.
    assert.equal((await db.requests.getAll()).length, 5);
    assert.equal((await db.responses.getAll()).length, 5);
});

// ── accept: the memberships document pair (the B2 closure) ──
// Distinct, strictly-increasing `at` stamps across grant/accept:
// both share ONE invitation entity_id in the states log, so a
// tied `at` would fall to the (at, id) reduction's id tie-break
// rather than genuinely proving which branch ran.

async function accept(
    db: MemoryDbAdapter,
    invitationId: string,
    membershipId: string,
    eventId: string,
    acceptAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT',
        '/identities/sarah/invitations/' + invitationId,
        await organizationToken('sarah', '1'),
        {
            state: 'accepted',
            membershipId,
            eventId,
            at: acceptAt,
        },
    ));
}

test('a fresh accept appends its seat document at the'
+ ' invitation-org members address', async () => {
    const db = await freshDb();
    await grant(db, 'inv-doc-3');
    const res = await accept(
        db, 'inv-doc-3', 'ms-doc-3', 'ev-acc-3',
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    const documents = documentPairsAt(
        requests, responses, '/organizations/1/members/',
    ).filter(pair => pair.uriId === 'sarah');
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0]!.body, {
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    });
    const got = await handleRequest(db, req(
        'GET', '/organizations/1/members/sarah',
        await organizationToken('current', '1'),
    ));
    assert.equal(got.status, 200);
    const acceptBody = {
        id: 'sarah',
        organization_id: '1',
        identity_id: 'sarah',
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    };
    assert.deepEqual(await got.json(), acceptBody);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/organizations/1/members/', 'sarah',
        ),
    );
    assert.deepEqual(stored, acceptBody);
});

test('a no-op re-accept appends no seat document',
async () => {
    const db = await freshDb();
    await grant(db, 'inv-doc-4');
    const first = await accept(
        db, 'inv-doc-4', 'ms-doc-4', 'ev-acc-4',
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(first.status, 204);
    const second = await accept(
        db, 'inv-doc-4', 'ms-doc-4b', 'ev-acc-4b',
        '2026-01-01T00:00:02.000000Z',
    );
    assert.equal(second.status, 409);
    const documents = (await db.requests.getAll()).filter(
        r => r.uri_collection === '/organizations/1/members/'
            && r.uri_id === 'sarah',
    );
    assert.equal(documents.length, 1);
});

// ── deriveInvitations: the message-plane reduction ──

async function declineFor(
    db: MemoryDbAdapter,
    invitationId: string,
    invitee: string,
    eventId: string,
    declineAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT',
        '/identities/' + invitee
            + '/invitations/' + invitationId,
        await organizationToken(invitee, '1'),
        {
            state: 'declined',
            eventId,
            at: declineAt,
        },
    ));
}

async function revokeFor(
    db: MemoryDbAdapter,
    invitationId: string,
    eventId: string,
    revokeAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT',
        '/organizations/1/invitations/' + invitationId,
        await organizationToken(),
        {
            state: 'revoked',
            eventId,
            at: revokeAt,
        },
    ));
}

test('deriveInvitations round-trips every terminal state:'
+ ' grant→pending, accept→accepted, decline→declined,'
+ ' revoke→revoked', async () => {
    const db = await freshDb();
    await person(db, 'bruce', 'Bruce', 'bruce@x.com');
    await person(db, 'clark', 'Clark', 'clark@x.com');
    await person(db, 'diana', 'Diana', 'diana@x.com');

    await grant(db, 'inv-derive-pending', 'sarah@x.com');

    await grant(db, 'inv-derive-accept', 'bruce@x.com');
    await handleRequest(db, req(
        'PUT',
        '/identities/bruce/invitations/inv-derive-accept',
        await organizationToken('bruce', '1'),
        {
            state: 'accepted',
            membershipId: 'ms-derive-bruce',
            eventId: 'ev-derive-acc',
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));

    await grant(db, 'inv-derive-decline', 'clark@x.com');
    await declineFor(
        db, 'inv-derive-decline', 'clark', 'ev-derive-dec',
        '2026-01-01T00:00:01.000000Z',
    );

    await grant(db, 'inv-derive-revoke', 'diana@x.com');
    await revokeFor(
        db, 'inv-derive-revoke', 'ev-derive-rev',
        '2026-01-01T00:00:01.000000Z',
    );

    const derived = await deriveInvitations(db);
    const byId = new Map(derived.map(row => [row.id, row]));
    assert.equal(
        byId.get('inv-derive-pending')?.state, 'pending');
    assert.equal(
        byId.get('inv-derive-accept')?.state, 'accepted');
    assert.equal(
        byId.get('inv-derive-decline')?.state, 'declined');
    assert.equal(
        byId.get('inv-derive-revoke')?.state, 'revoked');
    // id-lex ordered (byIdAscending, the IndexedDB reference).
    const ids = derived.map(row => row.id);
    assert.deepEqual(ids, [...ids].sort());
});

test('a no-op replay changes nothing deriveInvitations reads',
async () => {
    const db = await freshDb();
    await grant(db, 'inv-derive-replay');
    const before = await deriveInvitations(db);
    await grant(db, 'inv-derive-replay');   // byte-identical resend
    const after = await deriveInvitations(db);
    assert.deepEqual(after, before);
});

test('every stored invitation-family message verifies against'
+ ' its hash, and requests/responses stay balanced across a'
+ ' full grant→accept→decline mix', async () => {
    const db = await freshDb();
    await person(db, 'bruce', 'Bruce', 'bruce@x.com');
    await person(db, 'clark', 'Clark', 'clark@x.com');
    await grant(db, 'inv-balance-1', 'sarah@x.com');
    await grant(db, 'inv-balance-2', 'bruce@x.com');
    await handleRequest(db, req(
        'PUT',
        '/identities/bruce/invitations/inv-balance-2',
        await organizationToken('bruce', '1'),
        {
            state: 'accepted',
            membershipId: 'ms-balance-2',
            eventId: 'ev-balance-acc',
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    await grant(db, 'inv-balance-3', 'clark@x.com');
    await declineFor(
        db, 'inv-balance-3', 'clark', 'ev-balance-dec',
        '2026-01-01T00:00:01.000000Z',
    );
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    // 3 grants x 2 (operation + invitation document) + 1 accept
    // x 2 (operation + memberships document) + 1 decline x 1
    // (operation only — decline synthesizes no document) = 9,
    // plus the fixture's own membership pair (Phase 13
    // Task 1; role-grant retired), four identities/:id/pii
    // pairs (current, sarah, bruce, clark — Phase 15 gate 6),
    // and the organizations/:id document (Stage B) = 15.
    assert.equal(requests.length, 15);
    assert.equal(responses.length, 15);
    for (const row of requests) {
        assert.equal(
            await requestMessageHash(row.message),
            row.message_hash,
        );
    }
});
