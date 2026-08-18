import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

test('deny-by-default: a roleless principal is forbidden',
async () => {
    const db = await freshDb();   // no role granted
    const res = await handleRequest(db, new Request(
        `${BASE}/identities/`, {
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
    const rows = await GET(db, 'organizations/1/members/', await devToken());
    assert.ok(Array.isArray(rows));   // 200, not 403
});

test('role-grants routes are retired (404)', async () => {
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
                organization_id: '1',
                identity_id: 'p2',
                role: 'viewer',
                action: 'granted',
                by_member_id: 'current',
                at: '2026-06-03T00:00:00.000000Z',
            }),
        }));
    assert.equal(res.status, 404);
});

test('admin may write a membership type', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/1/members/p2`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await devToken(),
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify({
                type: 'member',
                at: '2026-06-03T00:00:00.000000Z',
            }),
        }));
    assert.equal(res.status, 201);
});

test('authentication precedes authorization (401 first)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assert.equal(res.status, 401);   // no token, not 403
});
