import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { orgToken } from './token-fixtures.ts';
import { orgRow } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// Stark '1' and Wayne '2'. Tony ('current') is admin + member
// of both; Sarah is a role-LESS Stark-only member — the
// deny-by-default policy forbids her on gated routes, which is
// exactly why the invitation facade must stand outside it.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.organizations.put('1', orgRow('Stark'));
    await db.organizations.put('2', orgRow('Wayne'));
    for (const org of ['1', '2']) {
        await db.roleGrants.put('rg-current-' + org, {
            organization_id: org, identity_id: 'current',
            role: 'admin', action: 'granted',
            by_member_id: 'system', at: AT,
        });
        await db.memberships.put('m-current-' + org, {
            organization_id: org, identity_id: 'current',
            at: AT,
        });
    }
    await person(db, 'current', 'Tony', 'demo@example.com');
    await person(db, 'sarah', 'Sarah', 'sarah@x.com');
    await db.memberships.put('m-sarah-1', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    return db;
}

async function person(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await db.members.put(id, { type: 'human' });
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, {
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
        await orgToken('current', '2'),
        {
            email: 'sarah@x.com',
            invitationId: 'inv-sarah',
            grantEventId: 'ev-grant',
            grantAt: AT,
        }));
    assert.equal(res.status, 200);
    return (await db.invitations.getAll())[0]!.id;
}

test('a role-less invitee may read their invitations',
async () => {
    // Sarah holds no role, so the deny-by-default policy would
    // 403 her on /members; the invitation facade stands apart.
    const db = await seed();
    await grantSarahToWayne(db);
    const res = await handleRequest(db, req(
        'GET', '/invitations', await orgToken('sarah', '1')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { state: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, 'pending');
});

test('a non-admin is forbidden from granting', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations', await orgToken('sarah', '1'),
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
    const sarahOrgs = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'sarah')
        .map(m => m.organization_id).sort();
    assert.deepEqual(sarahOrgs, ['1']);
});

test('a pending invitee is absent from the roster', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const before = await rosterIds(db);
    assert.ok(!before.has('sarah'));
    // Sarah accepts; now the Wayne roster includes her.
    const id = (await db.invitations.getAll())[0]!.id;
    const acc = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await orgToken('sarah', '1'),
        {
            membershipId: 'ms-sarah', acceptEventId: 'ev-acc',
            acceptAt: AT,
        }));
    assert.equal(acc.status, 204);
    const after = await rosterIds(db);
    assert.ok(after.has('sarah'));
});

async function rosterIds(
    db: MemoryDbAdapter,
): Promise<Set<string>> {
    const res = await handleRequest(db, req(
        'GET', '/members', await orgToken('current', '2')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    return new Set(rows.map(r => r.id));
}

test('accept makes the invitation org reachable', async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await orgToken('sarah', '1'),
        {
            membershipId: 'ms-sarah-2',
            acceptEventId: 'ev-acc-2',
            acceptAt: AT,
        }));
    const sarahOrgs = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'sarah')
        .map(m => m.organization_id).sort();
    assert.deepEqual(sarahOrgs, ['1', '2']);
});

test('an invitation event stays out of other orgs /states',
async () => {
    const db = await seed();
    const id = await grantSarahToWayne(db);
    const wayne = await statesEntityIds(db, '2');
    assert.ok(wayne.has(id));   // visible in the inviting org
    const stark = await statesEntityIds(db, '1');
    assert.ok(!stark.has(id));  // hidden from every other tenant
});

async function statesEntityIds(
    db: MemoryDbAdapter,
    org: string,
): Promise<Set<string>> {
    const res = await handleRequest(db, req(
        'GET', '/states', await orgToken('current', org)));
    assert.equal(res.status, 200);
    const rows = await res.json() as { entity_id: string }[];
    return new Set(rows.map(r => r.entity_id));
}

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
    const tok = await orgToken('current', '2');
    const r1 = await handleRequest(
        db, req('POST', '/invitations', tok, body));
    assert.equal(r1.status, 200);
    const r2 = await handleRequest(
        db, req('POST', '/invitations', tok, body));
    assert.equal(r2.status, 200);
    assert.equal((await db.invitations.getAll()).length, 1);
    assert.equal(
        (await db.states.getAllFor('inv-idem')).length, 1,
    );
    // Event carries the caller-supplied at.
    const ev = await db.states.getCurrentFor('inv-idem');
    assert.equal(ev?.at, GRANT_AT);
    assert.equal(ev?.id, 'ev-g-idem');
});

