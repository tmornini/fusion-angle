import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { documentMessagePairsAt } from '../api/derive-documents.ts';
import { withoutId } from '../api/document-family.ts';
import { requestHashOfStored } from './ledger-row.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import {
    apiRequest,
    pairIdOf,
    storedPutBodyText,
    invitationLatched,
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
const INV_DOC_5 = generateIdentifier();
const MS_DOC_5 = generateIdentifier();
const EV_ACC_5 = generateIdentifier();
const INV_DOC_6 = generateIdentifier();
const EV_REV_6 = generateIdentifier();
const INV_SEAT_NO_OP = generateIdentifier();

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
    });
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows, which lists the identities collection
// and reads one PII document each — so the PII needs its
// identities/:id document alongside it. seedPersonIdentity
// writes both.
async function person(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await seedPersonIdentity(db, id, {
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

Deno.test('a fresh grant appends 2 pairs — the operation and the'
+ ' invitation document, email ABSENT by construction',
async () => {
    const db = await freshDb();
    const res = await grant(db, INV_DOC_1);
    assertStrictEquals(res.status, 201);
    const requests = await db.messagePairs.getAll();
    // 8: the fixture's own membership pair (Phase 13 Task 1;
    // role-grant retired), two seeded people (an identities/:id
    // document and its pii document each), the
    // organizations/:id document (Stage B), and the grant's own
    // 2 pairs.
    assertStrictEquals(requests.length, 9);
    const pairsAt = requests.filter(
        r => r.path === '/invitations/'
            && r.name === INV_DOC_1,
    );
    assertStrictEquals(pairsAt.length, 2);
    // The document head: the ONE PUT/2xx pair at this document —
    // documentMessagePairsAt excludes the operation message pair's POST
    // method by construction (design decision 6), so a match
    // here IS the document.
    const documents = documentMessagePairsAt(
        requests, '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_1);
    assertStrictEquals(documents.length, 1);
    const wire = documents[0]!.body;
    // The stored request is the invitation's state, which
    // leads with its id until the former stores no request
    // bytes.
    assertEquals(
        Object.keys(withoutId(wire)).sort(),
        ['at', 'identity_id', 'organization_id', 'state'],
    );
    assertStrictEquals(wire.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(wire.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    assertStrictEquals(wire.at, AT);
    assertStrictEquals(wire.email, undefined);
    assertStrictEquals(wire.state, 'pending');
});

Deno.test('a duplicate grant answers the pending invitation with'
+ ' 200 and stores nothing — no phantom document at the'
+ ' duplicate\'s submitted id',
async () => {
    const db = await freshDb();
    const first = await grant(db, INV_DOC_2A);
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await grant(db, INV_DOC_2B);
    assertStrictEquals(second.status, 200);
    assertEquals(await second.json(), {
        id: INV_DOC_2A,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'pending',
    });
    const requests = await db.messagePairs.getAll();
    assertStrictEquals(requests.length, before);
    const atDuplicateId = requests.filter(
        r => r.path === '/invitations/'
            && r.name === INV_DOC_2B,
    );
    assertStrictEquals(atDuplicateId.length, 0);
    const atFreshId = requests.filter(
        r => r.path === '/invitations/'
            && r.name === INV_DOC_2A,
    );
    assertStrictEquals(atFreshId.length, 2);
});

Deno.test('a failed (member-conflict) grant appends nothing',
async () => {
    const db = await freshDb();
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member', at: AT,
    });
    const res = await grant(db, INV_DOC_FAIL);
    assertStrictEquals(res.status, 409);
    // 7: the fixture's own membership pair, two seeded people
    // (an identities/:id document and its pii document each),
    // the organizations/:id document (Stage B), plus
    // toccYYkLEABmlbpHJalgtQ's own conflicting membership pair
    // (Phase 13 Task 1) — the failed grant appends nothing
    // further. Role-grant retired.
    assertStrictEquals((await db.messagePairs.getAll()).length, 8);
    assertStrictEquals((await db.messagePairs.getAll()).length, 8);
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
    return handleRequest(db, await invitationLatched(db, req(
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
    )));
}

Deno.test('a fresh accept appends its seat document at the'
+ ' invitation-org members document', async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_3);
    const res = await accept(
        db, INV_DOC_3, MS_DOC_3, EV_ACC_3,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    const requests = await db.messagePairs.getAll();
    const documents = documentMessagePairsAt(
        requests, '/organizations/AjdvjuECVZEgZoFajaIEkg/members/',
    ).filter(
        messagePair => messagePair.name === 'toccYYkLEABmlbpHJalgtQ',
    );
    assertStrictEquals(documents.length, 1);
    assertEquals(documents[0]!.body, {
        id: 'toccYYkLEABmlbpHJalgtQ',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    });
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'toccYYkLEABmlbpHJalgtQ',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'AjdvjuECVZEgZoFajaIEkg'),
    ));
    assertStrictEquals(got.status, 200);
    const acceptBody = {
        id: 'toccYYkLEABmlbpHJalgtQ',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
    };
    assertEquals(await got.json(), acceptBody);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                , 'toccYYkLEABmlbpHJalgtQ',
        ),
    );
    assertEquals(stored, acceptBody);
});

