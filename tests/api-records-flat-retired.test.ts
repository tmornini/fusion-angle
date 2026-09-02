import { assertStrictEquals } from '@std/assert';
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

// Task 23 pins: flat records + record-attributes wire is
// gone. Authenticated flat GET → 404; unauthenticated → 401
// first (never a topology oracle). Facade
// /organizations/:org/records re-enters flat and 404s.
// Member schema mutation on nested attributes is admin-only.

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

Deno.test('GET /records (authenticated) → 404 Not found',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/records', token),
    );
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'Not found: /records');
});

Deno.test('GET /records (unauthenticated) → 401 first',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, req('GET', '/records'),
    );
    assertStrictEquals(res.status, 401);
});

Deno.test('facade GET /organizations/AjdvjuECVZEgZoFajaIEkg/records → 404',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/records', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('member PUT nested attributes → 403',
async () => {
    const db = await freshDb();
    // Any sub other than 'XXZruirZyAOoRpNxaDnpSA' mints member roles
    // (fixtureRoles in token-fixtures.ts).
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA'
        , 'AjdvjuECVZEgZoFajaIEkg');
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'sjWcXwYGlgxxJOHxzMoUow/attributes/UQBiHFcwJeCDSnmkPBoYRA',
        token,
        {
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        },
    ));
    assertStrictEquals(res.status, 403);
});
