import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Pins the CURRENT status of every deliberate records-family
// verb gap, through handleRequest, so the bundle-synthesis
// commit (Task 4: the create/edit op gains the document +
// attribute pairs) cannot silently move one — this commit adds
// no dispatch, only a fixed pre-existing truth to hold the line
// against. The list is exactly 11: PUT/DELETE records; POST
// records/:id; POST/PUT/DELETE record-attributes; POST
// record-attributes/:id; POST/PUT/DELETE flows/:id/records;
// POST flows/:id/records/:frid.

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
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('PUT records 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/records', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE records 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/records', token),
    );
    assert.equal(res.status, 405);
});

test('POST records/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/records/rec1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('POST record-attributes 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT record-attributes 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/record-attributes', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE record-attributes 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/record-attributes', token),
    );
    assert.equal(res.status, 405);
});

test('POST record-attributes/:id 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/record-attributes/attr1', token, {},
    ));
    assert.equal(res.status, 405);
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
