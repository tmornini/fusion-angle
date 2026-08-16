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
    await seedOrganizationMember(db, 'member1');
    return db;
}

test('admin GET nested revocation 200s after PUT',
async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const at = '2026-01-01T00:00:00.000000Z';
    const path = nestedPath('member1', 'admin-get-1');
    const put = await handleRequest(db, req(
        'PUT', path, token, { at },
    ));
    assert.equal(put.status, 201);
    const get = await handleRequest(
        db, req('GET', path, token),
    );
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), {
        id: 'admin-get-1', identity_id: 'member1', at,
    });
});

test('PUT /identity-token-revocations/:rid is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/flat-rid',
        token,
        {
            identity_id: 'member1',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: /identity-token-revocations/flat-rid',
    );
});

test('GET /identity-token-revocations/:rid is retired'
+ ' (router 404)', async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const at = '2026-01-01T00:00:00.000000Z';
    const put = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'flat-get-1'),
        token, { at },
    ));
    assert.equal(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', '/identity-token-revocations/flat-get-1',
        token,
    ));
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Not found: /identity-token-revocations/flat-get-1',
    );
});

test('a member PUT identities/:id/token-revocations/:rid'
+ " naming itself succeeds 2xx, matching the admin path's"
+ ' exact success shape, and lands both the row and its'
+ ' pair', async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'self-rev-1'), token,
        { identity_id: 'member1', at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: 'self-rev-1', identity_id: 'member1', at,
    });
    const row = await deriveTokenRevocation(
        db, 'member1', 'self-rev-1',
    );
    assert.deepEqual(
        row, { id: 'self-rev-1', identity_id: 'member1', at },
    );
    const requests = await db.requests.getAll();
    const own = requests.find(
        r => r.uri_collection
            === '/identities/member1/token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(own);
    const responses = await db.responses.getAll();
    const ownResponse = responses.find(
        r => r.uri_collection
            === '/identities/member1/token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(ownResponse);
});

test('logout-everywhere success clears the refresh cookie',
async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const res = await handleRequest(db, req(
        'PUT',
        nestedPath('member1', 'self-rev-cookie'),
        token,
        {
            identity_id: 'member1',
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
    assert.match(cookie, /Path=\/authentication/);
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
        sub: 'member1',
        roles: ['member:1'],
        name: 'Demo',
        organization: '1',
        organizations: ['1'],
        iat,
        ttlSeconds: 10_000_000_000,
        jti: 'self-rev-2-jti',
    });
    const res = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'self-rev-2'),
        memberToken,
        { identity_id: 'member1', at: revokeAt },
    ));
    assert.equal(res.status, 201);
    const still = await handleRequest(
        db, req('GET', '/organizations/1/members', memberToken),
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
    const token = await organizationToken('member1');
    const path = nestedPath('someone-else', 'foreign-rev-1');
    const res = await handleRequest(db, req(
        'PUT', path, token,
        {
            identity_id: 'someone-else',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: PUT ' + path
            + ' requires a role this principal lacks',
    });
    const requests = await db.requests.getAll();
    assert.equal(
        requests.filter(
            r => r.uri_id === 'foreign-rev-1',
        ).length,
        0,
    );
});

test('stored PUT body equals tokenRevocationEntityOf',
async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const id = 'rev-g4';
    const fields = {
        identity_id: 'member1',
        at: '2026-01-01T00:00:00.000000Z',
    };
    const put = await handleRequest(db, req(
        'PUT', nestedPath('member1', id), token, fields,
    ));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/member1/token-revocations/', id,
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
        await deriveTokenRevocation(db, 'member1', id),
    );
    assert.deepEqual(stored, await put.json());
});

test('the admin path is unchanged: an admin PUT naming'
+ ' ANOTHER identity still succeeds 2xx', async () => {
    const db = await freshDb();
    const adminToken = await organizationToken('current');
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'admin-rev-1'),
        adminToken,
        { identity_id: 'member1', at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: 'admin-rev-1', identity_id: 'member1', at,
    });
});

test('PUT stamps identity_id from the path when omitted',
async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'stamp-1'),
        token, { at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: 'stamp-1', identity_id: 'member1', at,
    });
});

test('PUT identity_id that disagrees with the path 400s',
async () => {
    const db = await freshDb();
    const token = await organizationToken('current');
    const res = await handleRequest(db, req(
        'PUT', nestedPath('member1', 'mismatch-1'),
        token,
        {
            identity_id: 'other',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 400);
});
