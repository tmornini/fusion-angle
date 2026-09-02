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

// Task 23: flat records + record-attributes routes are gone
// (404, not 405). organizations/:id/flows/:id/records join family verb gaps
// stay. Nested type verb gaps live in
// api-record-types-verb-gaps.test.ts.

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('PUT /records → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/records', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE /records → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/records', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST /records/sRqRSyldQDFbqkDYSObDqw → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records/sRqRSyldQDFbqkDYSObDqw', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('POST /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/record-attributes', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/record-attributes', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST /record-attributes/'
    + 'VXTdVVRluJDRBqbXWZBntA → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes/VXTdVVRluJDRBqbXWZBntA', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('POST organizations/:id/flows/:id/records 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/records/', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PUT organizations/:id/flows/:id/records 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/records/', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/flows/:id/records 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/records/', token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/flows/:id/records/:frid 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/records/dMtgdDIobtMiwOttuwPbFw', token
            , {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PATCH /records/sRqRSyldQDFbqkDYSObDqw → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/records/sRqRSyldQDFbqkDYSObDqw', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PATCH /record-attributes/'
    + 'VXTdVVRluJDRBqbXWZBntA → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/record-attributes/VXTdVVRluJDRBqbXWZBntA', token, {},
    ));
    assertStrictEquals(res.status, 404);
});
