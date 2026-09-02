import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    invitationLifecycleStatesFor,
    deriveInvitationStates,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { deriveInvitations } from
    '../api/derive-invitations.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { deriveDocumentsAt } from
    '../api/derive-documents.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_SARAH = generateIdentifier();
const EV_GRANT = generateIdentifier();
const INV_X = generateIdentifier();
const EV_X = generateIdentifier();
const INV_REVOKE = generateIdentifier();
const EV_REVOKE = generateIdentifier();
const MS_SARAH = generateIdentifier();
const EV_ACC = generateIdentifier();
const MS_SARAH_2 = generateIdentifier();
const EV_ACC_2 = generateIdentifier();
const INV_IDEM = generateIdentifier();
const EV_G_IDEM = generateIdentifier();
const EV_GAI = generateIdentifier();
const MS_IDEM = generateIdentifier();
const EV_A_IDEM = generateIdentifier();
const EV_GDI = generateIdentifier();
const EV_D_IDEM = generateIdentifier();
const EV_GRI = generateIdentifier();
const EV_R_IDEM = generateIdentifier();
const MS_X = generateIdentifier();
const MS_SARAH_REMOVED = generateIdentifier();
const EV_ACC_REMOVED = generateIdentifier();
const MS_SARAH_AGAIN = generateIdentifier();
const EV_ACC_AGAIN = generateIdentifier();

// Phase Final Task 2: memberships on the message plane.
async function allMemberships(db: MemoryDbAdapter) {
    const organizations = await deriveOrganizations(db);
    const rows: Array<{
        id: string;
        organization_id: string;
        identity_id: string;
        type: string;
        at: string;
    }> = [];
    for (const organization of organizations) {
        const seatPrefix = '/organizations/'
            + organization.id + '/members/';
        const [seatRequests] =
            await Promise.all([
                db.messagePairs.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
                db.messagePairs.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
            ]);
        for (const document of deriveDocumentsAt(
            seatRequests, seatPrefix,
        ).values()) {
            rows.push({
                id: document.uriId,
                organization_id: organization.id,
                identity_id: document.uriId,
                type: String(document.body['type']),
                at: String(document.body['at']),
            });
        }
    }
    return rows;
}

const AT = '2026-01-01T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom,
// mirroring person()'s own reasoning below): the invitation
// facade's admin/membership checks derive from the message plane
// once role_grants/memberships flip, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw puts these replace — only the write mechanism changes.
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

// Stark 'AjdvjuECVZEgZoFajaIEkg' and Wayne 'BBjWJsjYIDkTRKIIPrzWRw'. Tony
// ('XXZruirZyAOoRpNxaDnpSA') is admin + member
// of both; Sarah is a role-LESS Stark-only member — the
// deny-by-default policy forbids her on gated routes, which is
// exactly why the invitation facade must stand outside it.
async function seed(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves
    // 'AjdvjuECVZEgZoFajaIEkg'/'BBjWJsjYIDkTRKIIPrzWRw'
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, 'AjdvjuECVZEgZoFajaIEkg', 'Stark');
    await seedOrganizationDocument(db, 'BBjWJsjYIDkTRKIIPrzWRw', 'Wayne');
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        await seedMembershipPair(db, generateIdentifier(), {
            organization_id: organization
                , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
            at: AT,
        });
    }
    await person(db, 'XXZruirZyAOoRpNxaDnpSA', 'Tony', 'demo@example.com');
    await person(db, 'toccYYkLEABmlbpHJalgtQ', 'Sarah', 'sarah@x.com');
    await seedMembershipPair(db, generateIdentifier(), {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg'
            , identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member', at: AT,
    });
    return db;
}

// Person identities ride the live identities + PII documents.
// GET /invitations enriches invited_by_name from identity_pii.
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

// Grant via the gate as Tony scoped to Wayne, returning the new
// invitation id straight from storage.
async function grantSarahToWayne(
    db: MemoryDbAdapter,
): Promise<string> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'sarah@x.com',
            invitationId: INV_SARAH,
            grantEventId: EV_GRANT,
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 200);
    return (await deriveInvitations(db))[0]!.id;
}