// One shape per family: the accept stores the seat's wire,
// so the route's identical PUT over it is the statement's
// match.
Deno.test('a route PUT of the accepted seat stores nothing'
+ ' and answers 200', async () => {
    const db = await freshDb();
    await grant(db, INV_SEAT_NO_OP);
    const accepted = await accept(
        db, INV_SEAT_NO_OP, generateIdentifier(),
        generateIdentifier(), '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(accepted.status, 200);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/';
    const [head] = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs(prefix), prefix,
    ).filter((pair) => pair.name === 'toccYYkLEABmlbpHJalgtQ');
    assert(head !== undefined);
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'PUT', prefix + 'toccYYkLEABmlbpHJalgtQ',
        await organizationToken(),
        { type: 'member', at: '2026-01-01T00:00:01.000000Z' },
    ));
    assertStrictEquals(res.status, 200);
    assertStrictEquals(pairIdOf(res), head.id);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a no-op re-accept appends no seat document',
async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_4);
    const first = await accept(
        db, INV_DOC_4, MS_DOC_4, EV_ACC_4,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(first.status, 200);
    const second = await accept(
        db, INV_DOC_4, MS_DOC_4B, EV_ACC_4B,
        '2026-01-01T00:00:02.000000Z',
    );
    assertStrictEquals(second.status, 200);
    const documents = (await db.messagePairs.getAll()).filter(
        r => r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/'
            && r.name === 'toccYYkLEABmlbpHJalgtQ',
    );
    const invitationDocuments = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_4);
    assertStrictEquals(invitationDocuments.length, 2);
    assertStrictEquals(documents.length, 1);
});

Deno.test('a terminal answer appends a full PUT of the'
+ ' invitation document whose head carries the state',
async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_5);
    const res = await accept(
        db, INV_DOC_5, MS_DOC_5, EV_ACC_5,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    const documents = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_5);
    assertStrictEquals(documents.length, 2);
    // Each stored request is the invitation's state, id
    // first, until the former stores no request bytes.
    assertEquals(withoutId(documents[0]!.body), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'pending',
    });
    assertEquals(withoutId(documents[1]!.body), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'accepted',
    });
    assertStrictEquals(
        documents[1]!.requesterIdentityId,
        'toccYYkLEABmlbpHJalgtQ',
    );
});

Deno.test('a revoke appends a full PUT of the invitation'
+ ' document whose head carries the revoked state',
async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_6);
    const res = await revokeFor(
        db, INV_DOC_6, EV_REV_6,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    const documents = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_6);
    assertStrictEquals(documents.length, 2);
    // Each stored request is the invitation's state, id
    // first, until the former stores no request bytes.
    assertEquals(withoutId(documents[0]!.body), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'pending',
    });
    assertEquals(withoutId(documents[1]!.body), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'revoked',
    });
    assertStrictEquals(
        documents[1]!.requesterIdentityId,
        'XXZruirZyAOoRpNxaDnpSA',
    );
});

// ── deriveInvitations: the message-plane reduction ──

async function declineFor(
    db: MemoryDbAdapter,
    invitationId: string,
    invitee: string,
    eventId: string,
    declineAt: string,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + invitee
            + '/invitations/' + invitationId,
        await organizationToken(invitee, 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'declined',
            eventId,
            at: declineAt,
        },
    )));
}

async function revokeFor(
    db: MemoryDbAdapter,
    invitationId: string,
    eventId: string,
    revokeAt: string,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/' + invitationId,
        await organizationToken(),
        {
            state: 'revoked',
            eventId,
            at: revokeAt,
        },
    )));
}

Deno.test('deriveInvitations round-trips every terminal state:'
+ ' grant→pending, accept→accepted, decline→declined,'
+ ' revoke→revoked', async () => {
    const db = await freshDb();
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await person(db, DIANA, 'Diana', 'diana@x.com');

    await grant(db, INV_DERIVE_PENDING, 'sarah@x.com');

    await grant(db, 'hkbiAljVBMHiLoGwiWjaaw', 'bruce@x.com');
    await handleRequest(db, await invitationLatched(db, req(
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
    )));

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
    assertStrictEquals(
        byId.get(INV_DERIVE_PENDING)?.state, 'pending');
    assertStrictEquals(
        byId.get('hkbiAljVBMHiLoGwiWjaaw')?.state, 'accepted');
    assertStrictEquals(
        byId.get(INV_DERIVE_DECLINE)?.state, 'declined');
    assertStrictEquals(
        byId.get(INV_DERIVE_REVOKE)?.state, 'revoked');
    // Identifier order (byIdAscending — the derivation's
    // own order, never the backend's).
    const ids = derived.map(row => row.id);
    assertEquals(
        ids,
        [...ids].sort(compareIdentifiers),
    );
});

