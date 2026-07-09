import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { EntityNotFoundError } from '../api/db.ts';
import { GET, handleRequest } from '../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

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
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
        id: 'self-rev-1', identity_id: 'member1', at,
    });
    const row = await db.identityTokenRevocations.getById(
        'self-rev-1');
    assert.deepEqual(
        row, { id: 'self-rev-1', identity_id: 'member1', at },
    );
    const requests = await db.requests.getAll();
    const own = requests.find(
        r => r.uri_prefix === '/identity-token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(own);
    const responses = await db.responses.getAll();
    const ownResponse = responses.find(
        r => r.uri_prefix === '/identity-token-revocations/'
            && r.uri_id === 'self-rev-1',
    );
    assert.ok(ownResponse);
});

test("a member's self-revoke actually signs out: a token"
+ ' minted before the revocation stamp is dead afterward',
async () => {
    const db = await freshDb();
    const memberToken = await organizationToken('member1');
    // The writer's own token (iat 1.7e9) postdates the
    // revocation stamp below, so it survives its own write — the
    // api-token-gate.test.ts 'a logout-everywhere revokes
    // earlier tokens' precedent. `stale` predates it and must
    // die.
    const stale = await mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'member1', roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 10_000_000_000,
        jti: 'stale-member1',
    });
    const res = await handleRequest(db, req(
        'PUT', '/identity-token-revocations/self-rev-2',
        memberToken,
        {
            identity_id: 'member1',
            at: '2021-01-01T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 200);
    await assert.rejects(
        () => GET(db, 'members', stale), /revoked/);
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
    await assert.rejects(
        () => db.identityTokenRevocations.getById(
            'foreign-rev-1'),
        (err: unknown) => err instanceof EntityNotFoundError,
    );
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
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
        id: 'admin-rev-1', identity_id: 'member1', at,
    });
});
