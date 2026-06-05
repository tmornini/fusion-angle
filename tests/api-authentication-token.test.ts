import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { devToken } from './token-fixtures.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import { DEFAULT_ORG } from '../api/types.ts';

const BASE = 'http://localhost';

const issuedCode = {
    code: 'the-code', identity_id: 'current',
    client_id: 'web', status: 'issued',
    at: '2026-06-03T00:00:00.000Z',
};

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

function tokenRequest(body: Record<string, unknown>): Request {
    return new Request(`${BASE}/authentication/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

test('the token endpoint is reachable without a Bearer',
async () => {
    const db = await freshDb();
    // exempt route: no Authorization header still reaches the
    // handler — a 400 from the grant, not a 401 from the gate
    const res = await handleRequest(db, tokenRequest({}));
    assert.equal(res.status, 400);
});

test('an unknown grant_type is a 400 with no side effects',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, tokenRequest({ grant_type: 'wat' }));
    assert.equal(res.status, 400);
    assert.equal(
        (await db.identityTokens.getAll()).length, 0);
    assert.equal(
        (await db.authorizationCodes.getAll()).length, 0);
});

test('authorization_code grant issues a gate-valid token pair',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);   // 'current' is admin
    await db.authorizationCodes.put('ev1', issuedCode);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as {
        access_token: string; refresh_token: string;
        token_type: string; expires_in: number;
    };
    assert.equal(body.token_type, 'Bearer');
    assert.ok(body.access_token.length > 0);
    assert.ok(body.refresh_token.length > 0);
    // the minted access token passes the SP-3 gate
    const rows = await GET(db, 'members', body.access_token);
    assert.ok(Array.isArray(rows));
});

test('replaying a consumed code is a 401 no-op', async () => {
    const db = await freshDb();
    await db.authorizationCodes.put('ev1', issuedCode);
    const first = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
    }));
    assert.equal(first.status, 200);
    const before = (await db.identityTokens.getAll()).length;
    const replay = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
    }));
    assert.equal(replay.status, 401);
    // no new token chain minted on the replay
    assert.equal(
        (await db.identityTokens.getAll()).length, before);
});

test('an unknown code is a 401', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'ghost',
    }));
    assert.equal(res.status, 401);
});

async function initialPair(
    db: MemoryDbAdapter,
): Promise<{ access_token: string; refresh_token: string }> {
    await db.authorizationCodes.put('ev1', issuedCode);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'authorization_code', code: 'the-code',
    }));
    return res.json();
}

test('refresh rotates to a new pair', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    assert.equal(res.status, 200);
    const pair2 = await res.json() as {
        access_token: string; refresh_token: string;
    };
    assert.notEqual(
        pair2.refresh_token, pair1.refresh_token);
    assert.ok(Array.isArray(
        await GET(db, 'members', pair2.access_token)));
});

test('replaying a rotated refresh token revokes the chain',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const pair1 = await initialPair(db);
    const pair2 = await (await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }))).json() as { refresh_token: string };
    // replay the now-rotated pair1 token → reuse detected
    const replay = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair1.refresh_token,
    }));
    assert.equal(replay.status, 401);
    // the whole chain is dead — even the new refresh fails
    const after = await handleRequest(db, tokenRequest({
        grant_type: 'refresh',
        refresh_token: pair2.refresh_token,
    }));
    assert.equal(after.status, 401);
});

test('an invalid refresh token is a 401 no-op', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'refresh', refresh_token: 'not.a.jwt',
    }));
    assert.equal(res.status, 401);
    assert.equal(
        (await db.identityTokens.getAll()).length, 0);
});

test('token-exchange shapes sub=subject and act=actor',
async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('current'),
        actor_token: await devToken('agent-7'),
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assert.equal(claims.sub, 'current');
    assert.equal(claims.act?.sub, 'agent-7');
    // the delegated token passes the gate (current = admin)
    assert.ok(Array.isArray(
        await GET(db, 'members', body.access_token)));
});

test('token-exchange rejects unverifiable tokens with 401',
async () => {
    const db = await freshDb();
    // missing tokens, and a structurally-present but unsigned
    // token, both fail verification (signature/exp/aud)
    assert.equal((await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
    }))).status, 401);
    assert.equal((await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: 'a.b.c', actor_token: 'a.b.c',
    }))).status, 401);
});

test('token-exchange into a member org carries org + orgs',
async () => {
    const db = await freshDb();
    await db.memberships.put('m-current', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000Z',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('current'),
        actor_token: await devToken('current'),
        organization: DEFAULT_ORG,
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assert.equal(claims.org, DEFAULT_ORG);
    assert.deepEqual(claims.orgs, [DEFAULT_ORG]);
});

test('token-exchange into a non-member org is 403',
async () => {
    const db = await freshDb();
    // current is a member of DEFAULT_ORG but not org '7'
    await db.memberships.put('m-current', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000Z',
    });
    const before =
        (await db.identityTokens.getAll()).length;
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('current'),
        actor_token: await devToken('current'),
        organization: '7',
    }));
    assert.equal(res.status, 403);
    // grant-first: a denied exchange mints nothing
    assert.equal(
        (await db.identityTokens.getAll()).length, before);
});

test('a flat exchange carries orgs but no active org',
async () => {
    const db = await freshDb();
    await db.memberships.put('m-current', {
        organization_id: DEFAULT_ORG,
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000Z',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'token-exchange',
        subject_token: await devToken('current'),
        actor_token: await devToken('current'),
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as { access_token: string };
    const claims = decodeAccessToken(body.access_token);
    assert.equal(claims.org, undefined);
    assert.deepEqual(claims.orgs, [DEFAULT_ORG]);
});

const activeClient = {
    grant_types: 'client_credentials',
    redirect_uris: '', jwks: '{"keys":[]}',
    aud: 'fusion-ai-web', status: 'active',
};

test('client_credentials issues a gate-valid token', async () => {
    const db = await freshDb();
    // the service principal (client id) holds an admin role
    await db.roleGrants.put('rg-svc', {
        organization_id: DEFAULT_ORG,
        identity_id: 'svc-client', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2020-01-01T00:00:00.000Z',
    });
    await db.clients.put('svc-client', activeClient);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: 'aaa.bbb.ccc',
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as { access_token: string };
    assert.ok(Array.isArray(
        await GET(db, 'members', body.access_token)));
});

test('client_credentials with a malformed assertion is 401',
async () => {
    const db = await freshDb();
    await db.clients.put('svc-client', activeClient);
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: 'not-a-jwt',
    }));
    assert.equal(res.status, 401);
});

test('client_credentials for an unknown client is 401',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'ghost', client_assertion: 'a.b.c',
    }));
    assert.equal(res.status, 401);
});
