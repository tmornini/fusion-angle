import { test } from 'node:test';
import {
    invitationLifecycleStatesFor,
    deriveInvitationStates,
    resolveOwningOrganization,
} from '../api/derive-states.ts';
import { currentInvitationState } from
    '../api/invitations-domain.ts';
import assert from 'node:assert/strict';
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

// Phase Final Task 2: memberships on the pair plane.
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
        const [seatRequests, seatResponses] =
            await Promise.all([
                db.requests.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
                db.responses.getAllWhere(
                    'uri_collection', seatPrefix,
                ),
            ]);
        for (const document of deriveDocumentsAt(
            seatRequests, seatResponses, seatPrefix,
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

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

// Below-facade pair formation (the member-fixtures.ts idiom,
// mirroring person()'s own reasoning below): the invitation
// facade's admin/membership checks derive from the pair plane
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

// Stark '1' and Wayne '2'. Tony ('current') is admin + member
// of both; Sarah is a role-LESS Stark-only member — the
// deny-by-default policy forbids her on gated routes, which is
// exactly why the invitation facade must stand outside it.
async function seed(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    // Real organizations/:id documents (Phase 13 Task 3's fixture
    // prerequisite) — a raw db.organizations.put leaves '1'/'2'
    // derivation-invisible to deriveMembershipsForIdentity's own
    // enumerate-then-probe (via deriveOrganizations).
    await seedOrganizationDocument(db, '1', 'Stark');
    await seedOrganizationDocument(db, '2', 'Wayne');
    for (const organization of ['1', '2']) {
        await seedMembershipPair(db, 'm-current-' + organization, {
            organization_id: organization, identity_id: 'current',
        type: 'admin',
            at: AT,
        });
    }
    await person(db, 'current', 'Tony', 'demo@example.com');
    await person(db, 'sarah', 'Sarah', 'sarah@x.com');
    await seedMembershipPair(db, 'm-sarah-1', {
        organization_id: '1', identity_id: 'sarah',
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
        'POST', '/invitations',
        await organizationToken('current', '2'),
        {
            email: 'sarah@x.com',
            invitationId: 'inv-sarah',
            grantEventId: 'ev-grant',
            grantAt: AT,
        }));
    assert.equal(res.status, 201);
    return (await deriveInvitations(db))[0]!.id;
}

test('a role-less invitee may read their invitations',
async () => {
    // Sarah holds no role, so the deny-by-default policy would
    // 403 her on /members; the invitation facade stands apart.
    const db = await seed();
    await grantSarahToWayne(db);
    const res = await handleRequest(db, req(
        'GET', '/invitations', await organizationToken('sarah', '1')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { state: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, 'pending');
});

test('a non-admin is forbidden from granting', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations', await organizationToken('sarah', '1'),
        {
            email: 'demo@example.com',
            invitationId: 'inv-x', grantEventId: 'ev-x',
            grantAt: AT,
        }));
    assert.equal(res.status, 403);
});

test('a pending invite writes no membership', async () => {
    // Reachability derives from the membership ledger; a pending
    // invite must not add one, so the org stays unreachable.
    const db = await seed();
    await grantSarahToWayne(db);
    const sarahOrganizations = (await allMemberships(db))
        .filter(m => m.identity_id === 'sarah')
        .map(m => m.organization_id).sort();
    assert.deepEqual(sarahOrganizations, ['1']);
});

test('a pending invitee is absent from the roster', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const before = await rosterIds(db);
    assert.ok(!before.has('sarah'));
    // Sarah accepts; now the Wayne roster includes her.
    const id = (await deriveInvitations(db))[0]!.id;
    const acc = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-sarah', acceptEventId: 'ev-acc',
            acceptAt: AT,
        }));
    assert.equal(acc.status, 201);
    const after = await rosterIds(db);
    assert.ok(after.has('sarah'));
});

async function rosterIds(
    db: MemoryDbAdapter,
): Promise<Set<string>> {
    const res = await handleRequest(db, req(
        'GET', '/organizations/2/members',
        await organizationToken('current', '2')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    return new Set(rows.map(r => r.id));
}

test('accept makes the invitation org reachable', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-sarah-2',
            acceptEventId: 'ev-acc-2',
            acceptAt: AT,
        }));
    const sarahOrganizations = (await allMemberships(db))
        .filter(m => m.identity_id === 'sarah')
        .map(m => m.organization_id).sort();
    assert.deepEqual(sarahOrganizations, ['1', '2']);
});

