import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Task 23: flat records + record-attributes routes are gone
// (404, not 405). flows/:id/records join family verb gaps
// stay. Nested type verb gaps live in
// api-record-types-verb-gaps.test.ts.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body === undefined
            ? {} : { body: JSON.stringify(body) }),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('PUT /records → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/records', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE /records → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/records', token),
    );
    assert.equal(res.status, 404);
});

test('POST /records/rec1 → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records/rec1', token, {},
    ));
    assert.equal(res.status, 404);
});

test('POST /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes', token, {},
    ));
    assert.equal(res.status, 404);
});

test('PUT /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/record-attributes', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE /record-attributes → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/record-attributes', token),
    );
    assert.equal(res.status, 404);
});

test('POST /record-attributes/attr1 → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes/attr1', token, {},
    ));
    assert.equal(res.status, 404);
});

test('POST flows/:id/records 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/flows/f1/records', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT flows/:id/records 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/flows/f1/records', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE flows/:id/records 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/flows/f1/records', token),
    );
    assert.equal(res.status, 405);
});

test('POST flows/:id/records/:frid 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/flows/f1/records/frid1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PATCH /records/rec1 → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/records/rec1', token, {},
    ));
    assert.equal(res.status, 404);
});

test('PATCH /record-attributes/attr1 → 404 (flat retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/record-attributes/attr1', token, {},
    ));
    assert.equal(res.status, 404);
});