Deno.test('a role-less invitee may read their invitations',
async () => {
    // Sarah holds no role, so the deny-by-default policy would
    // 403 her on /members; the invitation facade stands apart.
    const db = await seed();
    await grantSarahToWayne(db);
    const res = await handleRequest(db, req(
        'GET', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg')));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as { state: string }[];
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.state, 'pending');
});

Deno.test('a non-admin is forbidden from granting', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            email: 'demo@example.com',
            invitationId: INV_X, grantEventId: EV_X,
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: POST'
            + ' /organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/invitations/'
            + ' requires a role this principal lacks',
    });
});

Deno.test('a non-admin is forbidden from revoking', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/'
            + INV_REVOKE,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        { state: 'revoked', eventId: EV_REVOKE, at: AT },
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: PUT'
            + ' /organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/invitations/' + INV_REVOKE
            + ' requires a role this principal lacks',
    });
});

Deno.test('a pending invite writes no membership', async () => {
    // Reachability derives from the membership ledger; a pending
    // invite must not add one, so the org stays unreachable.
    const db = await seed();
    await grantSarahToWayne(db);
    const sarahOrganizations = (await allMemberships(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ')
        .map(m => m.organization_id).sort();
    assertEquals(sarahOrganizations, ['AjdvjuECVZEgZoFajaIEkg']);
});

Deno.test('a pending invitee is absent from the roster', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const before = await rosterIds(db);
    assert(!before.has('toccYYkLEABmlbpHJalgtQ'));
    // Sarah accepts; now the Wayne roster includes her.
    const id = (await deriveInvitations(db))[0]!.id;
    const acc = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_SARAH, eventId: EV_ACC,
            at: AT,
        }));
    assertStrictEquals(acc.status, 204);
    const after = await rosterIds(db);
    assert(after.has('toccYYkLEABmlbpHJalgtQ'));
});

async function rosterIds(
    db: MemoryDbAdapter,
): Promise<Set<string>> {
    const res = await handleRequest(db, req(
        'GET', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/members/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw')));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as { id: string }[];
    return new Set(rows.map(r => r.id));
}

Deno.test('accept makes the invitation org reachable', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_SARAH_2,
            eventId: EV_ACC_2,
            at: AT,
        }));
    const sarahOrganizations = (await allMemberships(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ')
        .map(m => m.organization_id).sort();
    assertEquals(sarahOrganizations, ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']);
});

// Bulk lifecycle collection RETIRED (C3). Pin invitation
// ownership via resolveOwningOrganization — inviting org
// owns the invitation; foreign askers still resolve that
// owner (and would fence it out of a bulk union that no
// longer exists).
Deno.test('an invitation event is owned by the inviting org',
async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const rows = await deriveInvitationStates(db);
    assert(
        rows.some((r) => r.entity_id === id),
        'invitation lifecycle events derive for the grant',
    );
    assertStrictEquals(
        await resolveOwningOrganization(db, id, 'BBjWJsjYIDkTRKIIPrzWRw'),
        'BBjWJsjYIDkTRKIIPrzWRw',
    );
    assertStrictEquals(
        await resolveOwningOrganization(db, id, 'AjdvjuECVZEgZoFajaIEkg'),
        'BBjWJsjYIDkTRKIIPrzWRw',
    );
});

// Caller-minted id + at: replay idempotency at the API level.
// A fixed body posted twice must produce exactly one event — the
// same guarantee as flows-PUT replay (one updated event).

// Far-future timestamps distinguish caller-supplied `at` from
// any server-stamped nowUtc() so an accidental server mint is
// immediately visible in the assertion.
const GRANT_AT = '2099-06-01T12:00:00.000000Z'; // far-future
const ACCEPT_AT = '2099-06-01T12:00:01.000000Z'; // far-future
const DECLINE_AT = '2099-06-01T12:00:02.000000Z'; // far-future
const REVOKE_AT = '2099-06-01T12:00:03.000000Z'; // far-future