// Bulk lifecycle collection RETIRED (C3). Pin invitation
// ownership via resolveOwningOrganization — inviting org
// owns the invitation; foreign askers still resolve that
// owner (and would fence it out of a bulk union that no
// longer exists).
test('an invitation event is owned by the inviting org',
async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const rows = await deriveInvitationStates(db);
    assert.ok(
        rows.some((r) => r.entity_id === id),
        'invitation lifecycle events derive for the grant',
    );
    assert.equal(
        await resolveOwningOrganization(db, id, '2'),
        '2',
    );
    assert.equal(
        await resolveOwningOrganization(db, id, '1'),
        '2',
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

test('grant: replay of fixed body is a no-op (one event)',
async () => {
    const db = await seed();
    const body = {
        email: 'sarah@x.com',
        invitationId: 'inv-idem',
        grantEventId: 'ev-g-idem',
        grantAt: GRANT_AT,
    };
    const tok = await organizationToken('current', '2');
    const r1 = await handleRequest(
        db, req('POST', '/invitations', tok, body));
    assert.equal(r1.status, 201);
    const r2 = await handleRequest(
        db, req('POST', '/invitations', tok, body));
    assert.equal(r2.status, 201);
    assert.equal((await deriveInvitations(db)).length, 1);
    assert.equal(
        (await invitationLifecycleStatesFor(db, 'inv-idem')).length, 1,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'inv-idem',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.equal(ev.at, GRANT_AT);
    assert.equal(ev.id, 'ev-g-idem');
});

test('accept: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, accept emits 1 more; a second accept
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('current', '2');
    await handleRequest(db, req('POST', '/invitations', tok, {
        email: 'sarah@x.com',
        invitationId: 'inv-ai',
        grantEventId: 'ev-gai',
        grantAt: GRANT_AT,
    }));
    const accBody = {
        membershipId: 'ms-idem',
        acceptEventId: 'ev-a-idem',
        acceptAt: ACCEPT_AT,
    };
    const sTok = await organizationToken('sarah', '1');
    const a1 = await handleRequest(db, req(
        'POST', '/invitations/inv-ai/acceptance',
        sTok, accBody));
    assert.equal(a1.status, 201);
    const a2 = await handleRequest(db, req(
        'POST', '/invitations/inv-ai/acceptance',
        sTok, accBody));
    assert.equal(a2.status, 201);
    assert.equal(
        (await invitationLifecycleStatesFor(db, 'inv-ai')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'inv-ai',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.equal(ev.at, ACCEPT_AT);
    assert.equal(ev.id, 'ev-a-idem');
    assert.equal(ev.member_id, 'sarah');
});

test('decline: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, decline emits 1 more; a second
    // decline of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('current', '2');
    await handleRequest(db, req('POST', '/invitations', tok, {
        email: 'sarah@x.com',
        invitationId: 'inv-di',
        grantEventId: 'ev-gdi',
        grantAt: GRANT_AT,
    }));
    const decBody = {
        declineEventId: 'ev-d-idem',
        declineAt: DECLINE_AT,
    };
    const sTok = await organizationToken('sarah', '1');
    const d1 = await handleRequest(db, req(
        'POST', '/invitations/inv-di/decline',
        sTok, decBody));
    assert.equal(d1.status, 201);
    const d2 = await handleRequest(db, req(
        'POST', '/invitations/inv-di/decline',
        sTok, decBody));
    assert.equal(d2.status, 201);
    assert.equal(
        (await invitationLifecycleStatesFor(db, 'inv-di')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'inv-di',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.equal(ev.at, DECLINE_AT);
    assert.equal(ev.id, 'ev-d-idem');
});

test('revoke: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, revoke emits 1 more; a second revoke
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await organizationToken('current', '2');
    await handleRequest(db, req('POST', '/invitations', tok, {
        email: 'sarah@x.com',
        invitationId: 'inv-ri',
        grantEventId: 'ev-gri',
        grantAt: GRANT_AT,
    }));
    const revBody = {
        revokeEventId: 'ev-r-idem',
        revokeAt: REVOKE_AT,
    };
    const r1 = await handleRequest(db, req(
        'POST', '/invitations/inv-ri/revocation',
        tok, revBody));
    assert.equal(r1.status, 201);
    const r2 = await handleRequest(db, req(
        'POST', '/invitations/inv-ri/revocation',
        tok, revBody));
    assert.equal(r2.status, 201);
    assert.equal(
        (await invitationLifecycleStatesFor(db, 'inv-ri')).length, 2,
    );
    // Event carries the caller-supplied at.
    const life = await invitationLifecycleStatesFor(
        db, 'inv-ri',
    );
    const ev = [...life].sort((a, b) =>
        a.at < b.at ? -1
            : a.at > b.at ? 1
            : a.id < b.id ? -1
            : a.id > b.id ? 1 : 0,
    ).at(-1)!;
    assert.equal(ev.at, REVOKE_AT);
    assert.equal(ev.id, 'ev-r-idem');
    assert.equal(ev.member_id, 'current');
});

// Gap-1 gate: empty ids are rejected at the gate (400).

test('grant: empty invitationId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations',
        await organizationToken('current', '2'),
        {
            email: 'sarah@x.com',
            invitationId: '',
            grantEventId: 'ev-x',
            grantAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('grant: empty grantEventId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations',
        await organizationToken('current', '2'),
        {
            email: 'sarah@x.com',
            invitationId: 'inv-x',
            grantEventId: '',
            grantAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('accept: empty membershipId is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: '',
            acceptEventId: 'ev-x',
            acceptAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('decline: empty declineEventId is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await organizationToken('sarah', '1'),
        {
            declineEventId: '',
            declineAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('revoke: empty revokeEventId is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken('current', '2'),
        {
            revokeEventId: '',
            revokeAt: AT,
        }));
    assert.equal(res.status, 400);
});

// Gap-2 gate: missing or non-string fields are rejected (400),
// not uncaught (500). pickString and validateTimestampField both
// throw ValidationError on these inputs; the domain functions
// must catch and translate, not leak.

test('grant: missing invitationId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations',
        await organizationToken('current', '2'),
        {
            email: 'sarah@x.com',
            // invitationId intentionally absent
            grantEventId: 'ev-x',
            grantAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('grant: non-string grantAt is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations',
        await organizationToken('current', '2'),
        {
            email: 'sarah@x.com',
            invitationId: 'inv-x',
            grantEventId: 'ev-x',
            grantAt: 42,   // non-string
        }));
    assert.equal(res.status, 400);
});

test('accept: missing acceptEventId is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-x',
            // acceptEventId intentionally absent
            acceptAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('accept: non-string acceptAt is rejected (400)',
async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-x',
            acceptEventId: 'ev-x',
            acceptAt: 42,   // non-string
        }));
    assert.equal(res.status, 400);
});

test('decline: missing declineAt is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await organizationToken('sarah', '1'),
        {
            declineEventId: 'ev-x',
            // declineAt intentionally absent
        }));
    assert.equal(res.status, 400);
});

// KEEP-ATOMIC (Author gate 6e): a removed member cannot
// re-admit themselves by merely replaying their old acceptance.
// currentInvitationState's 'accepted' branch short-circuits to
// a no-op BEFORE the membership-existence check ever runs, so
// the property holds today already — this pin proves it against
// TODAY's code, before Phase 8 Task 6 adds the document-plane
// synthesis around this same accept path.
test('a removed member who re-accepts gets a no-op — not a'
+ ' silent re-admission (KEEP-ATOMIC)', async () => {
    // Distinct, strictly-increasing `at` stamps: grant/accept
    // share one invitation entity_id in the states log, so a tied
    // `at` would fall to the (at, id) reduction's id tie-break —
    // the SAME reduction currentInvitationState reads — rather
    // than proving the property this test exists to pin.
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const accept = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-sarah-removed',
            acceptEventId: 'ev-acc-removed',
            acceptAt: '2026-01-01T00:00:01.000000Z',
        }));
    assert.equal(accept.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/2/members/sarah',
        await organizationToken('current', '2')));
    assert.equal(del.status, 204);
    const statesBefore = (await invitationLifecycleStatesFor(db, id)).length;
    const reaccept = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        {
            membershipId: 'ms-sarah-again',
            acceptEventId: 'ev-acc-again',
            acceptAt: '2026-01-01T00:00:02.000000Z',
        }));
    assert.equal(reaccept.status, 201);
    const sarahInWayne = (await allMemberships(db))
        .filter(m => m.identity_id === 'sarah'
            && m.organization_id === '2');
    assert.deepEqual(sarahInWayne, []);
    assert.equal(
        (await invitationLifecycleStatesFor(db, id)).length, statesBefore,
    );
});

test('revoke: missing revokeAt is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await deriveInvitations(db))[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken('current', '2'),
        {
            revokeEventId: 'ev-x',
            // revokeAt intentionally absent
        }));
    assert.equal(res.status, 400);
});
