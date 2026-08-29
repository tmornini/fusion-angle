import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedIdentityProvider } from './identity-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Pins the CURRENT status of every deliberate identity-spine
// verb gap, through handleRequest, so Task 4's document-wiring
// registration (identities/:id onto the generic
// documentPutHandler) cannot silently move one — a wrong-verb
// combo shifting from 405/403 to something else would be an
// accidental route or authz change, not a wiring change. THREE
// regimes (finding 20), each dispatched a different way:
//
// (1) the route-table regime — 36 combos across the
// identity-spine route() patterns (identities, identities/:id,
// identities/:id/pii, identities/:id/credentials,
// identities/:id/credentials/:cid, identities/:id/token-
// revocations/:rid, role-grants, role-grants/:id,
// identities/:id/tokens,
// identities/:id/tokens/:tid, identities/:id/tokens/:jti/
// rotation, identities/:id/tokens/:jti/revocation,
// identities/:id/providers, identities/:id/providers/:eid):
// a matched pattern with no handler for the request's verb
// 405s via handleRequest's own per-method branch ("Method X
// not allowed on <path>"). Flat identity-tokens patterns are
// retired and assert 404. Every live pattern here is
// admin-only for any verb this suite exercises (none of their
// prefixes appear in authorization.ts's MEMBER_VERBS, aside
// from '/identities/:id/tokens/' POST and
// '/identities/:id/token-revocations' PUT, neither of
// which this regime's POST/DELETE combos exercise), so an
// admin token is required to reach the 405 branch rather
// than an earlier 403.
//
// (2) the default-organization side channel regime — 2
// combos on /identities/:id/default-organization
// (api/organization-requests.ts's
// identityDefaultOrganizationRequest): this side channel never
// calls matchRoute — it dispatches off ctx.method directly
// (GET, PUT, else) — so a POST or DELETE falls through its own
// if-chain to its OWN inline terminal: 405 "Method X not
// allowed" (no path in the message, UNLIKE the route-table
// regime's own wording). Authorized by tree ownership (the
// caller's own identity id), not the admin role policy, so a
// bare identity token reaches the 405 branch.
//
// (3) the identity-tokens authz-tier regime — GET
// /identities/:id/tokens is admin-only (absent from
// MEMBER_VERBS' '/identities/:id/tokens' entry, which lists
// only POST), so a member-tier token 403s at the authz
// layer, BEFORE matchRoute even runs. Flat GET
// /identity-tokens is RETIRED (router 404). POST
// /identities/:id/tokens/:jti/rotation and .../revocation
// DO match MEMBER_VERBS' POST entry (segment-boundary
// prefix) — a member-tier token clears authz and reaches
// the route handler, which then answers on its own domain
// terms (409 reuse for an unknown rotation jti; 204
// idempotent no-op for an unknown revocation jti) rather
// than 403. Flat POST /identity-tokens/:jti/rotation is
// RETIRED (router 404). Path identity must match the
// jti's identity or 403; an absent jti GET 404s.
//
// (4) the identity-token-revocations authz-tier regime —
// 1 combo: GET identities/:id/token-revocations/:rid stays
// admin-only. PUT matches MEMBER_VERBS'
// '/identities/:id/token-revocations' PUT, so a member-tier
// token clears authz and reaches the route handler — which
// then answers on api/api.ts's Region B self-only fence
// (path identity vs actor). Flat
// /identity-token-revocations/:rid is RETIRED (router 404).
// A foreign target's 403 lives in
// tests/api-identity-token-revocations-self.test.ts.
//
// 36 + 2 + 3 + 1 = 42 combos (the brief's own estimate was ~19
// per route-table-style regime; this is the actual, execution-
// time enumeration, verified by a temporary observed-value probe
// before every assertion below was pinned, per Step 0/Step 1 of
// the task brief).

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

// ── regime 1: the route-table 405s (15 patterns, 36 combos) ──

// Task 10: PATCH alphabet — no identity-spine patch yet.
test('PATCH identities/:id 405s (no patch handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/identities/fndCYAsXazdzMUlEGMNIZw', token, {},
    ));
    assert.equal(res.status, 405);
});

