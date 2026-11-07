import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    apiRequest,
    partBodiesOf,
} from './http-fixtures.ts';
import { seedIdentityProvider } from './identity-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Pins the identity-spine verb gaps through handleRequest.
// FOUR regimes, 46 + 2 + 9 + 1 = 58 tests:
//
// (1) Route-table gaps and retired flat paths — 46 tests.
// A live pattern with no handler for the verb 405s. A path
// that names an identity outside this organization 403s.
// A member GET of another identity's providers 403s.
// Retired flat routes 404: identity-pii, role-grants,
// identity-tokens, identity-token-revocations, and
// identity-providers, including their subpaths.
//
// (2) identities/:id/default-organization — 2 tests.
// POST and DELETE 405. The route registers select and put
// only (api/routes.ts). Both tests send devToken.
//
// (3) Identity tokens — 9 tests. An admin GET of
// /identities/:id/tokens lists that identity; a member
// GET 403s. Flat GET /identity-tokens 404s, and so do
// flat POST rotation and revocation. Nested POST rotation
// and revocation 403 when the path identity is not the
// actor, including an unseated path. GET of an absent
// jti 404s.
//
// (4) Token revocations — 1 test. A member PUT of
// /identities/:id/token-revocations/:rid naming itself
// answers 201. The self/foreign fence is
// tests/api-identity-token-revocations-self.test.ts.

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

const OUTSIDER = 'fndCYAsXazdzMUlEGMNIZw';

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function assertOutside(
    res: Response, method: string, path: string,
): Promise<void> {
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: outside(method, path),
    });
}

// ── regime 1: route-table gaps and retired flats (46) ──

// Task 10: PATCH alphabet — no identity-spine patch yet.
Deno.test('PATCH identities/:id on an outsider is forbidden',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER;
    const res = await handleRequest(db, req(
        'PATCH', path, token, {},
    ));
    await assertOutside(res, 'PATCH', path);
});

Deno.test('PUT identities 405s (no put handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identities/', token, {}),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE identities 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identities/', token),
    );
    assertStrictEquals(res.status, 405);
});

Deno.test('POST identities/:id on an outsider is forbidden',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER;
    const res = await handleRequest(
        db, req('POST', path, token, {}),
    );
    await assertOutside(res, 'POST', path);
});

Deno.test('DELETE identities/:id on an outsider is forbidden',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER;
    const res = await handleRequest(
        db, req('DELETE', path, token),
    );
    await assertOutside(res, 'DELETE', path);
});

Deno.test('POST identities/:id/pii on an outsider is forbidden',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/pii';
    const res = await handleRequest(
        db, req('POST', path, token, {}),
    );
    await assertOutside(res, 'POST', path);
});

Deno.test('PUT identity-pii 404s (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-pii', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identity-pii 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-pii', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-pii 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-pii', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identities/:id/credentials on an outsider'
+ ' is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/credentials/';
    const res = await handleRequest(
        db, req('PUT', path, token, {}),
    );
    await assertOutside(res, 'PUT', path);
});

Deno.test('POST identities/:id/credentials on an outsider'
+ ' is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/credentials/';
    const res = await handleRequest(
        db, req('POST', path, token, {}),
    );
    await assertOutside(res, 'POST', path);
});

Deno.test('DELETE identities/:id/credentials on an outsider'
+ ' is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/credentials/';
    const res = await handleRequest(
        db, req('DELETE', path, token),
    );
    await assertOutside(res, 'DELETE', path);
});

Deno.test('POST identities/:id/credentials/:cid on an'
+ ' outsider is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/credentials/'
        + 'WeXjAaAxGSpLpamfEuvcww';
    const res = await handleRequest(
        db, req('POST', path, token, {}),
    );
    await assertOutside(res, 'POST', path);
});

Deno.test('DELETE identities/:id/credentials/:cid on an'
+ ' outsider is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/identities/' + OUTSIDER + '/credentials/'
        + 'WeXjAaAxGSpLpamfEuvcww';
    const res = await handleRequest(
        db, req('DELETE', path, token),
    );
    await assertOutside(res, 'DELETE', path);
});

Deno.test('POST identity-token-revocations/:id 404s'
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
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-token-revocations/:id 404s'
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
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identity-token-revocations/:id 404s'
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
    assertStrictEquals(res.status, 404);
});

Deno.test('GET identity-token-revocations/:id 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-token-revocations/rOEPOcVMQdJiiiMuiiEhlg'
            , token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identities/:id/token-revocations/:rid 405s'
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
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE identities/:id/token-revocations/:rid 405s'
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
    assertStrictEquals(res.status, 405);
});

Deno.test('PUT role-grants 404s (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/role-grants', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST role-grants 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE role-grants 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST role-grants/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/role-grants/sbGBwBHGVUqXkSLISjksUg', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE role-grants/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/role-grants/sbGBwBHGVUqXkSLISjksUg', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-tokens', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-tokens 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identity-tokens/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-tokens/jSajolWDMnlgnKMObjGMqA', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-tokens/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-tokens/jSajolWDMnlgnKMObjGMqA', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET identity-tokens/:jti/rotation 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation', token,
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identity-tokens/:jti/rotation 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation', token
                , {},
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-tokens/:jti/rotation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/rotation'
                , token,
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'GET', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token,
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token, {},
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-tokens/:jti/revocation 404s'
+ ' (route retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'DELETE', '/identity-tokens/kMxUUYCSpGsfuBpyHiIZqA/revocation'
                , token,
        ),
    );
    assertStrictEquals(res.status, 404);
});