test('accept: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, accept emits 1 more; a second accept
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await orgToken('current', '2');
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
    const sTok = await orgToken('sarah', '1');
    const a1 = await handleRequest(db, req(
        'POST', '/invitations/inv-ai/acceptance',
        sTok, accBody));
    assert.equal(a1.status, 204);
    const a2 = await handleRequest(db, req(
        'POST', '/invitations/inv-ai/acceptance',
        sTok, accBody));
    assert.equal(a2.status, 204);
    assert.equal(
        (await db.states.getAllFor('inv-ai')).length, 2,
    );
    // Event carries the caller-supplied at.
    const ev = await db.states.getCurrentFor('inv-ai');
    assert.equal(ev?.at, ACCEPT_AT);
    assert.equal(ev?.id, 'ev-a-idem');
    // Author is server-derived (the invitee's identity id).
    assert.equal(ev?.member_id, 'sarah');
});

test('decline: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, decline emits 1 more; a second
    // decline of the same body must not emit a third.
    const db = await seed();
    const tok = await orgToken('current', '2');
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
    const sTok = await orgToken('sarah', '1');
    const d1 = await handleRequest(db, req(
        'POST', '/invitations/inv-di/decline',
        sTok, decBody));
    assert.equal(d1.status, 204);
    const d2 = await handleRequest(db, req(
        'POST', '/invitations/inv-di/decline',
        sTok, decBody));
    assert.equal(d2.status, 204);
    assert.equal(
        (await db.states.getAllFor('inv-di')).length, 2,
    );
    // Event carries the caller-supplied at.
    const ev = await db.states.getCurrentFor('inv-di');
    assert.equal(ev?.at, DECLINE_AT);
    assert.equal(ev?.id, 'ev-d-idem');
});

test('revoke: replay of fixed body is a no-op (two events total)',
async () => {
    // grant emits 1 event, revoke emits 1 more; a second revoke
    // of the same body must not emit a third.
    const db = await seed();
    const tok = await orgToken('current', '2');
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
    assert.equal(r1.status, 204);
    const r2 = await handleRequest(db, req(
        'POST', '/invitations/inv-ri/revocation',
        tok, revBody));
    assert.equal(r2.status, 204);
    assert.equal(
        (await db.states.getAllFor('inv-ri')).length, 2,
    );
    // Event carries the caller-supplied at.
    const ev = await db.states.getCurrentFor('inv-ri');
    assert.equal(ev?.at, REVOKE_AT);
    assert.equal(ev?.id, 'ev-r-idem');
    // Author is server-derived (the admin's identity id).
    assert.equal(ev?.member_id, 'current');
});

// Gap-1 gate: empty ids are rejected at the gate (400).

test('grant: empty invitationId is rejected (400)', async () => {
    const db = await seed();
    const res = await handleRequest(db, req(
        'POST', '/invitations',
        await orgToken('current', '2'),
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
        await orgToken('current', '2'),
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
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await orgToken('sarah', '1'),
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
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await orgToken('sarah', '1'),
        {
            declineEventId: '',
            declineAt: AT,
        }));
    assert.equal(res.status, 400);
});

test('revoke: empty revokeEventId is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await orgToken('current', '2'),
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
        await orgToken('current', '2'),
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
        await orgToken('current', '2'),
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
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await orgToken('sarah', '1'),
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
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await orgToken('sarah', '1'),
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
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await orgToken('sarah', '1'),
        {
            declineEventId: 'ev-x',
            // declineAt intentionally absent
        }));
    assert.equal(res.status, 400);
});

test('revoke: missing revokeAt is rejected (400)', async () => {
    const db = await seed();
    await grantSarahToWayne(db);
    const id = (await db.invitations.getAll())[0]!.id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await orgToken('current', '2'),
        {
            revokeEventId: 'ev-x',
            // revokeAt intentionally absent
        }));
    assert.equal(res.status, 400);
});
