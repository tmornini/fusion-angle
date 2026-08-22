import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import { organizationToken } from './token-fixtures.ts';
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

test('admin GET nested revocation 200s after PUT',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const path = nestedPath('nkgaOHZISTQrILTfPThWCA', rid);
    const put = await handleRequest(db, req(
        'PUT', path, token, { at },
    ));
    assert.equal(put.status, 201);
    const get = await handleRequest(
        db, req('GET', path, token),
    );
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

test('PUT /identity-token-revocations/:rid is retired'
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
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: /identity-token-revocations/ZvdHDQyBmhARRFlOirQLwg',
    );
});

test('GET /identity-token-revocations/:rid is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const put = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', 'ZtxCJjftJTLNZUfZXpgpSA'),
        token, { at },
    ));
    assert.equal(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', '/identity-token-revocations/ZtxCJjftJTLNZUfZXpgpSA',
        token,
    ));
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: /identity-token-revocations/ZtxCJjftJTLNZUfZXpgpSA',
    );
});

test('a member PUT identities/:id/token-revocations/:rid'
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
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
    const row = await deriveTokenRevocation(
        db, 'nkgaOHZISTQrILTfPThWCA', rid,
    );
    assert.deepEqual(
        row, { id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at },
    );
    const requests = await db.pairs.getAll();
    const own = requests.find(
        r => r.uri_collection
            === '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/'
            && r.uri_id === rid,
    );
    assert.ok(own);
    const responses = await db.pairs.getAll();
    const ownResponse = responses.find(
        r => r.uri_collection
            === '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/'
            && r.uri_id === rid,
    );
    assert.ok(ownResponse);
});

test('logout-everywhere success clears the refresh cookie',
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
    assert.equal(res.status, 201);
    const cookies = typeof res.headers.getSetCookie
        === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('Set-Cookie') ?? ''];
    const cookie = cookies.join('\n');
    assert.match(cookie, /refresh_token=/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/authentication/);
    assert.match(cookie, /SameSite=Strict/i);
});

test("a member's self-revoke: ACCESS still works until exp"
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
    assert.equal(res.status, 201);
    const still = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , memberToken),
    );
    assert.equal(still.status, 200);
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
    assert.equal(refresh.status, 401);
    assert.deepEqual(await refresh.json(), {
        error: 'token revoked',
    });
});

test('a member PUT naming ANOTHER identity 403s, byte-pinned'
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
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: PUT ' + path
            + ' requires a role this principal lacks',
    });
    const requests = await db.pairs.getAll();
    assert.equal(
        requests.filter(
            r => r.uri_id === rid,
        ).length,
        0,
    );
});

test('stored PUT body equals tokenRevocationEntityOf',
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
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/nkgaOHZISTQrILTfPThWCA/token-revocations/', id,
        ),
    );
    const expected = tokenRevocationEntityOf({
        uriId: id,
        pairId: id,
        method: 'PUT',
        body: fields,
    });
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored,
        await deriveTokenRevocation(db, 'nkgaOHZISTQrILTfPThWCA', id),
    );
    assert.deepEqual(stored, await put.json());
});

test('the admin path is unchanged: an admin PUT naming'
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
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

test('PUT stamps identity_id from the path when omitted',
async () => {
    const db = await freshDb();
    const token = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const at = '2026-01-01T00:00:00.000000Z';
    const rid = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', nestedPath('nkgaOHZISTQrILTfPThWCA', rid),
        token, { at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: rid, identity_id: 'nkgaOHZISTQrILTfPThWCA', at,
    });
});

test('PUT identity_id that disagrees with the path 400s',
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
    assert.equal(res.status, 400);
});