test('PUT identities 405s (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identities/', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/', token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identities/fndCYAsXazdzMUlEGMNIZw', token, {}),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/fndCYAsXazdzMUlEGMNIZw', token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id/pii 405s (no post handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identities/fndCYAsXazdzMUlEGMNIZw/pii', token, {}),
    );
    assert.equal(res.status, 405);
});

test('PUT identity-pii 404s (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-pii', token, {}),
    );
    assert.equal(res.status, 404);
});

test('POST identity-pii 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-pii', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-pii 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-pii', token),
    );
    assert.equal(res.status, 404);
});

test('PUT identities/:id/credentials 405s (no put handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identities/fndCYAsXazdzMUlEGMNIZw/credentials/', token
                , {},
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
            'POST', '/identities/fndCYAsXazdzMUlEGMNIZw/credentials/', token
                , {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/credentials 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/fndCYAsXazdzMUlEGMNIZw/credentials/'
            , token),
    );
    assert.equal(res.status, 405);
});

test('POST identities/:id/credentials/:cid 405s (no post'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST', '/identities/fndCYAsXazdzMUlEGMNIZw/credentials/'
                + 'WeXjAaAxGSpLpamfEuvcww', token, {},
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
            'DELETE', '/identities/fndCYAsXazdzMUlEGMNIZw/credentials/'
                + 'WeXjAaAxGSpLpamfEuvcww', token,
        ),
    );
    assert.equal(res.status, 405);
});

test('POST identity-token-revocations/:id 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST',
            '/identity-token-revocations/'
                + 'rOEPOcVMQdJiiiMuiiEhlg',
            token, {},
        ),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-token-revocations/:id 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE',
            '/identity-token-revocations/'
                + 'rOEPOcVMQdJiiiMuiiEhlg',
            token,
        ),
    );
    assert.equal(res.status, 404);
});

test('PUT identity-token-revocations/:id 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT',
            '/identity-token-revocations/'
                + 'rOEPOcVMQdJiiiMuiiEhlg',
            token, {
                identity_id: 'XXZruirZyAOoRpNxaDnpSA',
                at: '2026-01-01T00:00:00.000000Z',
            },
        ),
    );
    assert.equal(res.status, 404);
});

test('GET identity-token-revocations/:id 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-token-revocations/rOEPOcVMQdJiiiMuiiEhlg'
            , token),
    );
    assert.equal(res.status, 404);
});

test('POST identities/:id/token-revocations/:rid 405s'
+ ' (no post handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'POST',
            '/identities/XXZruirZyAOoRpNxaDnpSA/token-revocations/'
                + 'rOEPOcVMQdJiiiMuiiEhlg',
            token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/token-revocations/:rid 405s'
+ ' (no delete handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE',
            '/identities/XXZruirZyAOoRpNxaDnpSA/token-revocations/'
                + 'rOEPOcVMQdJiiiMuiiEhlg',
            token,
        ),
    );
    assert.equal(res.status, 405);
});

test('PUT role-grants 404s (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/role-grants', token, {}),
    );
    assert.equal(res.status, 404);
});

test('POST role-grants 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE role-grants 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants', token),
    );
    assert.equal(res.status, 404);
});

test('POST role-grants/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants/sbGBwBHGVUqXkSLISjksUg', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE role-grants/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants/sbGBwBHGVUqXkSLISjksUg', token),
    );
    assert.equal(res.status, 404);
});

test('PUT identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-tokens', token, {}),
    );
    assert.equal(res.status, 404);
});

test('POST identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens', token),
    );
    assert.equal(res.status, 404);
});

test('POST identity-tokens/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens/jSajolWDMnlgnKMObjGMqA', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-tokens/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens/jSajolWDMnlgnKMObjGMqA', token),
    );
    assert.equal(res.status, 404);
});

test('GET identity-tokens/:jti/rotation 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation', token,
        ),
    );
    assert.equal(res.status, 404);
});

