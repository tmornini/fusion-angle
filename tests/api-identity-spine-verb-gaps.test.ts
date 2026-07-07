import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

// Pins the CURRENT status of every deliberate identity-spine
// verb gap, through handleRequest, so Task 4's document-wiring
// registration (identities/:id onto the generic
// documentPutHandler) cannot silently move one — a wrong-verb
// combo shifting from 405/403 to something else would be an
// accidental route or authz change, not a wiring change. THREE
// regimes (finding 20), each dispatched a different way:
//
// (1) the route-table regime — 36 combos across the FIFTEEN
// identity-spine route() patterns (identities, identities/:id,
// identities/:id/pii, identity-pii, identities/:id/credentials,
// identities/:id/credentials/:cid, identity-token-revocations/
// :id, role-grants, role-grants/:id, identity-tokens,
// identity-tokens/:id, identity-tokens/:jti/rotation,
// identity-tokens/:jti/revocation, identity-providers,
// identity-providers/:id): a matched pattern with no handler
// for the request's verb 405s via handleRequest's own
// per-method branch ("Method X not allowed on <path>"). Every
// one of these patterns is admin-only for any verb this suite
// exercises (none of their prefixes appear in authorization.ts's
// MEMBER_VERBS, aside from '/identity-tokens' POST — narrower
// than the collection GET this regime probes), so an admin
// token is required to reach the 405 branch rather than an
// earlier 403.
//
// (2) the default-org side channel regime — 2 combos on
// /identities/:id/default-org (api/organization-requests.ts's
// identityDefaultOrganizationRequest): this side channel never
// calls matchRoute — it dispatches off ctx.method directly
// (GET, PUT, else) — so a POST or DELETE falls through its own
// if-chain to its OWN inline terminal: 405 "Method X not
// allowed" (no path in the message, UNLIKE the route-table
// regime's own wording). Authorized by tree ownership (the
// caller's own identity id), not the admin role policy, so a
// bare identity token reaches the 405 branch.
//
// (3) the identity-tokens authz-tier regime — 3 combos: GET
// /identity-tokens is admin-only (absent from MEMBER_VERBS'
// '/identity-tokens' entry, which lists only POST), so a
// member-tier token 403s at the authz layer, BEFORE matchRoute
// even runs. POST /identity-tokens/:jti/rotation and .../
// revocation, by contrast, DO match MEMBER_VERBS' '/identity-
// tokens': POST entry (segment-boundary prefix, so both
// sub-routes qualify) — a member-tier token clears authz and
// reaches the route handler, which then answers on its own
// domain terms (409 reuse for an unknown rotation jti; 204
// idempotent no-op for an unknown revocation jti) rather than
// 403. This is the GET-admin/POST-member asymmetry finding 20
// names.
//
// 36 + 2 + 3 = 41 combos (the brief's own estimate was ~19 per
// route-table-style regime; this is the actual, execution-time
// enumeration, verified by a temporary observed-value probe
// before every assertion below was pinned, per Step 0/Step 1 of
// the task brief).

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

// ── regime 1: the route-table 405s (15 patterns, 36 combos) ──

test('PUT identities 405s (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identities', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities', token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identities/i1', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/i1', token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id/pii 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identities/i1/pii', token, {}),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-pii 405s (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-pii', token, {}),
    );
    assert.equal(res.status, 405);
});

test('POST identity-pii 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-pii', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-pii 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-pii', token),
    );
    assert.equal(res.status, 405);
});

test('PUT identities/:id/credentials 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identities/i1/credentials', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id/credentials 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST', '/identities/i1/credentials', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/credentials 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/i1/credentials', token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id/credentials/:cid 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST', '/identities/i1/credentials/c1', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/credentials/:cid 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identities/i1/credentials/c1', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('POST identity-token-revocations/:id 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST', '/identity-token-revocations/r1', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-token-revocations/:id 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-token-revocations/r1', token),
    );
    assert.equal(res.status, 405);
});

test('PUT role-grants 405s (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/role-grants', token, {}),
    );
    assert.equal(res.status, 405);
});

test('POST role-grants 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE role-grants 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants', token),
    );
    assert.equal(res.status, 405);
});

test('POST role-grants/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants/rg1', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE role-grants/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants/rg1', token),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-tokens 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-tokens', token, {}),
    );
    assert.equal(res.status, 405);
});

test('POST identity-tokens 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-tokens 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens', token),
    );
    assert.equal(res.status, 405);
});

test('POST identity-tokens/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens/it1', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-tokens/:id 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens/it1', token),
    );
    assert.equal(res.status, 405);
});

test('GET identity-tokens/:jti/rotation 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/jti1/rotation', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-tokens/:jti/rotation 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/jti1/rotation', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-tokens/:jti/rotation 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/jti1/rotation', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('GET identity-tokens/:jti/revocation 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/jti1/revocation', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-tokens/:jti/revocation 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/jti1/revocation', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-tokens/:jti/revocation 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/jti1/revocation', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-providers 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-providers', token, {}),
    );
    assert.equal(res.status, 405);
});

test('POST identity-providers 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-providers 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers', token),
    );
    assert.equal(res.status, 405);
});

test('POST identity-providers/:id 405s (no post handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers/ip1', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identity-providers/:id 405s (no delete handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers/ip1', token),
    );
    assert.equal(res.status, 405);
});

// ── regime 2: the default-org side channel's own inline
// 405 terminal (2 combos) ──

test('POST identities/:id/default-org 405s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await devToken('current');
    const res = await handleRequest(
        db, req(
            'POST', '/identities/current/default-org', token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/default-org 405s (side channel'
+ ' never matches routes)', async () => {
    const db = await freshDb();
    const token = await devToken('current');
    const res = await handleRequest(
        db, req(
            'DELETE', '/identities/current/default-org', token,
        ),
    );
    assert.equal(res.status, 405);
});

// ── regime 3: the identity-tokens GET-admin/POST-member authz
// asymmetry (3 combos, pinned via authorization.ts's tier) ──

test('GET identity-tokens 403s for a member-tier token'
+ ' (admin-only; absent from MEMBER_VERBS)', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'member1');
    const token = await organizationToken('member1');
    const res = await handleRequest(
        db, req('GET', '/identity-tokens', token),
    );
    assert.equal(res.status, 403);
});

test('POST identity-tokens/:jti/rotation clears authz for a'
+ ' member-tier token (MEMBER_VERBS widens'
+ ' /identity-tokens POST) and 409s on domain terms for an'
+ ' unknown jti', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'member1');
    const token = await organizationToken('member1');
    const res = await handleRequest(
        db, req(
            'POST', '/identity-tokens/bogus-jti/rotation',
            token, {},
        ),
    );
    assert.equal(res.status, 409);
});

test('POST identity-tokens/:jti/revocation clears authz for a'
+ ' member-tier token (MEMBER_VERBS widens'
+ ' /identity-tokens POST) and no-ops 204 for an unknown'
+ ' jti', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'member1');
    const token = await organizationToken('member1');
    const res = await handleRequest(
        db, req(
            'POST', '/identity-tokens/bogus-jti/revocation',
            token, {},
        ),
    );
    assert.equal(res.status, 204);
});
