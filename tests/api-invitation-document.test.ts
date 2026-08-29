import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import { requestMessageHash } from '../api/message-form.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';
import { seedIdentityPii } from './identity-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    generateIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';

// Phase 8 Task 6: the invitation document plane — the grant's
// PUT-shaped invitation document (the entity minus id, NO email
// by construction) and the accept's PUT-shaped memberships
// document (the B2 closure: the third memberships writer to join
// the document plane, after the live PUT route and the seed).
// Neither document routes anywhere (Author gate 2 — the
// invitations side channel never joins the route table); both
// are storage-only.

const AT = '2026-01-01T00:00:00.000000Z';
const INV_DOC_1 = generateIdentifier();
const INV_DOC_2A = generateIdentifier();
const INV_DOC_2B = generateIdentifier();
const INV_DOC_FAIL = generateIdentifier();
const INV_DOC_3 = generateIdentifier();
const MS_DOC_3 = generateIdentifier();
const EV_ACC_3 = generateIdentifier();
const INV_DOC_4 = generateIdentifier();
const MS_DOC_4 = generateIdentifier();
const EV_ACC_4 = generateIdentifier();
const MS_DOC_4B = generateIdentifier();
const EV_ACC_4B = generateIdentifier();
const BRUCE = generateIdentifier();
const CLARK = generateIdentifier();
const DIANA = generateIdentifier();
const INV_DERIVE_PENDING = generateIdentifier();
const INV_DERIVE_DECLINE = generateIdentifier();
const INV_DERIVE_REVOKE = generateIdentifier();
const MS_DERIVE_BRUCE = generateIdentifier();
const EV_DERIVE_ACC = generateIdentifier();
const EV_DERIVE_DEC = generateIdentifier();
const EV_DERIVE_REV = generateIdentifier();
const INV_DERIVE_REPLAY = generateIdentifier();
const INV_BALANCE_1 = generateIdentifier();
const INV_BALANCE_3 = generateIdentifier();
const MS_BALANCE_2 = generateIdentifier();
const EV_BALANCE_ACC = generateIdentifier();
const EV_BALANCE_DEC = generateIdentifier();

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
// the invitation grant/accept authz below derives from the message
// plane once role_grants/memberships flip, so a raw row here
// would go derivation-invisible. Every id/field value stays
// IDENTICAL to the raw puts these replace — only the write
// mechanism changes.
async function seedMembershipMessagePair(
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
    // seed the tenant root on the message plane.
    const { seedOrganizationDocument } = await import(
        './root-admin-fixture.ts'
    );
    await seedOrganizationDocument(db, 'AjdvjuECVZEgZoFajaIEkg', 'Stark');
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin', at: AT,
    });
    await person(db, 'XXZruirZyAOoRpNxaDnpSA', 'Tony', 'demo@example.com');
    await person(db, 'toccYYkLEABmlbpHJalgtQ', 'Sarah', 'sarah@x.com');
    return db;
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email = 'sarah@x.com',
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
        await organizationToken(),
        {
            email,
            invitationId,
            grantEventId: 'ev-grant-' + invitationId,
            grantAt: AT,
        },
    ));
}

// ── grant: the invitation document message pair ──

test('a fresh grant appends 2 pairs — the operation and the'
+ ' invitation document, email ABSENT by construction',
async () => {
    const db = await freshDb();
    const res = await grant(db, INV_DOC_1);
    assert.equal(res.status, 200);
    const requests = await db.messagePairs.getAll();
    // 6: the fixture's own membership pair (Phase 13 Task 1;
    // role-grant retired), two identities/:id/pii pairs
    // (Phase 15 gate 6), the organizations/:id document
    // (Stage B), and the grant's own 2 pairs.
    assert.equal(requests.length, 6);
    const atAddress = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === INV_DOC_1,
    );
    assert.equal(atAddress.length, 2);
    // The document head: the ONE PUT/2xx pair at this address —
    // documentMessagePairsAt excludes the operation message pair's POST
    // method by construction (design decision 6), so a match
    // here IS the document.
    const documents = documentMessagePairsAt(
        requests, '/invitations/',
    ).filter(messagePair => messagePair.uriId === INV_DOC_1);
    assert.equal(documents.length, 1);
    const wire = documents[0]!.body;
    assert.deepEqual(
        Object.keys(wire).sort(),
        ['at', 'identity_id', 'organization_id'],
    );
    assert.equal(wire.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assert.equal(wire.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    assert.equal(wire.at, AT);
    assert.equal(wire.email, undefined);
});

test('a duplicate grant appends ONLY its operation message pair — no'
+ ' phantom document at the duplicate\'s submitted id',
async () => {
    const db = await freshDb();
    const first = await grant(db, INV_DOC_2A);
    assert.equal(first.status, 200);
    const second = await grant(db, INV_DOC_2B);
    assert.equal(second.status, 200);
    const requests = await db.messagePairs.getAll();
    const atDuplicateId = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === INV_DOC_2B,
    );
    assert.equal(atDuplicateId.length, 1);
    const atFreshId = requests.filter(
        r => r.uri_collection === '/invitations/'
            && r.uri_id === INV_DOC_2A,
    );
    assert.equal(atFreshId.length, 2);
});

test('a failed (member-conflict) grant appends nothing',
async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member', at: AT,
    });
    const res = await grant(db, INV_DOC_FAIL);
    assert.equal(res.status, 409);
    // 5: the fixture's own membership pair, two
    // identities/:id/pii pairs (Phase 15 gate 6), the
    // organizations/:id document (Stage B), plus toccYYkLEABmlbpHJalgtQ's own
    // conflicting membership pair (Phase 13 Task 1) — the
    // failed grant appends nothing further. Role-grant retired.
    assert.equal((await db.messagePairs.getAll()).length, 5);
    assert.equal((await db.messagePairs.getAll()).length, 5);
});