test('PUT identity-tokens/:jti/rotation 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation', token
                , {},
        ),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-tokens/:jti/rotation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation'
                , token,
        ),
    );
    assert.equal(res.status, 404);
});

test('GET identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token,
        ),
    );
    assert.equal(res.status, 404);
});

test('PUT identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token, {},
        ),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token,
        ),
    );
    assert.equal(res.status, 404);
});

const SARAH_PROVIDER = {
    identity_id: 'toccYYkLEABmlbpHJalgtQ',
    provider: 'google',
    provider_subject: 'sub-sarah',
    action: 'linked',
    at: '2026-01-01T00:00:00.000000Z',
};

test('GET /identities/:id/providers lists that identity',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await seedIdentityProvider(
        db, 'toccYYkLEABmlbpHJalgtQ', generateIdentifier(),
        SARAH_PROVIDER,
    );
    const res = await handleRequest(
        db, req('GET', '/identities/toccYYkLEABmlbpHJalgtQ/providers/'
            , token),
    );
    assert.equal(res.status, 200);
    const rows = await res.json() as readonly {
        readonly provider: string;
        readonly provider_subject: string;
        readonly action: string;
    }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.provider, 'google');
    assert.equal(rows[0]!.provider_subject, 'sub-sarah');
    assert.equal(rows[0]!.action, 'linked');
});

test('GET /identities/:id/providers 403s for a member'
+ ' naming another identity (absent from MEMBER_VERBS)',
async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'toccYYkLEABmlbpHJalgtQ');
    const token = await devToken('toccYYkLEABmlbpHJalgtQ');
    const res = await handleRequest(
        db, req(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/providers/', token,
        ),
    );
    assert.equal(res.status, 403);
});

test('GET /identity-providers is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-providers', token),
    );
    assert.equal(res.status, 404);
});

test('GET /identity-providers/:id is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await seedIdentityProvider(
        db, 'toccYYkLEABmlbpHJalgtQ', 'jQHkoHmSUDmFPStSQgYTdA'
            , SARAH_PROVIDER,
    );
    const res = await handleRequest(
        db, req('GET', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA', token),
    );
    assert.equal(res.status, 404);
});

test('PUT /identity-providers/:id is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA', token,
            SARAH_PROVIDER,
        ),
    );
    assert.equal(res.status, 404);
});

test('PUT identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-providers', token, {}),
    );
    assert.equal(res.status, 404);
});

test('POST identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers', token, {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers', token),
    );
    assert.equal(res.status, 404);
});

test('POST identity-providers/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA', token
            , {}),
    );
    assert.equal(res.status, 404);
});

test('DELETE identity-providers/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA'
            , token),
    );
    assert.equal(res.status, 404);
});

// ── regime 2: the default-organization side channel's own
// inline 405 terminal (2 combos) ──

test('POST identities/:id/default-organization 405s (side'
+ ' channel never matches routes)', async () => {
    const db = await freshDb();
    const token = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(
        db, req(
            'POST',
            '/identities/XXZruirZyAOoRpNxaDnpSA/default-organization',
            token, {},
        ),
    );
    assert.equal(res.status, 405);
});

test('DELETE identities/:id/default-organization 405s (side'
+ ' channel never matches routes)', async () => {
    const db = await freshDb();
    const token = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(
        db, req(
            'DELETE',
            '/identities/XXZruirZyAOoRpNxaDnpSA/default-organization',
            token,
        ),
    );
    assert.equal(res.status, 405);
});

// ── regime 3: the identity-tokens GET-admin/POST-member authz
// asymmetry (nested under the identity; flat RETIRED) ──

const TOKEN_AT = '2026-01-01T00:00:00.000000Z';
const TOKEN_JTI = generateIdentifier();
const TOKEN_CHAIN = generateIdentifier();