const SARAH_PROVIDER = {
    identity_id: 'toccYYkLEABmlbpHJalgtQ',
    provider: 'google',
    provider_subject: 'sub-sarah',
    action: 'linked',
    at: '2026-01-01T00:00:00.000000Z',
};

Deno.test('GET providers of an unseated identity is forbidden',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await seedIdentityProvider(
        db, 'toccYYkLEABmlbpHJalgtQ', generateIdentifier(),
        SARAH_PROVIDER,
    );
    const path = '/identities/toccYYkLEABmlbpHJalgtQ/providers/';
    const res = await handleRequest(
        db, req('GET', path, token),
    );
    await assertOutside(res, 'GET', path);
});

Deno.test('GET /identities/:id/providers 403s for a member'
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
    assertStrictEquals(res.status, 403);
});

Deno.test('GET /identity-providers is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-providers', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /identity-providers/:id is retired (router 404)',
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
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT /identity-providers/:id is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req(
            'PUT', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA', token,
            SARAH_PROVIDER,
        ),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('PUT identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('PUT', '/identity-providers', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers', token, {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-providers 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('POST identity-providers/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('POST', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA', token
            , {}),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('DELETE identity-providers/:id 404s (route retired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/identity-providers/jQHkoHmSUDmFPStSQgYTdA'
            , token),
    );
    assertStrictEquals(res.status, 404);
});

// ── regime 2: default-organization POST and DELETE (2) ──

Deno.test('POST identities/:id/default-organization 405s (side'
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
    assertStrictEquals(res.status, 405);
});

Deno.test('DELETE identities/:id/default-organization 405s (side'
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
    assertStrictEquals(res.status, 405);
});

// ── regime 3: identity-token reads, fences, and flats (9) ──

const TOKEN_AT = '2026-01-01T00:00:00.000000Z';
const TOKEN_JTI = generateIdentifier();
const TOKEN_CHAIN = generateIdentifier();

Deno.test('GET /identities/:id/tokens lists that identity',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + TOKEN_JTI,
        token, {
            jti: TOKEN_JTI, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: TOKEN_CHAIN,
            at: TOKEN_AT,
        },
    ));
    assert(put.status === 200 || put.status === 201);
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', token),
    );
    assertStrictEquals(res.status, 200);
    const rows = await partBodiesOf<{
        readonly jti: string;
        readonly identity_id: string;
        readonly action: string;
    }>(res);
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.jti, TOKEN_JTI);
    assertStrictEquals(rows[0]!.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(rows[0]!.action, 'issued');
});

Deno.test('GET /identity-tokens is retired (router 404)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET', '/identity-tokens', token),
    );
    assertStrictEquals(res.status, 404);
});

Deno.test('GET /identities/:id/tokens 403s for a member-tier'
+ ' token (admin-only; absent from MEMBER_VERBS GET)',
async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(
        db, req('GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/', token),
    );
    assertStrictEquals(res.status, 403);
});

Deno.test('POST /identities/:id/tokens/:jti/rotation clears'
+ ' the coarse policy check for a member-tier token'
+ ' (MEMBER_VERBS widens /identities/:id/tokens POST), and'
+ " Region B's self-only guard 403s naming another identity,"
+ ' even an unknown jti', async () => {
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
    assertStrictEquals(res.status, 403);
});

Deno.test('POST /identity-tokens/:jti/rotation is retired'
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
    assertStrictEquals(res.status, 404);
});

Deno.test('POST /identities/:id/tokens/:jti/revocation clears'
+ ' the coarse policy check for a member-tier token'
+ ' (MEMBER_VERBS widens /identities/:id/tokens POST), and'
+ " Region B's self-only guard 403s naming another identity,"
+ ' even an unknown jti', async () => {
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
    assertStrictEquals(res.status, 403);
});

Deno.test('POST /identity-tokens/:jti/revocation is retired'
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
    assertStrictEquals(res.status, 404);
});

// The caller's own token lands. Rotating it through an
// unseated path identity is the fence, before the
// unknown-jti status.
Deno.test('POST rotation of an unseated path identity'
+ ' is forbidden', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + 'kGolXBkfDPCBVKcZzZIHnQ',
        token, {
            jti: 'kGolXBkfDPCBVKcZzZIHnQ'
                , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: generateIdentifier(),
            at: TOKEN_AT,
        },
    ));
    assert(put.status === 200 || put.status === 201);
    await put.body?.cancel();
    const path = '/identities/toccYYkLEABmlbpHJalgtQ/tokens/'
        + 'kGolXBkfDPCBVKcZzZIHnQ/rotation';
    const res = await handleRequest(db, req(
        'POST', path, token, {},
    ));
    await assertOutside(res, 'POST', path);
});

Deno.test('GET /identities/:id/tokens/:jti 404s for an absent'
+ ' jti', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'GET',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/oSBUDvuXylWVkqvrVHkJtA',
        token,
    ));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: identity_tokens/oSBUDvuXylWVkqvrVHkJtA',
    );
});

// ── regime 4: a member PUT of its own token-revocation
// answers 201 (WP8, Phase 13 Task 8; 1 test) ──

Deno.test('PUT identities/:id/token-revocations/:rid clears'
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
    assertStrictEquals(res.status, 201);
});
