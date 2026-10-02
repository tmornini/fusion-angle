import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
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
import {
    deriveDocumentsAt,
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    apiRequest,
    invitationLatched,
    partBodiesOf,
    partsOf,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import type { MembershipEntity } from '../shared/types.ts';

const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const SARAH_WAYNE = membershipNameOf(WAYNE, SARAH);
const SARAH_STARK = membershipNameOf(STARK, SARAH);
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
                db.messagePairs.getCollectionPairs(seatPrefix,
                ),
                db.messagePairs.getCollectionPairs(seatPrefix,
                ),
            ]);
        for (const document of deriveDocumentsAt(
            seatRequests, seatPrefix,
        ).values()) {
            rows.push({
                id: document.name,
                organization_id: organization.id,
                identity_id: document.name,
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
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

// A Wayne invitation's versions as Tony, its admin, reads
// them: oldest first. The etag is the stored pair. `at` is
// the body's moment, and the author is that pair's requester.
async function versionsOf(
    db: MemoryDbAdapter,
    id: string,
): Promise<{
    etag: string;
    at: string;
    state: string;
    member_id: string;
}[]> {
    const res = await handleRequest(db, req(
        'GET', '/organizations/BBjWJsjYIDkTRKIIPrzWRw/invitations/'
            + id + '/versions/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw'),
    ));
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<MembershipEntity>(res);
    const rows = [];
    for (const part of parts) {
        const etag = part.query('header.etag').toText()
            .slice(1, -1);
        const pair = await db.messagePairs.getById(etag);
        const body = part.body().toValue();
        rows.push({
            etag,
            at: body.at,
            state: body.state,
            member_id: pair!.requester_identity_id,
        });
    }
    return rows;
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
            grantAt: AT,
        }));
    assertStrictEquals(res.status, 201);
    const body = await res.json() as { id: string };
    assertStrictEquals(body.id, SARAH_WAYNE);
    return body.id;
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
    const rows = await partBodiesOf<MembershipEntity>(res);
    assertStrictEquals(rows.length, 2);
    const stark = rows.find((row) => row.id === SARAH_STARK);
    const wayne = rows.find((row) => row.id === SARAH_WAYNE);
    assertEquals(stark, {
        id: SARAH_STARK,
        organization_id: STARK,
        identity_id: SARAH,
        type: 'member',
        state: 'accepted',
        at: AT,
    });
    assertEquals(wayne, {
        id: SARAH_WAYNE,
        organization_id: WAYNE,
        identity_id: SARAH,
        type: 'member',
        state: 'pending',
        at: AT,
    });
});

Deno.test('a non-admin is forbidden from granting', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/invitations/',
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            email: 'demo@example.com',
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
            + SARAH_STARK,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        { state: 'revoked', at: AT },
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: PUT'
            + ' /organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/invitations/' + SARAH_STARK
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
    const id = await grantSarahToWayne(db);
    const before = await rosterIds(db);
    assert(!before.has('toccYYkLEABmlbpHJalgtQ'));
    // Sarah accepts; now the Wayne roster includes her.
    const acc = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: AT,
        })));
    assertStrictEquals(acc.status, 200);
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
    const rows = await partBodiesOf<{ id: string }>(res);
    return new Set(rows.map(r => r.id));
}

Deno.test('accept makes the invitation org reachable', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/toccYYkLEABmlbpHJalgtQ/invitations/' + id,
        await organizationToken('toccYYkLEABmlbpHJalgtQ'
            , 'AjdvjuECVZEgZoFajaIEkg'),
        {
            state: 'accepted',
            at: AT,
        })));
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

// A fixed body posted twice on a pending head stores one
// event. A second accept or decline latched on the head it
// moved answers 409. A revoke replay latched on the pending
// head answers 412.

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
        grantAt: GRANT_AT,
    };
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const operationId = generateIdentifier();
    const r1 = await handleRequest(
        db, req('POST', '/organizations/' + WAYNE + '/invitations/',
            tok, body, operationId));
    assertStrictEquals(r1.status, 201);
    await r1.body?.cancel();
    const r2 = await handleRequest(
        db, req('POST', '/organizations/' + WAYNE + '/invitations/',
            tok, body, operationId));
    assertStrictEquals(r2.status, 200);
    await r2.body?.cancel();
    assertStrictEquals((await deriveInvitations(db)).length, 4);
    const versions = await versionsOf(db, SARAH_WAYNE);
    assertStrictEquals(versions.length, 1);
    const ev = versions[0]!;
    const [grantPut] = documentMessagePairsAt(
        await db.messagePairs.getDocumentHistory(
            '/invitations/', SARAH_WAYNE,
        ),
        '/invitations/',
    );
    assertStrictEquals(ev.etag, grantPut!.id);
    assertStrictEquals(ev.at, GRANT_AT);
    assertStrictEquals(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('accept: a replay latched on the accepted head'
+ ' is 409 (two events total)',
async () => {
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const granted = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/', tok, {
        email: 'sarah@x.com',
        grantAt: GRANT_AT,
    }));
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const accBody = {
        state: 'accepted',
        at: ACCEPT_AT,
    };
    const sTok = await organizationToken(SARAH, STARK);
    const operationId = generateIdentifier();
    const first = await handleRequest(
        db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/'
            + SARAH_WAYNE,
        sTok, accBody, operationId)));
    assertStrictEquals(first.status, 200);
    await first.body?.cancel();
    const second = await handleRequest(
        db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/'
            + SARAH_WAYNE,
        sTok, accBody, operationId)));
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    const versions = await versionsOf(db, SARAH_WAYNE);
    assertStrictEquals(versions.length, 2);
    const ev = versions.at(-1)!;
    const terminalPut = documentMessagePairsAt(
        await db.messagePairs.getDocumentHistory(
            '/invitations/', SARAH_WAYNE,
        ),
        '/invitations/',
    ).at(-1)!;
    assertStrictEquals(ev.etag, terminalPut.id);
    assertStrictEquals(ev.at, ACCEPT_AT);
    assertStrictEquals(ev.member_id, SARAH);
});