test('GET /identities/:id/tokens lists that identity',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + 'wLQNiqsEnyBvOQwlbvBXwA',
        token, {
            jti: TOKEN_JTI, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: TOKEN_CHAIN,
            at: TOKEN_AT,
        },
    ));
    assert.ok(put.status === 200 || put.status === 201);
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', token),
    );
    assert.equal(res.status, 200);
    const rows = await res.json() as readonly {
        readonly jti: string;
        readonly identity_id: string;
        readonly action: string;
    }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.jti, TOKEN_JTI);
    assert.equal(rows[0]!.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    assert.equal(rows[0]!.action, 'issued');
});

test('GET /identity-tokens is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-tokens', token),
    );
    assert.equal(res.status, 404);
});

test('GET /identities/:id/tokens 403s for a member-tier'
+ ' token (admin-only; absent from MEMBER_VERBS GET)',
async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', token),
    );
    assert.equal(res.status, 403);
});

test('POST /identities/:id/tokens/:jti/rotation clears'
+ ' authz for a member-tier token (MEMBER_VERBS widens'
+ ' /identities/:id/tokens POST) and 409s on domain terms'
+ ' for an unknown jti', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req(
            'POST',
            '/identities/XXZruirZyAOoRpNxaDnpSA/'
                + 'tokens/WXubsOcLOMVSdMBzlNkAxQ/'
                + 'rotation',
            token, {},
        ),
    );
    assert.equal(res.status, 409);
});

test('POST /identity-tokens/:jti/rotation is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req(
            'POST', '/identity-tokens/WXubsOcLOMVSdMBzlNkAxQ/rotation',
            token, {},
        ),
    );
    assert.equal(res.status, 404);
});

test('POST /identities/:id/tokens/:jti/revocation clears'
+ ' authz for a member-tier token (MEMBER_VERBS widens'
+ ' /identities/:id/tokens POST) and no-ops 204 for an'
+ ' unknown jti', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req(
            'POST',
            '/identities/XXZruirZyAOoRpNxaDnpSA/'
                + 'tokens/WXubsOcLOMVSdMBzlNkAxQ/'
                + 'revocation',
            token, {},
        ),
    );
    assert.equal(res.status, 201);
});

test('POST /identity-tokens/:jti/revocation is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req(
            'POST', '/identity-tokens/WXubsOcLOMVSdMBzlNkAxQ/revocation',
            token, {},
        ),
    );
    assert.equal(res.status, 404);
});

test('POST rotation 403s when path identity is not the'
+ ' jti owner', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + 'wTpHaplkXlJqajbBNhnkbg',
        token, {
            jti: 'kGolXBkfDPCBVKcZzZIHnQ'
                , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: generateIdentifier(),
            at: TOKEN_AT,
        },
    ));
    assert.ok(put.status === 200 || put.status === 201);
    const res = await handleRequest(db, req(
        'POST',
        '/identities/toccYYkLEABmlbpHJalgtQ/tokens/kGolXBkfDPCBVKcZzZIHnQ/'
            + 'rotation',
        token, {},
    ));
    assert.equal(res.status, 403);
});

test('GET /identities/:id/tokens/:tid 404s for an absent'
+ ' jti', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/oSBUDvuXylWVkqvrVHkJtA',
        token,
    ));
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: identity_tokens/oSBUDvuXylWVkqvrVHkJtA',
    );
});

// ── regime 4: the identity-token-revocations PUT-member/
// GET-admin authz asymmetry (WP8, Phase 13 Task 8; 1 combo) ──

test('PUT identities/:id/token-revocations/:rid clears'
+ ' authz for a member-tier token naming itself'
+ " (MEMBER_VERBS widens '/identities/:id/token-revocations'"
+ ' PUT) and succeeds 2xx — the path-level self/foreign'
+ ' fence lives in'
+ ' tests/api-identity-token-revocations-self.test.ts, not'
+ ' here', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req(
            'PUT',
            '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/'
                + 'sUfNoilqdwesUzYTfjCaDA',
            token,
            {
                identity_id: 'nkgaOHZISTQrILTfPThWCA',
                at: '2026-01-01T00:00:00.000000Z',
            },
        ),
    );
    assert.equal(res.status, 201);
});
