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

// Pins the CURRENT status of every deliberate roster-surface
// verb gap, through handleRequest, so Task 2's document-wiring
// registration (memberships/:id PUT swapping onto the generic
// documentPutHandler) cannot silently move one — a wrong-verb
// combo shifting from 405/404 to something else would be an
// accidental route change, not a wiring change. TWO regimes,
// each dispatched a different way:
//
// (1) the route-table regime — 19 combos across the nine
// roster route() patterns (members, ai-members, ai-members/:id,
// human-members, human-members/:id, memberships,
// memberships/:id, current-member, members/:id): a matched
// pattern with no handler for the request's verb 405s via
// handleRequest's own per-method branch ("Method X not allowed
// on <path>"). Every one of these patterns is admin-only for
// any write verb (authorization.ts's MEMBER_VERBS lists only
// GET for members/ai-members/human-members/current-member, and
// omits memberships entirely), so an admin token is required to
// reach the 405 branch rather than an earlier 403.
//
// (2) the invitations-facade regime — 18 combos across the
// invitations surface (the identity/org-spanning side channel,
// api/invitations-domain.ts's invitationsRequest): it dispatches
// off segments/method directly and NEVER calls matchRoute, so
// every miss — a wrong verb on one of its five real shapes
// (invitations, invitations/sent, invitations/:id/acceptance,
// invitations/:id/decline, invitations/:id/revocation), or an
// entirely bogus path shape (invitations/:id bare) on any verb —
// falls through to the SAME terminal: 404 "Not found:
// /<segments>". Pinning both a real-path-wrong-verb miss and a
// bogus-path miss guards against an accidental 404→405 (or
// 404→200) shift either way.
//
// 19 + 18 = 37 combos across 15 patterns. (The brief's own
// estimate was ~19 per regime, 38 total — an approximation;
// this is the actual, execution-time enumeration, verified by a
// temporary observed-value probe before every assertion below
// was pinned, per Step 0/Step 1 of the task brief.)

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

// Retired roster routes (members / human-members /
// ai-members / memberships / current-member) 404 after
// auth. Pins live in tests/api-roster-retired.test.ts.

// ── regime 2: the invitations-facade 404s ──
// invitationsRequest never calls matchRoute, so every miss
// (real path, wrong verb; or a wholly bogus path) falls through
// its own if-chain to the one terminal: 404 "Not found:
// /<segments>".

test('PUT invitations 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/invitations', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE invitations 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/invitations', token),
    );
    assert.equal(res.status, 404);
});

test('PUT invitations/sent 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/invitations/sent', token, {}),
    );
    assert.equal(res.status, 404);
});

test('POST invitations/sent 404s (side channel never matches'
+ ' routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/invitations/sent', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE invitations/sent 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/invitations/sent', token),
    );
    assert.equal(res.status, 404);
});

test('GET invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/inv1/acceptance', token,
    ));
    assert.equal(res.status, 404);
});

test('PUT invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/inv1/acceptance', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE invitations/:id/acceptance 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/inv1/acceptance', token,
    ));
    assert.equal(res.status, 404);
});

test('GET invitations/:id/decline 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/inv1/decline', token,
    ));
    assert.equal(res.status, 404);
});

test('PUT invitations/:id/decline 404s (side channel never'
+ ' matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/inv1/decline', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE invitations/:id/decline 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/inv1/decline', token,
    ));
    assert.equal(res.status, 404);
});

test('GET invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/inv1/revocation', token,
    ));
    assert.equal(res.status, 404);
});

test('PUT invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/inv1/revocation', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE invitations/:id/revocation 404s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/inv1/revocation', token,
    ));
    assert.equal(res.status, 404);
});

// A wholly bogus path shape — no acceptance/decline/revocation
// op, and not 'sent' either — falls through the SAME if-chain
// on every verb, the "bogus path" half of U5's guard.

test('GET invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET', '/invitations/bogus1', token,
    ));
    assert.equal(res.status, 404);
});

test('PUT invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/invitations/bogus1', token, {},
    ));
    assert.equal(res.status, 404);
});

test('POST invitations/:id (bogus path) 404s on every verb',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/invitations/bogus1', token, {},
    ));
    assert.equal(res.status, 404);
});

test('DELETE invitations/:id (bogus path) 404s on every'
+ ' verb', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/invitations/bogus1', token,
    ));
    assert.equal(res.status, 404);
});
