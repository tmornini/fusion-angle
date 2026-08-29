import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Task 55: the old roster families are gone. Authenticated
// requests 404; unauthenticated requests 401 first (never
// a topology oracle). Seat collection
// /organizations/:id/members stays live.

const RETIRED_PATHS: readonly string[] = [
    '/members',
    '/members/x1',
    '/members/x1/versions',
    '/human-members',
    '/human-members/x1',
    '/ai-members',
    '/ai-members/x1',
    '/memberships',
    '/memberships/x1',
    '/XeNICvLNKhXddnTKnszfpQ',
];

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

for (const path of RETIRED_PATHS) {
    test('GET ' + path + ' (authenticated) → 404',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const res = await handleRequest(
            db, req('GET', path, token),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as {
            error: string;
        };
        assert.equal(body.error, 'Not found: ' + path);
    });

    test('GET ' + path + ' (unauthenticated) → 401',
    async () => {
        const db = await freshDb();
        const res = await handleRequest(
            db, req('GET', path),
        );
        assert.equal(res.status, 401);
    });
}

test('seat collection stays live', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db,
        req(
            'GET',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/members/',
            token,
        ),
    );
    assert.equal(res.status, 200);
});