// ── accept: the memberships document message pair
// (the B2 closure) ──
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
        '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + invitationId,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
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
    await grant(db, INV_DOC_3);
    const res = await accept(
        db, INV_DOC_3, MS_DOC_3, EV_ACC_3,
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(res.status, 204);
    const requests = await db.messagePairs.getAll();
    const documents = documentMessagePairsAt(
        requests, '/organizations/AjdvjuECVZEgZoFajaIEkg/members/',
    ).filter(
        messagePair => messagePair.uriId === 'toccYYkLEABmlbpHJalgtQ',
    );
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0]!.body, {
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    });
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'toccYYkLEABmlbpHJalgtQ',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg'),
    ));
    assert.equal(got.status, 200);
    const acceptBody = {
        id: 'toccYYkLEABmlbpHJalgtQ',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    };
    assert.deepEqual(await got.json(), acceptBody);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                , 'toccYYkLEABmlbpHJalgtQ',
        ),
    );
    assert.deepEqual(stored, acceptBody);
});

test('a no-op re-accept appends no seat document',
async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_4);
    const first = await accept(
        db, INV_DOC_4, MS_DOC_4, EV_ACC_4,
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(first.status, 204);
    const second = await accept(
        db, INV_DOC_4, MS_DOC_4B, EV_ACC_4B,
        '2026-01-01T00:00:02.000000Z',
    );
    assert.equal(second.status, 204);
    const documents = (await db.messagePairs.getAll()).filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/'
            && r.uri_id === 'toccYYkLEABmlbpHJalgtQ',
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
        await organizationToken(invitee, 'AjdvjuECVZEgZoFajaIEkg'),
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
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/' + invitationId,
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
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await person(db, DIANA, 'Diana', 'diana@x.com');

    await grant(db, INV_DERIVE_PENDING, 'sarah@x.com');

    await grant(db, 'hkbiAljVBMHiLoGwiWjaaw', 'bruce@x.com');
    await handleRequest(db, req(
        'PUT',
        '/identities/' + BRUCE
            + '/invitations/hkbiAljVBMHiLoGwiWjaaw',
        await organizationToken(BRUCE, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_DERIVE_BRUCE,
            eventId: EV_DERIVE_ACC,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));

    await grant(db, INV_DERIVE_DECLINE, 'clark@x.com');
    await declineFor(
        db, INV_DERIVE_DECLINE, CLARK, EV_DERIVE_DEC,
        '2026-01-01T00:00:01.000000Z',
    );

    await grant(db, INV_DERIVE_REVOKE, 'diana@x.com');
    await revokeFor(
        db, INV_DERIVE_REVOKE, EV_DERIVE_REV,
        '2026-01-01T00:00:01.000000Z',
    );

    const derived = await deriveInvitations(db);
    const byId = new Map(derived.map(row => [row.id, row]));
    assert.equal(
        byId.get(INV_DERIVE_PENDING)?.state, 'pending');
    assert.equal(
        byId.get('hkbiAljVBMHiLoGwiWjaaw')?.state, 'accepted');
    assert.equal(
        byId.get(INV_DERIVE_DECLINE)?.state, 'declined');
    assert.equal(
        byId.get(INV_DERIVE_REVOKE)?.state, 'revoked');
    // Identifier order (byIdAscending — the derivation's
    // own order, never the backend's).
    const ids = derived.map(row => row.id);
    assert.deepEqual(
        ids,
        [...ids].sort(compareIdentifiers),
    );
});

test('a no-op replay changes nothing deriveInvitations reads',
async () => {
    const db = await freshDb();
    await grant(db, INV_DERIVE_REPLAY);
    const before = await deriveInvitations(db);
    await grant(db, INV_DERIVE_REPLAY);   // byte-identical resend
    const after = await deriveInvitations(db);
    assert.deepEqual(after, before);
});

test('every stored invitation-family message verifies against'
+ ' its hash, and requests/responses stay balanced across a'
+ ' full grant→accept→decline mix', async () => {
    const db = await freshDb();
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await grant(db, INV_BALANCE_1, 'sarah@x.com');
    await grant(db, 'hdlRpVJZrTkuMAnTASJNnA', 'bruce@x.com');
    await handleRequest(db, req(
        'PUT',
        '/identities/' + BRUCE
            + '/invitations/hdlRpVJZrTkuMAnTASJNnA',
        await organizationToken(BRUCE, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_BALANCE_2,
            eventId: EV_BALANCE_ACC,
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    await grant(db, INV_BALANCE_3, 'clark@x.com');
    await declineFor(
        db, INV_BALANCE_3, CLARK, EV_BALANCE_DEC,
        '2026-01-01T00:00:01.000000Z',
    );
    const messagePairs = await db.messagePairs.getAll();
    // 3 grants x 2 (operation + invitation document) + 1 accept
    // x 2 (operation + memberships document) + 1 decline x 1
    // (operation only — decline synthesizes no document) = 9,
    // plus the fixture's own membership pair (Phase 13
    // Task 1; role-grant retired), four identities/:id/pii
    // pairs (current, toccYYkLEABmlbpHJalgtQ, bruce, clark — Phase 15 gate
    // 6),
    // and the organizations/:id document (Stage B) = 15.
    assert.equal(messagePairs.length, 15);
    for (const row of messagePairs) {
        assert.equal(
            await requestMessageHash(row.request),
            row.request_hash,
        );
    }
});