Deno.test('a no-op replay changes nothing deriveInvitations reads',
async () => {
    const db = await freshDb();
    await grant(db, INV_DERIVE_REPLAY);
    const before = await deriveInvitations(db);
    await grant(db, INV_DERIVE_REPLAY);   // byte-identical resend
    const after = await deriveInvitations(db);
    assertEquals(after, before);
});

Deno.test('every stored invitation-family message verifies against'
+ ' its hash, and requests/responses stay balanced across a'
+ ' full grant→accept→decline mix', async () => {
    const db = await freshDb();
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await grant(db, INV_BALANCE_1, 'sarah@x.com');
    await grant(db, 'hdlRpVJZrTkuMAnTASJNnA', 'bruce@x.com');
    await handleRequest(db, await invitationLatched(db, req(
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
    )));
    await grant(db, INV_BALANCE_3, 'clark@x.com');
    await declineFor(
        db, INV_BALANCE_3, CLARK, EV_BALANCE_DEC,
        '2026-01-01T00:00:01.000000Z',
    );
    const messagePairs = await db.messagePairs.getAll();
    // 3 grants x 2 (operation + invitation document) + 1 accept
    // x 3 (operation + memberships document + the invitation's
    // terminal document PUT) + 1 decline x 2 (operation +
    // terminal document PUT) = 11, plus the fixture's own
    // membership pair, four seeded people (an identities/:id
    // document and its pii document each), and the
    // organizations/:id document = 21.
    assertStrictEquals(messagePairs.length, 22);
    for (const row of messagePairs) {
        assertStrictEquals(
            await requestHashOfStored(row),
            row.request_hash,
        );
    }
});

Deno.test('POST invitations/ answers 201 with the document\'s'
+ ' state and its location', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const res = await grant(db, id);
    assertStrictEquals(res.status, 201);
    assertStrictEquals(res.headers.get('location'), id);
    assertEquals(
        await res.json(),
        JSON.parse(
            await storedPutBodyText(db, '/invitations/', id),
        ),
    );
});

Deno.test('a resent POST invitations/ is 409 and stores nothing',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const first = await grant(db, id);
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await grant(db, id);
    assertStrictEquals(second.status, 409);
    assertEquals(await second.json(), {
        error: 'Document already exists at /invitations/' + id,
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

function transitionRequest(
    path: string,
    token: string,
    body: Record<string, unknown>,
    etag?: string,
): Request {
    return apiRequest({
        method: 'PUT',
        path,
        token,
        body,
        ...(etag !== undefined
            ? { headers: { 'If-Match': etag } }
            : {}),
    });
}

const INVITEE_NEST =
    '/identities/toccYYkLEABmlbpHJalgtQ/invitations/';
const ORGANIZATION_NEST =
    '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/';

async function granted(
    db: MemoryDbAdapter,
): Promise<{ id: string, etag: string }> {
    const id = generateIdentifier();
    const res = await grant(db, id);
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    const etag = res.headers.get('etag');
    assert(etag !== null);
    return { id, etag };
}

async function inviteeToken(): Promise<string> {
    return organizationToken(
        'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg',
    );
}

Deno.test('accept, decline, and revoke without If-Match are 428',
async () => {
    const db = await freshDb();
    const { id } = await granted(db);
    const before = (await db.messagePairs.getAll()).length;
    const accepted = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(accepted.status, 428);
    await accepted.body?.cancel();
    const declined = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'declined',
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(declined.status, 428);
    await declined.body?.cancel();
    const revoked = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), {
            state: 'revoked',
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(revoked.status, 428);
    await revoked.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('accept answers the invitation\'s state', async () => {
    const db = await freshDb();
    const { id, etag } = await granted(db);
    const res = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:01.000000Z',
        }, etag,
    ));
    assertStrictEquals(res.status, 200);
    const head = await db.messagePairs.getHeadPair(
        '/invitations/', id,
    );
    assertStrictEquals(res.headers.get('etag'), '"' + head?.id + '"');
    assertEquals(await res.json(), {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'accepted',
    });
});

Deno.test('a stale invitation tag is 412', async () => {
    const db = await freshDb();
    const { id, etag } = await granted(db);
    const revoked = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), {
            state: 'revoked',
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:01.000000Z',
        }, etag,
    ));
    assertStrictEquals(revoked.status, 200);
    await revoked.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: '2026-01-01T00:00:02.000000Z',
        }, etag,
    ));
    assertStrictEquals(res.status, 412);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a resent revoke answers the head and stores nothing',
async () => {
    const db = await freshDb();
    const { id, etag } = await granted(db);
    const body = {
        state: 'revoked',
        eventId: generateIdentifier(),
        at: '2026-01-01T00:00:01.000000Z',
    };
    const first = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), body,
        etag,
    ));
    assertStrictEquals(first.status, 200);
    const head = first.headers.get('etag');
    const state = await first.json();
    assert(head !== null);
    const before = (await db.messagePairs.getAll()).length;
    const resent = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), body,
        head,
    ));
    assertStrictEquals(resent.status, 200);
    assertStrictEquals(resent.headers.get('etag'), head);
    assertEquals(await resent.json(), state);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
