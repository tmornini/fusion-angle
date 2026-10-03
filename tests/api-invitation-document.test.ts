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
    storedPutBodyText,
    invitationLatched,
} from './http-fixtures.ts';
import { membershipOf } from '../api/memberships.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    generateIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

// Phase 8 Task 6: the invitation document plane — the grant's
// PUT-shaped invitation document (the entity minus id, NO email
// by construction) and the accept's PUT-shaped memberships
// document (the B2 closure: the third memberships writer to join
// the document plane, after the live PUT route and the seed).
// Neither document routes anywhere (Author gate 2 — the
// invitations side channel never joins the route table); both
// are storage-only.

const AT = '2026-01-01T00:00:00.000000Z';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const SARAH_NAME = membershipNameOf(STARK, SARAH);
const BRUCE = generateIdentifier();
const CLARK = generateIdentifier();
const DIANA = generateIdentifier();
const BRUCE_NAME = membershipNameOf(STARK, BRUCE);
const CLARK_NAME = membershipNameOf(STARK, CLARK);
const DIANA_NAME = membershipNameOf(STARK, DIANA);

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
    email = 'sarah@x.com',
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/' + STARK + '/invitations/',
        await organizationToken(),
        { email, grantAt: AT },
    ));
}

// ── grant: the invitation document message pair ──

Deno.test('a fresh grant appends 2 pairs — the operation and the'
+ ' invitation document, email ABSENT by construction',
async () => {
    const db = await freshDb();
    const res = await grant(db);
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
            && r.name === SARAH_NAME,
    );
    assertStrictEquals(pairsAt.length, 1);
    const operation = requests.filter(
        r => r.path === '/invitations/' + SARAH_NAME + '/'
            && r.name === 'pending',
    );
    assertStrictEquals(operation.length, 1);
    assertStrictEquals(operation[0]!.method, 'POST');
    // The document head: the ONE PUT/2xx pair at this document —
    // documentMessagePairsAt excludes the operation message pair's POST
    // method by construction (design decision 6), so a match
    // here IS the document.
    const documents = documentMessagePairsAt(
        requests, '/invitations/',
    ).filter(messagePair => messagePair.name === SARAH_NAME);
    assertStrictEquals(documents.length, 1);
    const wire = documents[0]!.body;
    // The stored request is the invitation's state, which
    // leads with its id until the former stores no request
    // bytes.
    assertEquals(
        Object.keys(withoutId(wire)).sort(),
        ['at', 'identity_id', 'organization_id', 'state', 'type'],
    );
    assertStrictEquals(wire.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(wire.identity_id, 'toccYYkLEABmlbpHJalgtQ');
    assertStrictEquals(wire.at, AT);
    assertStrictEquals(wire.email, undefined);
    assertStrictEquals(wire.state, 'pending');
    assertStrictEquals(wire.type, 'member');
});

Deno.test('a duplicate grant answers the pending invitation with'
+ ' 200 and stores nothing',
async () => {
    const db = await freshDb();
    const first = await grant(db);
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await grant(db);
    assertStrictEquals(second.status, 200);
    assertEquals(await second.json(), {
        id: SARAH_NAME,
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: AT,
        state: 'pending',
    });
    const requests = await db.messagePairs.getAll();
    assertStrictEquals(requests.length, before);
    const atFreshId = requests.filter(
        r => r.path === '/invitations/'
            && r.name === SARAH_NAME,
    );
    assertStrictEquals(atFreshId.length, 1);
});

Deno.test('a grant of an accepted membership is 409'
+ ' and appends nothing', async () => {
    const db = await freshDb();
    const seated = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK
            + '/invitations/' + SARAH_NAME,
        token: await organizationToken(),
        body: {
            state: 'accepted', type: 'member', at: AT,
        },
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(seated.status, 201);
    await seated.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const res = await grant(db);
    assertStrictEquals(res.status, 409);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

// ── accept: the memberships document message pair
// (the B2 closure) ──
// Distinct, strictly-increasing `at` stamps across grant/accept:
// both share ONE invitation entity_id in the states log, so a
// tied `at` would fall to the (at, id) reduction's id tie-break
// rather than genuinely proving which branch ran.

async function accept(
    db: MemoryDbAdapter,
    acceptAt: string,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + SARAH + '/invitations/' + SARAH_NAME,
        await organizationToken(SARAH, STARK),
        { state: 'accepted', at: acceptAt },
    )));
}

