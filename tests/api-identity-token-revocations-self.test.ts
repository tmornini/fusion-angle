import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import {
    organizationToken, reachableToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';
import {
    deriveTokenRevocation,
    tokenRevocationEntityOf,
} from '../api/derive-identity-spine.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Nested under the identity: GET|PUT
// /identities/:id/token-revocations/:rid. Path identity is
// the address — stamped on write and GET. MEMBER_VERBS
// widens PUT to the member tier; Region B keeps it
// self-only (path identity vs actor). GET stays admin-only.
// Flat /identity-token-revocations/:rid is RETIRED (404).

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

function nestedPath(
    identityId: string,
    rid: string,
): string {
    return '/identities/' + identityId
        + '/token-revocations/' + rid;
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedOrganizationMember(db, 'nkgaOHZISTQrILTfPThWCA');
    return db;
}

Deno.test('admin GET nested revocation 200s after PUT',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const path = nestedPath('nkgaOHZISTQrILTfPThWCA', rid);
    const put = await handleRequest(db, req(
        'PUT', path, token, { at },
    ));
    assertStrictEquals(put.status, 201);
    const get = await handleRequest(
        db, req('GET', path, token),
    );
    assertStrictEquals(get.status, 200);
    assertEquals(await get.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

Deno.test('PUT /identity-token-revocations/:rid is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/ZvdHDQyBmhARRFlOirQLwg',
        token,
        {
            identity_id: 'nkgaOHZISTQrILTfPThWCA',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: /identity-token-revocations/ZvdHDQyBmhARRFlOirQLwg',
    );
});

Deno.test('GET /identity-token-revocations/:rid is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const put = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', 'ZtxCJjftJTLNZUfZXpgpSA'),
        token, { at },
    ));
    assertStrictEquals(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', '/identity-token-revocations/ZtxCJjftJTLNZUfZXpgpSA',
        token,
    ));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: /identity-token-revocations/ZtxCJjftJTLNZUfZXpgpSA',
    );
});

Deno.test('a member PUT identities/:id/token-revocations/:rid'
+ " naming itself succeeds 2xx, matching the admin path's"
+ ' exact success shape, and lands both the row and its'
+ ' pair', async () => {
    const db = await freshDb();
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', rid), token,
        { identity_id: 'nkgaOHZISTQrILTfPThWCA', at },
    ));
    assertStrictEquals(res.status, 201);
    assertEquals(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
    const row = await deriveTokenRevocation(
        db, 'nkgaOHZISTQrILTfPThWCA', rid,
    );
    assertEquals(
        row, { id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at },
    );
    const requests = await db.messagePairs.getAll();
    const own = requests.find(
        r => r.uri_collection
            === '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/'
            && r.uri_id === rid,
    );
    assert(own);
    const responses = await db.messagePairs.getAll();
    const ownResponse = responses.find(
        r => r.uri_collection
            === '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/'
            && r.uri_id === rid,
    );
    assert(ownResponse);
});

Deno.test('logout-everywhere success clears the refresh cookie',
async () => {
    const db = await freshDb();
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(db, req(
        'PUT',
        nestedPath('nkgaOHZISTQrILTfPThWCA', generateIdentifier()),
        token,
        {
            identity_id: 'nkgaOHZISTQrILTfPThWCA',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 201);
    const cookies = typeof res.headers.getSetCookie
        === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('Set-Cookie') ?? ''];
    const cookie = cookies.join('\n');
    assertMatch(cookie, /refresh_token=/);
    assertMatch(cookie, /Max-Age=0/);
    assertMatch(cookie, /HttpOnly/i);
    assertMatch(cookie, /Path=\/api\/authentication/);
    assertMatch(cookie, /SameSite=Strict/i);
});

Deno.test('org-less self-revoke PUT 201s and clears the'
+ ' refresh cookie', async () => {
    const db = await freshDb();
    const token = await reachableToken(
        'nkgaOHZISTQrILTfPThWCA', [],
    );
    const rid = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', rid),
        token,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assertStrictEquals(res.status, 201);
    const cookies = typeof res.headers.getSetCookie
        === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('Set-Cookie') ?? ''];
    const cookie = cookies.join('\n');
    assertMatch(cookie, /refresh_token=/);
    assertMatch(cookie, /Max-Age=0/);
    const row = await deriveTokenRevocation(
        db, 'nkgaOHZISTQrILTfPThWCA', rid,
    );
    assertEquals(row, {
        id: rid,
        identity_id: 'nkgaOHZISTQrILTfPThWCA',
        at: '2026-01-01T00:00:00.000000Z',
    });
});

