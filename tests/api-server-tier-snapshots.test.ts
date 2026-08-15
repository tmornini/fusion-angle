import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { setServerTier } from '../api/request-auth.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from
    './root-admin-fixture.ts';

// Server ZIP: BOOTSTRAP_ROUTES are not bearer-exempt.
// The browser ZIP (flag off) keeps the demo exemption.
// Reset after every test so a leak cannot poison
// browser-tier pins in the same process.

const BASE = 'http://localhost';

afterEach(() => {
    setServerTier(false);
});

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('server-tier snapshots reject a missing bearer',
async () => {
    setServerTier(true);
    const db = await freshDb();
    const res = await handleRequest(db, new Request(
        `${BASE}/snapshots/schema`));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('server-tier snapshots forbid a member bearer',
async () => {
    setServerTier(true);
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

test('server-tier snapshots admit an admin bearer',
async () => {
    setServerTier(true);
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