Deno.test('a fresh accept lands an accepted membership'
+ ' and no seat path exists', async () => {
    const db = await freshDb();
    await grant(db);
    const res = await accept(
        db, '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    const requests = await db.messagePairs.getAll();
    const seats = documentMessagePairsAt(
        requests,
        '/organizations/' + STARK + '/members/',
    );
    assertStrictEquals(seats.length, 0);
    const got = await handleRequest(db, req(
        'GET', '/organizations/' + STARK + '/members/'
            + SARAH,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', STARK,
        ),
    ));
    assertStrictEquals(got.status, 404);
    await got.body?.cancel();
    assertEquals(await membershipOf(db, STARK, SARAH), {
        id: SARAH_NAME,
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        state: 'accepted',
        at: '2026-01-01T00:00:01.000000Z',
    });
});

Deno.test('a no-op re-accept appends no seat document',
async () => {
    const db = await freshDb();
    await grant(db);
    const first = await accept(
        db, '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(first.status, 200);
    const second = await accept(
        db, '2026-01-01T00:00:02.000000Z',
    );
    assertStrictEquals(second.status, 409);
    const documents = (await db.messagePairs.getAll()).filter(
        r => r.path === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/'
            && r.name === 'toccYYkLEABmlbpHJalgtQ',
    );
    const invitationDocuments = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === SARAH_NAME);
    assertStrictEquals(invitationDocuments.length, 2);
    assertStrictEquals(documents.length, 0);
});

Deno.test('a terminal answer appends a full PUT of the'
+ ' invitation document whose head carries the state',
async () => {
    const db = await freshDb();
    await grant(db);
    const res = await accept(
        db, '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    const documents = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === SARAH_NAME);
    assertStrictEquals(documents.length, 2);
    // Each stored request is the invitation's state, id
    // first, until the former stores no request bytes.
    assertEquals(withoutId(documents[0]!.body), {
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: AT,
        state: 'pending',
    });
    assertEquals(withoutId(documents[1]!.body), {
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
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
    await grant(db);
    const res = await revokeFor(
        db, SARAH_NAME,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 200);
    const documents = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === SARAH_NAME);
    assertStrictEquals(documents.length, 2);
    // Each stored request is the invitation's state, id
    // first, until the former stores no request bytes.
    assertEquals(withoutId(documents[0]!.body), {
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: AT,
        state: 'pending',
    });
    assertEquals(withoutId(documents[1]!.body), {
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
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
    invitee: string,
    name: string,
    declineAt: string,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + invitee + '/invitations/' + name,
        await organizationToken(invitee, STARK),
        { state: 'declined', at: declineAt },
    )));
}

async function revokeFor(
    db: MemoryDbAdapter,
    name: string,
    revokeAt: string,
): Promise<Response> {
    return handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/organizations/' + STARK + '/invitations/' + name,
        await organizationToken(),
        { state: 'revoked', at: revokeAt },
    )));
}

Deno.test('deriveInvitations round-trips every terminal state:'
+ ' grant→pending, accept→accepted, decline→declined,'
+ ' revoke→revoked', async () => {
    const db = await freshDb();
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await person(db, DIANA, 'Diana', 'diana@x.com');

    await grant(db, 'sarah@x.com');

    await grant(db, 'bruce@x.com');
    await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + BRUCE
            + '/invitations/' + BRUCE_NAME,
        await organizationToken(BRUCE, STARK),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));

    await grant(db, 'clark@x.com');
    await declineFor(
        db, CLARK, CLARK_NAME,
        '2026-01-01T00:00:01.000000Z',
    );

    await grant(db, 'diana@x.com');
    await revokeFor(
        db, DIANA_NAME,
        '2026-01-01T00:00:01.000000Z',
    );

    const derived = await deriveInvitations(db);
    const byId = new Map(derived.map(row => [row.id, row]));
    assertStrictEquals(
        byId.get(SARAH_NAME)?.state, 'pending');
    assertStrictEquals(
        byId.get(BRUCE_NAME)?.state, 'accepted');
    assertStrictEquals(
        byId.get(CLARK_NAME)?.state, 'declined');
    assertStrictEquals(
        byId.get(DIANA_NAME)?.state, 'revoked');
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
    await grant(db);
    const before = await deriveInvitations(db);
    await grant(db);
    const after = await deriveInvitations(db);
    assertEquals(after, before);
});

