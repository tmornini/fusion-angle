import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';

// 401-first covenant: an unauthenticated request to ANY non-
// bearer-exempt path — including unknown and retired paths —
// returns 401, never a route-topology 404.

test('no token + unknown path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-route-ever`),
    );
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('no token + unknown nested path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-route/x1`),
    );
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('bearer + unknown path → 404', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await devToken();
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-door`, {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 404);
});
