import { assert, assertMatch, assertStrictEquals } from '@std/assert';
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

Deno.test('deny-by-default: a roleless principal is forbidden',
async () => {
    const db = await freshDb();   // no role granted
    const res = await handleRequest(db, new Request(
        `${BASE}/identities/`, {
            headers: {
                'Authorization': 'Bearer ' + await devToken(),
            },
        }));
    assertStrictEquals(res.status, 403);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /forbidden/);
});

Deno.test('an admin is permitted', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const rows = await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
        + '', await devToken());
    assert(Array.isArray(rows));   // 200, not 403
});

Deno.test('role-grants routes are retired (404)', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/role-grants/rOEPOcVMQdJiiiMuiiEhlg`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await devToken(),
            },
            body: JSON.stringify({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                identity_id: 'prBESZPjJDiuXCeZLmbiVw',
                role: 'viewer',
                action: 'granted',
                by_member_id: 'XXZruirZyAOoRpNxaDnpSA',
                at: '2026-06-03T00:00:00.000000Z',
            }),
        }));
    assertStrictEquals(res.status, 404);
});

Deno.test('admin may write a membership type', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/`
            + 'AjdvjuECVZEgZoFajaIEkg/members/'
            + 'prBESZPjJDiuXCeZLmbiVw', {
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
    assertStrictEquals(res.status, 201);
});

Deno.test('authentication precedes authorization (401 first)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assertStrictEquals(res.status, 401);   // no token, not 403
});
