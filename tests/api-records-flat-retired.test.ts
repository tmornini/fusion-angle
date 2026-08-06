import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Task 23 pins: flat records + record-attributes wire is
// gone. Authenticated flat GET → 404; unauthenticated → 401
// first (never a topology oracle). Facade
// /organizations/:org/records re-enters flat and 404s.
// Member schema mutation on nested attributes is admin-only.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token !== undefined) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    return new Request(`${BASE}${path}`, {
        method,
        headers,
        ...(body === undefined
            ? {}
            : { body: JSON.stringify(body) }),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('GET /records (authenticated) → 404 Not found',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/records', token),
    );
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'Not found: /records');
});

test('GET /records (unauthenticated) → 401 first',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/records'),
    );
    assert.equal(res.status, 401);
});

test('facade GET /organizations/1/records → 404',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db,
        req('GET', '/organizations/1/records', token),
    );
    assert.equal(res.status, 404);
});

test('member PUT nested attributes → 403',
async () => {
    const db = await freshDb();
    // Any sub other than 'current' mints member roles
    // (fixtureRoles in token-fixtures.ts).
    const token = await organizationToken('member1', '1');
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/1/record-types/rt-1/attributes/a-1',
        token,
        {
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        },
    ));
    assert.equal(res.status, 403);
});
