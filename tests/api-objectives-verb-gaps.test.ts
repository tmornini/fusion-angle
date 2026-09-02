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

// Pins the CURRENT status of every deliberate objectives-family
// verb gap, through handleRequest, so Task 2's document-wiring
// registration (api/document-family.ts) cannot silently move
// one — dispatch keys on the STATIC route objects, so every
// pinned status is stable across every later objectives task in
// this phase. The list is exactly 22 (2+2+3+3+3+3+3+3): PUT/
// DELETE objectives; POST/DELETE organizations/:id/objectives/:id; POST/PUT/
// DELETE organizations/:id/objectives/:id/revisions; GET/POST/DELETE
// organizations/:id/objectives/:id/revisions/:rid; POST/PUT/DELETE
// organizations/:id/projects/:id/objective-baseline-scores; GET/POST/DELETE
// organizations/:id/projects/:id/objective-baseline-scores/:sid;
// POST/PUT/DELETE
// organizations/:id/projects/:id/objective-actual-scores; GET/POST/DELETE
// organizations/:id/projects/:id/objective-actual-scores/:sid.

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

Deno.test('PUT objectives 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

// Task 10: PATCH alphabet — no objectives-family patch yet.
Deno.test('PATCH organizations/:id/objectives/:id 405s (no patch handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE objectives 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + '', token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/objectives/:id 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/objectives/:id 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg', token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/objectives/:id/revisions 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PUT organizations/:id/objectives/:id/revisions 405s (no put'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/', token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/objectives/:id/revisions'
    + ' 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/', token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('GET organizations/:id/objectives/:id/revisions/:rid'
    + ' 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/rOEPOcVMQdJiiiMuiiEhlg'
            , token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/objectives/:id/revisions/:rid 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/rOEPOcVMQdJiiiMuiiEhlg'
            , token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/objectives/:id/revisions/:rid 405s (no'
+ ' delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg/revisions/rOEPOcVMQdJiiiMuiiEhlg',
            token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/projects/:id/objective-baseline-scores 405s'
+ ' (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PUT organizations/:id/projects/:id/objective-baseline-scores 405s'
+ ' (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/projects/:id'
    + '/objective-baseline-scores 405s (no'
+ ' delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/',
        token,
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('GET organizations/:id/projects/:id/objective-baseline-scores/:sid'
+ ' 405s (no get handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token,
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/projects/:id/objective-baseline-scores/:sid'
+ ' 405s (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/projects/:id/objective-baseline-scores'
+ '/:sid 405s (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-baseline-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token,
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/projects/:id/objective-actual-scores 405s'
+ ' (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('PUT organizations/:id/projects/:id/objective-actual-scores 405s'
+ ' (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/projects/:id/objective-actual-scores'
+ ' 405s (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/',
        token,
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('GET organizations/:id/projects/:id'
    + '/objective-actual-scores/:sid 405s (no'
+ ' get handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token,
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('POST organizations/:id/projects/:id/objective-actual-scores/:sid'
+ ' 405s (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token, {},
    ));
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE organizations/:id/projects/:id/objective-actual-scores/:sid'
+ ' 405s (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/objective-actual-scores/'
            + 'syWUUcdBSbBgMwBiCrgbDw',
        token,
    ));
    assertStrictEquals(res.status, 405);
});
