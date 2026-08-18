import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from
    './test-fixtures.ts';
import { organizationToken } from
    './token-fixtures.ts';

const BASE = 'http://localhost';

test('GET /identities/ is the collection',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(BASE + '/identities/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(await res.json()));
});

test('GET /identities is 404 when authenticated',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(BASE + '/identities', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 404);
});

test('GET /identities/:id/ trailing slash is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db,
        new Request(
            BASE + '/identities/no-such-id/', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 404);
});
