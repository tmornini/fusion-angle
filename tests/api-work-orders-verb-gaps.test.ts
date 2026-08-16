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

// Pins the CURRENT status of every deliberate work-orders-family
// verb gap, through handleRequest, so the fourth-family
// absorption (api/document-family.ts) cannot silently move one —
// the generic constructors replace the hand-written PUT
// work-orders/:id scaffolding, never the sibling routes below,
// but a gate-level regression could still shift these. A future
// change to any of these statuses must re-derive the
// covenant deliberately, not by accident of refactoring.
// Task 61: claim is GET/PUT/DELETE (404 when unclaimed);
// binding is create-only PUT (POST gone); release POST is
// gone. Transition GET/PUT/DELETE stay 405.

const BASE = 'http://localhost';

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

test('PUT work-orders 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders', token, {},
    ));
    assert.equal(res.status, 405);
});

// Task 10: PATCH alphabet — no work-orders patch yet.
test('PATCH work-orders/:id 405s (no patch handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/work-orders/wo1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE work-orders 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/work-orders', token),
    );
    assert.equal(res.status, 405);
});

test('POST work-orders/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE work-orders/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/work-orders/wo1', token),
    );
    assert.equal(res.status, 405);
});

test('GET work-orders/:id/claim 404s when unclaimed',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/work-orders/wo1/claim', token),
    );
    assert.equal(res.status, 404);
});

test('PUT work-orders/:id/claim empty body is 400',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders/wo1/claim', token, {},
    ));
    assert.equal(res.status, 400);
});

test('DELETE work-orders/:id/claim 404s when unclaimed',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/work-orders/wo1/claim', token),
    );
    assert.equal(res.status, 404);
});

test('POST work-orders/:id/claim 405s (POST is gone)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo1/claim', token, {},
    ));
    assert.equal(res.status, 405);
});

test('POST work-orders/:id/release 404s (address retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo1/release', token, {},
    ));
    assert.equal(res.status, 404);
});

test('GET work-orders/:id/transition 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/work-orders/wo1/transition', token),
    );
    assert.equal(res.status, 405);
});

test('PUT work-orders/:id/transition 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders/wo1/transition', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE work-orders/:id/transition 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/work-orders/wo1/transition', token),
    );
    assert.equal(res.status, 405);
});

test('GET work-orders/:id/binding 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/work-orders/w1/binding', token),
    );
    assert.equal(res.status, 405);
});

test('PUT work-orders/:id/binding on a missing WO is 404',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders/w1/binding', token, {},
    ));
    assert.equal(res.status, 404);
});

test('POST work-orders/:id/binding 405s (POST is gone)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/work-orders/w1/binding', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE work-orders/:id/binding 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/work-orders/w1/binding', token),
    );
    assert.equal(res.status, 405);
});

test('POST flows/:id/work-orders 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/flows/f1/work-orders', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT flows/:id/work-orders 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/flows/f1/work-orders', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE flows/:id/work-orders 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/flows/f1/work-orders', token),
    );
    assert.equal(res.status, 405);
});

// The DELETE 405 for this SAME address is already pinned in
// api-flows-verb-gaps.test.ts ('DELETE flows/:id/work-orders/
// :woid 405s') — left there rather than duplicated here, since
// that suite pinned it first, against the third-family
// absorption.

test('GET flows/:id/work-orders/:woid 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/flows/f1/work-orders/wo1', token),
    );
    assert.equal(res.status, 405);
});

test('POST flows/:id/work-orders/:woid 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/flows/f1/work-orders/wo1', token, {},
    ));
    assert.equal(res.status, 405);
});
