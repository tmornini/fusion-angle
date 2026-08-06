import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Pins deliberate verb gaps on nested record-types so Task 9's
// composed POST cannot silently inherit an accidental handler.
// Mirror of tests/api-records-verb-gaps.test.ts phrasing.

const BASE = 'http://localhost';
const COLLECTION = '/organizations/1/record-types';
const DETAIL = COLLECTION + '/rt-1';
const HISTORY = DETAIL + '/history';

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
            Authorization: 'Bearer ' + token,
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

test('PUT .../record-types 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', COLLECTION, token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE .../record-types 405s (no delete handler '
+ 'wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', COLLECTION, token),
    );
    assert.equal(res.status, 405);
});

test('POST .../record-types/:id 405s (no post handler '
+ 'wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', DETAIL, token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT .../record-types/:id/history 405s (no put '
+ 'handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', HISTORY, token, {},
    ));
    assert.equal(res.status, 405);
});

test('POST .../record-types/:id/history 405s (no post '
+ 'handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', HISTORY, token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE .../record-types/:id/history 405s (no '
+ 'delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', HISTORY, token),
    );
    assert.equal(res.status, 405);
});

// Task 10: PATCH alphabet — no nested schema patch yet.
test('PATCH .../record-types/:id 405s (no patch'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', DETAIL, token, {},
    ));
    assert.equal(res.status, 405);
});

// Nested attributes verb gaps (Task 7): no collection POST;
// PUT/DELETE detail are live (create is PUT).

const ATTRS = DETAIL + '/attributes';
const ATTR_DETAIL = ATTRS + '/attr-1';

test('POST .../attributes 405s (no create verb — '
+ 'parity with flat family)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', ATTRS, token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT .../attributes 405s (no collection put)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', ATTRS, token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE .../attributes 405s (no collection '
+ 'delete)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', ATTRS, token),
    );
    assert.equal(res.status, 405);
});

test('POST .../attributes/:id 405s (no post on '
+ 'detail)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', ATTR_DETAIL, token, {},
    ));
    assert.equal(res.status, 405);
});

test('PATCH .../attributes/:id 405s (no patch'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', ATTR_DETAIL, token, {},
    ));
    assert.equal(res.status, 405);
});
