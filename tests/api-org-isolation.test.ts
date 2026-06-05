import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

function ideaBody(org: string, title: string) {
    return {
        organization_id: org, title,
        position: 0, problem_statement: '',
        target_users: '', proposed_solution: '',
        expected_outcome: '', success_metrics: '',
    };
}

function orgRow(name: string) {
    return {
        name, domain: 'x.com',
        next_billing: '2026-01-01T00:00:00.000Z',
        seats: 10, used_seats: 1,
        projects_limit: 10, ideas_limit: 10,
        last_activity: '2026-01-01T00:00:00.000Z',
    };
}

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

// `current` holds admin in org A (the administered org) and
// in org '1' (seedRootAdmin), and is a member of both. Ideas
// exist in both A and B. Roles are per-org since Phase 3, so
// the org-A grant authorizes the facade tests; seedRootAdmin's
// org '1' grant + membership keep the flat-token enumerate
// test authorized.
async function twoOrgs(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    await db.roleGrants.put('role-current-admin-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000Z',
    });
    await db.memberships.put('m-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000Z',
    });
    await db.ideas.put('a1', ideaBody('A', 'mine'));
    await db.ideas.put('b1', ideaBody('B', 'theirs'));
    return db;
}

test('a facade GET returns only the bound org rows',
async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas',
        await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a facade into a non-member org is 403', async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/ideas',
        await devToken('current')));
    assert.equal(res.status, 403);
});

test('a facade PUT stamps the bound org over a forged body',
async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/a2',
        await devToken('current'),
        { id: 'a2', ...ideaBody('B', 'forged') }));
    assert.equal(res.status, 200);
    const stored = await db.ideas.getById('a2');
    assert.equal(stored.organization_id, 'A');
});

test('enumerate returns only the caller member orgs',
async () => {
    const db = await twoOrgs();
    await db.organizations.put('A', orgRow('Acme'));
    await db.organizations.put('B', orgRow('Beta'));
    const res = await handleRequest(db, req(
        'GET', '/organizations', await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['A']);
});

test('the facade requires a bearer token', async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/A/ideas`));
    assert.equal(res.status, 401);
});
