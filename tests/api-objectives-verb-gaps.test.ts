import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Pins the CURRENT status of every deliberate objectives-family
// verb gap, through handleRequest, so Task 2's document-wiring
// registration (api/document-family.ts) cannot silently move
// one — dispatch keys on the STATIC route objects, so every
// pinned status is stable across every later objectives task in
// this phase. The list is exactly 22 (2+2+3+3+3+3+3+3): PUT/
// DELETE objectives; POST/DELETE objectives/:id; POST/PUT/
// DELETE objectives/:id/revisions; GET/POST/DELETE
// objectives/:id/revisions/:rid; POST/PUT/DELETE
// projects/:id/objective-baseline-scores; GET/POST/DELETE
// projects/:id/objective-baseline-scores/:sid; POST/PUT/DELETE
// projects/:id/objective-actual-scores; GET/POST/DELETE
// projects/:id/objective-actual-scores/:sid.

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

test('PUT objectives 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/objectives', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE objectives 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/objectives', token),
    );
    assert.equal(res.status, 405);
});

test('POST objectives/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/objectives/o1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE objectives/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/objectives/o1', token),
    );
    assert.equal(res.status, 405);
});

test('POST objectives/:id/revisions 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/objectives/o1/revisions', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT objectives/:id/revisions 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/objectives/o1/revisions', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE objectives/:id/revisions 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/objectives/o1/revisions', token),
    );
    assert.equal(res.status, 405);
});

test('GET objectives/:id/revisions/:rid 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/objectives/o1/revisions/r1', token),
    );
    assert.equal(res.status, 405);
});

test('POST objectives/:id/revisions/:rid 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/objectives/o1/revisions/r1', token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE objectives/:id/revisions/:rid 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/objectives/o1/revisions/r1', token),
    );
    assert.equal(res.status, 405);
});

test('POST projects/:id/objective-baseline-scores 405s (no'
+ ' post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/projects/p1/objective-baseline-scores',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT projects/:id/objective-baseline-scores 405s (no'
+ ' put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT',
        '/projects/p1/objective-baseline-scores',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE projects/:id/objective-baseline-scores 405s (no'
+ ' delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/projects/p1/objective-baseline-scores',
        token,
    ));
    assert.equal(res.status, 405);
});

test('GET projects/:id/objective-baseline-scores/:sid 405s'
+ ' (no get handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/projects/p1/objective-baseline-scores/s1',
        token,
    ));
    assert.equal(res.status, 405);
});

test('POST projects/:id/objective-baseline-scores/:sid 405s'
+ ' (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/projects/p1/objective-baseline-scores/s1',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE projects/:id/objective-baseline-scores/:sid'
+ ' 405s (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/projects/p1/objective-baseline-scores/s1',
        token,
    ));
    assert.equal(res.status, 405);
});

test('POST projects/:id/objective-actual-scores 405s (no'
+ ' post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/projects/p1/objective-actual-scores',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT projects/:id/objective-actual-scores 405s (no put'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT',
        '/projects/p1/objective-actual-scores',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE projects/:id/objective-actual-scores 405s (no'
+ ' delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/projects/p1/objective-actual-scores',
        token,
    ));
    assert.equal(res.status, 405);
});

test('GET projects/:id/objective-actual-scores/:sid 405s (no'
+ ' get handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/projects/p1/objective-actual-scores/s1',
        token,
    ));
    assert.equal(res.status, 405);
});

test('POST projects/:id/objective-actual-scores/:sid 405s'
+ ' (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST',
        '/projects/p1/objective-actual-scores/s1',
        token, {},
    ));
    assert.equal(res.status, 405);
});

test('DELETE projects/:id/objective-actual-scores/:sid 405s'
+ ' (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE',
        '/projects/p1/objective-actual-scores/s1',
        token,
    ));
    assert.equal(res.status, 405);
});
