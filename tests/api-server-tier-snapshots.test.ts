import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from
    './root-admin-fixture.ts';

// BOOTSTRAP_ROUTES are never bearer-exempt.

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('snapshots reject a missing bearer',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('snapshots forbid a member bearer',
async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'walt');
    const res = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`, {
            headers: {
                'Authorization':
                    'Bearer ' + await devToken('walt'),
            },
        }));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /forbidden/);
});

test('snapshots admit an admin bearer',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`, {
            headers: {
                'Authorization':
                    'Bearer ' + await devToken(),
            },
        }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body === 'string');
});