Deno.test('decline: a replay latched on the declined head'
+ ' is 409 (two events total)',
async () => {
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const granted = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/', tok, {
        email: 'sarah@x.com',
        grantAt: GRANT_AT,
    }));
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const decBody = {
        state: 'declined',
        at: DECLINE_AT,
    };
    const sTok = await organizationToken(SARAH, STARK);
    const operationId = generateIdentifier();
    const d1 = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/'
            + SARAH_WAYNE,
        sTok, decBody, operationId)));
    assertStrictEquals(d1.status, 200);
    await d1.body?.cancel();
    const d2 = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/'
            + SARAH_WAYNE,
        sTok, decBody, operationId)));
    assertStrictEquals(d2.status, 409);
    await d2.body?.cancel();
    const versions = await versionsOf(db, SARAH_WAYNE);
    assertStrictEquals(versions.length, 2);
    const ev = versions.at(-1)!;
    const terminalPut = documentMessagePairsAt(
        await db.messagePairs.getDocumentHistory(
            '/invitations/', SARAH_WAYNE,
        ),
        '/invitations/',
    ).at(-1)!;
    assertStrictEquals(ev.etag, terminalPut.id);
    assertStrictEquals(ev.at, DECLINE_AT);
});

Deno.test('revoke: a replay latched on the pending head is 412',
async () => {
    const db = await seed();
    const tok = await organizationToken('XXZruirZyAOoRpNxaDnpSA'
        , 'BBjWJsjYIDkTRKIIPrzWRw');
    const granted = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/', tok, {
        email: 'sarah@x.com',
        grantAt: GRANT_AT,
    }));
    assertStrictEquals(granted.status, 201);
    await granted.body?.cancel();
    const revBody = {
        state: 'revoked',
        at: REVOKE_AT,
    };
    const operationId = generateIdentifier();
    const path = '/organizations/' + WAYNE + '/invitations/'
        + SARAH_WAYNE;
    const firstReq = await invitationLatched(db, req(
        'PUT', path, tok, revBody, operationId));
    const replayReq = await invitationLatched(db, req(
        'PUT', path, tok, revBody, generateIdentifier()));
    const r1 = await handleRequest(db, firstReq);
    assertStrictEquals(r1.status, 200);
    await r1.body?.cancel();
    const r2 = await handleRequest(db, replayReq);
    assertStrictEquals(r2.status, 412);
    await r2.body?.cancel();
    const versions = await versionsOf(db, SARAH_WAYNE);
    assertStrictEquals(versions.length, 2);
    const ev = versions.at(-1)!;
    const terminalPut = documentMessagePairsAt(
        await db.messagePairs.getDocumentHistory(
            '/invitations/', SARAH_WAYNE,
        ),
        '/invitations/',
    ).at(-1)!;
    assertStrictEquals(ev.etag, terminalPut.id);
    assertStrictEquals(ev.at, REVOKE_AT);
    assertStrictEquals(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('grant: empty email is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        { email: '', grantAt: AT }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('grant: empty grantAt is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        { email: 'sarah@x.com', grantAt: '' }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('accept: empty state is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        { state: '', at: AT })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('decline: empty state is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        { state: '', at: AT })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('revoke: empty state is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/organizations/' + WAYNE + '/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        { state: '', at: AT })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('grant: missing email is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        { grantAt: AT }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('grant: non-string grantAt is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + WAYNE + '/invitations/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        {
            email: 'sarah@x.com',
            grantAt: 42,
        }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('accept: missing state is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        { at: AT })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('accept: non-string at is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        { state: 'accepted', at: 42 })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('decline: missing at is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        { state: 'declined' })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('a removed member who re-accepts is 409 — not a'
+ ' silent re-admission', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const accept = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:01.000000Z',
        })));
    assertStrictEquals(accept.status, 200);
    await accept.body?.cancel();
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/' + WAYNE + '/members/' + SARAH,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE)));
    assertStrictEquals(del.status, 204);
    await del.body?.cancel();
    const versionsBefore = (await versionsOf(db, id)).length;
    const reaccept = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/identities/' + SARAH + '/invitations/' + id,
        await organizationToken(SARAH, STARK),
        {
            state: 'accepted',
            at: '2026-01-01T00:00:02.000000Z',
        })));
    assertStrictEquals(reaccept.status, 409);
    await reaccept.body?.cancel();
    const sarahInWayne = (await allMemberships(db))
        .filter(m => m.identity_id === SARAH
            && m.organization_id === WAYNE);
    assertEquals(sarahInWayne, []);
    assertStrictEquals(
        (await versionsOf(db, id)).length, versionsBefore,
    );
});

Deno.test('revoke: missing at is rejected (400)', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const res = await handleRequest(db, await invitationLatched(db, req(
        'PUT', '/organizations/' + WAYNE + '/invitations/' + id,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', WAYNE),
        { state: 'revoked' })));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});
