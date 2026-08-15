import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { GET, handleRequest } from '../api/api.ts';
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

// WP8 (Phase 13 Task 8) — the phase's ONE sanctioned
// authorization-widening wire delta: MEMBER_VERBS widens PUT
// /identity-token-revocations to the member tier
// (api/authorization.ts), and api/api.ts's Region B self-only
// ownership fence keeps it self-only — a member's OWN chain
// only, since the revocation TARGET rides the body's
// identity_id, never the URL :id (the revocation row's own id).
// WIRE COVENANT: a member's SELF-revocation moves 403 -> the
// admin path's exact success shape; a member naming ANOTHER
// identity keeps the SAME 403 wording authorizeRequest returned
// for this route before this task (byte-pinned below); the
// admin path is unchanged.

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
    await seedOrganizationMember(db, 'member1');
    return db;
}

test('a member PUT identity-token-revocations/:id naming'
+ " itself succeeds 2xx, matching the admin path's exact"
+ ' success shape, and lands both the row and its pair',
async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/self-rev-1', token,
        { identity_id: 'member1', at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: 'self-rev-1', identity_id: 'member1', at,
    });
    // Phase Final Task 2: identity_token_revocations ROW half
    // stripped — pair plane is the oracle.
    const { deriveTokenRevocation } = await import(
        '../api/derive-identity-spine.ts'
    );
    const row = await deriveTokenRevocation(
        db, 'self-rev-1');
    assert.deepEqual(
        row, { id: 'self-rev-1', identity_id: 'member1', at },
    );
    // Phase Final Stage B: identity spine tables retired.
    const requests = await db.requests.getAll();
    const own = requests.find(
        r => r.uri_collection === '/identity-token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(own);
    const responses = await db.responses.getAll();
    const ownResponse = responses.find(
        r => r.uri_collection === '/identity-token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(ownResponse);
});

test('logout-everywhere success clears the refresh cookie',
async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/self-rev-cookie',
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
    const memberToken = await organizationToken('member1');
    // Logout-everywhere stamp. Per-request gate no longer
    // consults the ledger — outstanding ACCESS tokens work
    // until exp; the next refresh/mint is denied.
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/self-rev-2',
        memberToken,
        {
            identity_id: 'member1',
            at: '2021-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 201);
    // Access token still admits member-tier GET.
    const still = await handleRequest(
        db, req('GET', '/members', memberToken),
    );
    assert.equal(still.status, 200);
});

test('a member PUT identity-token-revocations/:id naming'
+ ' ANOTHER identity 403s, byte-pinned to the SAME wording'
+ ' authorizeRequest returned for this route before WP8, and'
+ ' writes no row', async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/foreign-rev-1',
        token,
        {
            identity_id: 'someone-else',
            at: '2026-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: PUT'
            + ' /identity-token-revocations/foreign-rev-1'
            + ' requires a role this principal lacks',
    });
    // Phase Final Task 2: row half stripped — prove no pair
    // landed either (row plane is always empty post-strip).
    const requests = await db.requests.getAll();
    assert.equal(
        requests.filter(
            r => r.uri_id === 'foreign-rev-1',
        ).length,
        0,
    );
});

// G4: stored PUT = tokenRevocationEntityOf (GET derive).
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
        'PUT', '/identity-token-revocations/' + id,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identity-token-revocations/', id,
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
        stored, await deriveTokenRevocation(db, id),
    );
    assert.deepEqual(stored, await put.json());
});

test('the admin path is unchanged: an admin PUT'
+ ' identity-token-revocations/:id naming ANOTHER identity'
+ ' still succeeds 2xx', async () => {
    const db = await freshDb();
    const adminToken = await organizationToken('current');
    const at = '2026-01-01T00:00:00.000000Z';
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/admin-rev-1',
        adminToken,
        { identity_id: 'member1', at },
    ));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
        id: 'admin-rev-1', identity_id: 'member1', at,
    });
});
