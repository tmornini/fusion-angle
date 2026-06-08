import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { orgToken } from './token-fixtures.ts';
import { orgRow } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000Z';

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
    await db.createSchema();
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
        { email: 'sarah@x.com' }));
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
        { email: 'demo@example.com' }));
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
        await orgToken('sarah', '1')));
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
        await orgToken('sarah', '1')));
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