Deno.test('every stored invitation-family message verifies against'
+ ' its hash, and requests/responses stay balanced across a'
+ ' full grant→accept→decline mix', async () => {
    const db = await freshDb();
    await person(db, BRUCE, 'Bruce', 'bruce@x.com');
    await person(db, CLARK, 'Clark', 'clark@x.com');
    await grant(db, 'sarah@x.com');
    await grant(db, 'bruce@x.com');
    await handleRequest(db, await invitationLatched(db, req(
        'PUT',
        '/identities/' + BRUCE
            + '/invitations/' + BRUCE_NAME,
        await organizationToken(BRUCE, STARK),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        },
    )));
    await grant(db, 'clark@x.com');
    await declineFor(
        db, CLARK, CLARK_NAME,
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
    assertStrictEquals(messagePairs.length, 21);
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
    const res = await grant(db);
    assertStrictEquals(res.status, 201);
    assertStrictEquals(
        res.headers.get('location'),
        '/organizations/' + STARK
            + '/invitations/' + SARAH_NAME,
    );
    assertEquals(
        await res.json(),
        JSON.parse(
            await storedPutBodyText(
                db, '/invitations/', SARAH_NAME,
            ),
        ),
    );
});

Deno.test('a resent POST of a pending email is 200'
+ ' and stores nothing', async () => {
    const db = await freshDb();
    const first = await grant(db);
    assertStrictEquals(first.status, 201);
    await first.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const second = await grant(db);
    assertStrictEquals(second.status, 200);
    assertEquals(await second.json(), {
        id: SARAH_NAME,
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: AT,
        state: 'pending',
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
    const res = await grant(db);
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    const etag = res.headers.get('etag');
    assert(etag !== null);
    return { id: SARAH_NAME, etag };
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
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(accepted.status, 428);
    await accepted.body?.cancel();
    const declined = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'declined',
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(declined.status, 428);
    await declined.body?.cancel();
    const revoked = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), {
            state: 'revoked',
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
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        at: '2026-01-01T00:00:01.000000Z',
        state: 'accepted',
    });
});

Deno.test('a stale invitation tag is 412', async () => {
    const db = await freshDb();
    const { id, etag } = await granted(db);
    const revoked = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), {
            state: 'revoked',
            at: '2026-01-01T00:00:01.000000Z',
        }, etag,
    ));
    assertStrictEquals(revoked.status, 200);
    await revoked.body?.cancel();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, transitionRequest(
        INVITEE_NEST + id, await inviteeToken(), {
            state: 'accepted',
            at: '2026-01-01T00:00:02.000000Z',
        }, etag,
    ));
    assertStrictEquals(res.status, 412);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('a resent revoke latched on the revoked head'
+ ' is 409 and stores nothing', async () => {
    const db = await freshDb();
    const { id, etag } = await granted(db);
    const body = {
        state: 'revoked',
        at: '2026-01-01T00:00:01.000000Z',
    };
    const first = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), body,
        etag,
    ));
    assertStrictEquals(first.status, 200);
    const head = first.headers.get('etag');
    await first.body?.cancel();
    assert(head !== null);
    const before = (await db.messagePairs.getAll()).length;
    const resent = await handleRequest(db, transitionRequest(
        ORGANIZATION_NEST + id, await organizationToken(), body,
        head,
    ));
    assertStrictEquals(resent.status, 409);
    assertEquals(await resent.json(), {
        error: 'no transition from revoked to revoked'
            + ' for the admin',
    });
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
