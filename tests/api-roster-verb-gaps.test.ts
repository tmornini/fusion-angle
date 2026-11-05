import { assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';

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
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Eighteen invitation paths 404 through handleRequest.
// None is a route: invitations, invitations/sent,
// invitations/:id/acceptance, invitations/:id/decline,
// invitations/:id/revocation, and bare invitations/:id.
// Retired roster routes (members / human-members /
// ai-members / memberships / XeNICvLNKhXddnTKnszfpQ) 404
// after auth. Those pins live in
// tests/api-roster-retired.test.ts.

// ── invitation 404s (18) ──

Deno.test('PUT invitations 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/invitations', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/invitations', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT invitations/sent 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/invitations/sent', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST invitations/sent 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/invitations/sent', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations/sent 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/invitations/sent', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/acceptance', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/acceptance', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/acceptance', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('GET invitations/:id/decline 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/decline', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT invitations/:id/decline 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/decline', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations/:id/decline 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/decline', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('GET invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/revocation', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/revocation', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/jEoYCFtPjXFEgZqZNtOcEA/revocation', token,
    ));
    assertStrictEquals(res.status, 404);
});

// Bare invitations/:id is not a route. Every verb 404s.

Deno.test('GET invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/WatGDdZmAxtYsLoAFrOaxA', token,
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/WatGDdZmAxtYsLoAFrOaxA', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('POST invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/invitations/WatGDdZmAxtYsLoAFrOaxA', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE invitations/:id (bogus path) 404s on every'
+ ' verb', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/WatGDdZmAxtYsLoAFrOaxA', token,
    ));
    assertStrictEquals(res.status, 404);
});