Deno.test('grant: replay of fixed body is a no-op (one event)',
async () => {
    const db = await seed();
    const body = {
        email: 'sarah@x.com',
        invitationId: INV_IDEM,
        grantEventId: EV_G_IDEM,
        grantAt: GRANT_AT,
    };
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const rOEPOcVMQdJiiiMuiiEhlg = await handleRequest(
        db, req('POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
            tok, body));
    assertStrictEquals(rOEPOcVMQdJiiiMuiiEhlg.status, 200);
    const r2 = await handleRequest(
        db, req('POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
            tok, body));
    assertStrictEquals(r2.status, 200);
    assertStrictEquals((await deriveInvitations(db)).length, 1);
    assertStrictEquals(
        (await invitationLifecycleStatesFor(db, INV_IDEM)).length, 1,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, INV_IDEM,
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assertStrictEquals(ev.at, GRANT_AT);
    assertStrictEquals(ev.id, EV_G_IDEM);
});

Deno.test('accept: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, accept emits 1 more; a second accept
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/', tok, {
        email: 'sarah@x.com',
        invitationId: 'hasVDnGjEylAnJDTPjnZuQ',
        grantEventId: EV_GAI,
        grantAt: GRANT_AT,
    }));
    const accBody = {
        state: 'accepted',
        membershipId: MS_IDEM,
        eventId: EV_A_IDEM,
        at: ACCEPT_AT,
    };
    const sTok = await organizationToken('toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const UQTJZvCoKlFjEoDlDUwekw = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hasVDnGjEylAnJDTPjnZuQ',
        sTok, accBody));
    assertStrictEquals(UQTJZvCoKlFjEoDlDUwekw.status, 204);
    const UZgNCkZlSJcSaAmAJuSkcw = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hasVDnGjEylAnJDTPjnZuQ',
        sTok, accBody));
    assertStrictEquals(UZgNCkZlSJcSaAmAJuSkcw.status, 204);
    assertStrictEquals(
        (await invitationLifecycleStatesFor(db
            , 'hasVDnGjEylAnJDTPjnZuQ')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'hasVDnGjEylAnJDTPjnZuQ',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assertStrictEquals(ev.at, ACCEPT_AT);
    assertStrictEquals(ev.id, EV_A_IDEM);
    assertStrictEquals(ev.member_id, 'toccYYkLEABmlbpHJalgtQ');
});

Deno.test('decline: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, decline emits 1 more; a second
    // decline of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/', tok, {
        email: 'sarah@x.com',
        invitationId: 'hlmIVMfGBbdTSoChNYsQkQ',
        grantEventId: EV_GDI,
        grantAt: GRANT_AT,
    }));
    const decBody = {
        state: 'declined',
        eventId: EV_D_IDEM,
        at: DECLINE_AT,
    };
    const sTok = await organizationToken('toccYYkLEABmlbpHJalgtQ'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const d1 = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hlmIVMfGBbdTSoChNYsQkQ',
        sTok, decBody));
    assertStrictEquals(d1.status, 204);
    const d2 = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/'
            + 'hlmIVMfGBbdTSoChNYsQkQ',
        sTok, decBody));
    assertStrictEquals(d2.status, 204);
    assertStrictEquals(
        (await invitationLifecycleStatesFor(db
            , 'hlmIVMfGBbdTSoChNYsQkQ')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'hlmIVMfGBbdTSoChNYsQkQ',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assertStrictEquals(ev.at, DECLINE_AT);
    assertStrictEquals(ev.id, EV_D_IDEM);
});

