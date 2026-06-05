import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEFAULT_ORG } from '../api/types.ts';
import { GET, handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

test('deny-by-default: a roleless principal is forbidden',
async () => {
    const db = await freshDb();   // no role granted
    const res = await handleRequest(db, new Request(
        `${BASE}/members`, {
            headers: {
                'Authorization': 'Bearer ' + await devToken(),
            },
        }));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /forbidden/);
});

test('an admin is permitted', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const rows = await GET(db, 'members', await devToken());
    assert.ok(Array.isArray(rows));   // 200, not 403
});

test('admin may write a role grant', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/role-grants/r1`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await devToken(),
            },
            body: JSON.stringify({
                organization_id: DEFAULT_ORG,
                identity_id: 'p2', role: 'viewer',
                action: 'granted',
                by_member_id: 'current',
                at: '2026-06-03T00:00:00.000Z',
            }),
        }));
    assert.equal(res.status, 200);
});

test('a non-admin may not write a role grant', async () => {
    const db = await freshDb();   // no admin
    const res = await handleRequest(db, new Request(
        `${BASE}/role-grants/r1`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await devToken(),
            },
            body: JSON.stringify({
                organization_id: DEFAULT_ORG,
                identity_id: 'p2', role: 'viewer',
                action: 'granted',
                by_member_id: 'current',
                at: '2026-06-03T00:00:00.000Z',
            }),
        }));
    assert.equal(res.status, 403);
});

test('authentication precedes authorization (401 first)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assert.equal(res.status, 401);   // no token, not 403
});
