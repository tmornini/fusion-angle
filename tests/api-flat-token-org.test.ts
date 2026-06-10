import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

async function grantAdmin(
    db: MemoryDbAdapter,
    identityId: string,
    org: string,
) {
    await db.roleGrants.put('g-' + identityId + '-' + org, {
        organization_id: org,
        identity_id: identityId,
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: AT,
    });
}

async function join(
    db: MemoryDbAdapter,
    identityId: string,
    org: string,
) {
    await db.memberships.put('m-' + identityId + '-' + org, {
        organization_id: org,
        identity_id: identityId,
        at: AT,
    });
}

function getMembers(token: string) {
    return new Request(`${BASE}/members`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

test('a flat token resolves its org from the set default',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    await grantAdmin(db, 'current', '2');
    await db.identityDefaultOrgs.put('d1', {
        identity_id: 'current',
        organization_id: '2',
        at: AT,
    });
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 200);
});

test('a flat token falls back to its primary membership org',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    await grantAdmin(db, 'current', '2');
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 200);
});

test('a flat token with no org resolution is denied',
async () => {
    const db = await freshDb();
    await grantAdmin(db, 'current', '1');   // role, no member
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 403);
});