Deno.test('revoke: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, revoke emits 1 more; a second revoke
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/', tok, {
        email: 'sarah@x.com',
        invitationId: 'itekPiJIBiPQhcZveiqTKw',
        grantEventId: EV_GRI,
        grantAt: GRANT_AT,
    }));
    const revBody = {
        state: 'revoked',
        eventId: EV_R_IDEM,
        at: REVOKE_AT,
    };
    const rOEPOcVMQdJiiiMuiiEhlg = await handleRequest(db, req(
        'PUT', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + 'itekPiJIBiPQhcZveiqTKw',
        tok, revBody));
    assertStrictEquals(rOEPOcVMQdJiiiMuiiEhlg.status, 204);
    const r2 = await handleRequest(db, req(
        'PUT', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + 'itekPiJIBiPQhcZveiqTKw',
        tok, revBody));
    assertStrictEquals(r2.status, 204);
    assertStrictEquals(
        (await invitationLifecycleStatesFor(db
            , 'itekPiJIBiPQhcZveiqTKw')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'itekPiJIBiPQhcZveiqTKw',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assertStrictEquals(ev.at, REVOKE_AT);
    assertStrictEquals(ev.id, EV_R_IDEM);
    assertStrictEquals(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

// Gap-1 gate: empty ids are rejected at the gate (400).

Deno.test('grant: empty invitationId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'sarah@x.com',
            invitationId: '',
            grantEventId: EV_X,
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('grant: empty grantEventId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'sarah@x.com',
            invitationId: INV_X,
            grantEventId: '',
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('accept: empty membershipId is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: '',
            eventId: EV_X,
            at: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('decline: empty declineEventId is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'declined',
            eventId: '',
            at: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('revoke: empty revokeEventId is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'revoked',
            eventId: '',
            at: AT,
        }));
    assertStrictEquals(res.status, 400);
});

// Gap-2 gate: missing or non-string fields are rejected (400),
// not uncaught (500). pickString and validateTimestampField both
// throw ValidationError on these inputs; the domain functions
// must catch and translate, not leak.

Deno.test('grant: missing invitationId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'sarah@x.com',
            // invitationId intentionally absent
            grantEventId: EV_X,
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('grant: non-string grantAt is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            email: 'sarah@x.com',
            invitationId: INV_X,
            grantEventId: EV_X,
            grantAt: 42,   // non-string
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('accept: missing eventId is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_X,
            // eventId intentionally absent
            at: AT,
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('accept: non-string at is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_X,
            eventId: EV_X,
            at: 42,   // non-string
        }));
    assertStrictEquals(res.status, 400);
});

Deno.test('decline: missing declineAt is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'declined',
            eventId: EV_X,
            // at intentionally absent
        }));
    assertStrictEquals(res.status, 400);
});

// KEEP-ATOMIC (Author gate 6e): a removed member cannot
// re-admit themselves by merely replaying their old acceptance.
// currentInvitationState's 'accepted' branch short-circuits to
// a no-op BEFORE the membership-existence check ever runs, so
// the property holds today already — this pin proves it against
// TODAY's code, before Phase 8 Task 6 adds the document-plane
// synthesis around this same accept path.
Deno.test('a removed member who re-accepts gets a no-op — not a'
+ ' silent re-admission (KEEP-ATOMIC)', async () => {
    // Distinct, strictly-increasing `at` stamps: grant/accept
    // share one invitation entity_id in the states log, so a tied
    // `at` would fall to the (at, id) reduction's id tie-break —
    // the SAME reduction currentInvitationState reads — rather
    // than proving the property this test exists to pin.
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const accept = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_SARAH_REMOVED,
            eventId: EV_ACC_REMOVED,
            at: '2026-01-01T00:00:01.000000Z',
        }));
    assertStrictEquals(accept.status, 204);
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/members/'
            + 'toccYYkLEABmlbpHJalgtQ',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw')));
    assertStrictEquals(del.status, 204);
    const statesBefore = (await invitationLifecycleStatesFor(db, id)).length;
    const reaccept = await handleRequest(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            membershipId: MS_SARAH_AGAIN,
            eventId: EV_ACC_AGAIN,
            at: '2026-01-01T00:00:02.000000Z',
        }));
    assertStrictEquals(reaccept.status, 204);
    const sarahInWayne = (await allMemberships(db))
        .filter(m => m.identity_id === 'toccYYkLEABmlbpHJalgtQ'
            && m.organization_id === 'BBjWJsjYIDkTRKIIPrzWRw');
    assertEquals(sarahInWayne, []);
    assertStrictEquals(
        (await invitationLifecycleStatesFor(db, id)).length, statesBefore,
    );
});

Deno.test('revoke: missing revokeAt is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'PUT', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
        {
            state: 'revoked',
            eventId: EV_X,
            // at intentionally absent
        }));
    assertStrictEquals(res.status, 400);
});