Deno.test('org-less GET nested revocation still 403s',
async () => {
    const db = await freshDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA',
    );
    const rid = generateIdentifier();
    const path = nestedPath('nkgaOHZISTQrILTfPThWCA', rid);
    const put = await handleRequest(db, req(
        'PUT', path, admin,
        { at: '2026-01-01T00:00:00.000000Z' },
    ));
    assertStrictEquals(put.status, 201);
    const token = await reachableToken(
        'nkgaOHZISTQrILTfPThWCA', [],
    );
    const get = await handleRequest(
        db, req('GET', path, token),
    );
    assertStrictEquals(get.status, 403);
});

Deno.test('org-less PUT naming another identity 403s',
async () => {
    const db = await freshDb();
    const token = await reachableToken(
        'nkgaOHZISTQrILTfPThWCA', [],
    );
    const rid = generateIdentifier();
    const path = nestedPath(
        'uTGrEpVpODbNhDhDVdWeqQ', rid,
    );
    const res = await handleRequest(db, req(
        'PUT', path, token,
        {
            identity_id: 'uTGrEpVpODbNhDhDVdWeqQ',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 403);
    const requests = await db.messagePairs.getAll();
    assertStrictEquals(
        requests.filter(r => r.uri_id === rid).length,
        0,
    );
});

Deno.test("a member's self-revoke: ACCESS still works until exp"
+ ' (NAMED ≤15-min covenant); REFRESH grant is 401ed',
async () => {
    const db = await freshDb();
    const revokeAt = '2021-01-01T00:00:00.000000Z';
    const iat = Math.floor(Date.parse(revokeAt) / 1000) - 60;
    const memberToken = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'nkgaOHZISTQrILTfPThWCA',
        roles: ['member:AjdvjuECVZEgZoFajaIEkg'],
        name: 'Demo',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        organizations: ['AjdvjuECVZEgZoFajaIEkg'],
        iat,
        ttlSeconds: 10_000_000_000,
        jti: generateIdentifier(),
    });
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA',
            generateIdentifier()),
        memberToken,
        { identity_id: 'nkgaOHZISTQrILTfPThWCA', at: revokeAt },
    ));
    assertStrictEquals(res.status, 201);
    const still = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , memberToken),
    );
    assertStrictEquals(still.status, 200);
    const refresh = await handleRequest(
        db,
        new Request('http://localhost/authentication/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'refresh',
                refresh_token: memberToken,
            }),
        }),
    );
    assertStrictEquals(refresh.status, 401);
    assertEquals(await refresh.json(), {
        error: 'token revoked',
    });
});

Deno.test('a member PUT naming ANOTHER identity 403s, byte-pinned'
+ ' to the SAME wording authorizeRequest returned, and'
+ ' writes no row', async () => {
    const db = await freshDb();
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const rid = generateIdentifier();
    const path = nestedPath('uTGrEpVpODbNhDhDVdWeqQ', rid);
    const res = await handleRequest(db, req(
        'PUT', path, token,
        {
            identity_id: 'uTGrEpVpODbNhDhDVdWeqQ',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: PUT ' + path
            + ' requires a role this principal lacks',
    });
    const requests = await db.messagePairs.getAll();
    assertStrictEquals(
        requests.filter(
            r => r.uri_id === rid,
        ).length,
        0,
    );
});

Deno.test('stored PUT body equals tokenRevocationEntityOf',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const id = generateIdentifier();
    const fields = {
        identity_id: 'nkgaOHZISTQrILTfPThWCA',
        at: '2026-01-01T00:00:00.000000Z',
    };
    const put = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', id), token, fields,
    ));
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/', id,
        ),
    );
    const expected = tokenRevocationEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: fields,
    });
    assertStrictEquals(Object.keys(expected)[0], 'id');
    assertEquals(stored, expected);
    assertEquals(
        stored,
        await deriveTokenRevocation(db, 'nkgaOHZISTQrILTfPThWCA', id),
    );
    assertEquals(stored, await put.json());
});

Deno.test('the admin path is unchanged: an admin PUT naming'
+ ' ANOTHER identity still succeeds 2xx', async () => {
    const db = await freshDb();
    const adminToken = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', rid),
        adminToken,
        { identity_id: 'nkgaOHZISTQrILTfPThWCA', at },
    ));
    assertStrictEquals(res.status, 201);
    assertEquals(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

Deno.test('PUT stamps identity_id from the path when omitted',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', rid),
        token, { at },
    ));
    assertStrictEquals(res.status, 201);
    assertEquals(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

Deno.test('PUT identity_id that disagrees with the path 400s',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA',
            generateIdentifier()),
        token,
        {
            identity_id: generateIdentifier(),
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 400);
});
