import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token: string,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// `current` is a member of BOTH orgs but admin ONLY in A.
// The exchange is membership-fenced, so it succeeds into
// either org — which means AUTHZ, not the fence, is what
// must keep the org-A grant from acting in org B.
async function memberOfBothAdminInA(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.memberships.put('m-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.memberships.put('m-b', {
        organization_id: 'B', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.roleGrants.put('g-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('a role granted in org A does not authorize in org B',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/ideas',
        await devToken('current')));
    assert.equal(res.status, 403);
});

test('the same role authorizes within its own org',
async () => {
    const db = await memberOfBothAdminInA();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas',
        await devToken('current')));
    assert.equal(res.status, 200);
});

test('a flat token authorizes via its resolved membership',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.memberships.put('m', {
        organization_id: '1', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.roleGrants.put('g', {
        organization_id: '1', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'GET', '/members', await devToken('current')));
    assert.equal(res.status, 200);
});
