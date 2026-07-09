import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Mirrors the REAL wire contract
// (web-app/app/adapters/role-grants.ts): the outgoing body
// omits organization_id entirely. role_grants rides the
// ORG-SCOPED store, which stamps organization_id from the
// verified token's fenced org BEFORE validating (`#stamp` in
// api/store-organization-scoped.ts) — both at the gate's
// successBody resolver (routes.ts) and inside the route
// handler's own transaction (the SAME scoped store re-wraps
// the tx view). If the fixture supplied organization_id
// itself, a deep-equal against DEV_TOKEN's own org ('1') could
// not tell server-side stamping apart from client echo.
function grantFields(identityId: string, role = 'member') {
    return {
        identity_id: identityId,
        role, action: 'granted', by_member_id: 'current', at: AT,
    };
}

// role_grants is a HistoryEntityStore ledger row, so this
// family is EVENT-APPEND — no head-read, no Supersedes.

test('PUT role-grants/:id appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const body = grantFields('walt');
    assert.ok(!('organization_id' in body));
    const res = await handleRequest(db, req(
        'PUT', '/role-grants/rg-1', DEV_TOKEN, body,
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(requests[3]!.uri_prefix, '/role-grants/');
    assert.equal(requests[3]!.uri_id, 'rg-1');
    const domainRow = await db.roleGrants.getById('rg-1');
    assert.deepEqual(await res.json(), domainRow);
    // The wire body never carried organization_id, yet the
    // written row (and the wire response mirroring it) carries
    // DEV_TOKEN's fenced org — proof the gate/store STAMP it
    // server-side rather than trusting a client-echoed value.
    assert.equal(domainRow.organization_id, '1');
});

test('two PUTs to DIFFERENT role-grants/:id ids each form a'
+ ' genesis pair with no Supersedes on either', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/role-grants/rg-2a', DEV_TOKEN,
        grantFields('walt'),
    ));
    const second = await handleRequest(db, req(
        'PUT', '/role-grants/rg-2b', DEV_TOKEN,
        grantFields('jesse'),
    ));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers.get('Supersedes'), null);
    assert.equal(second.headers.get('Supersedes'), null);
});

test('a second PUT to the SAME role-grants/:id id overwrites'
+ ' the row and forms its OWN genesis pair — this address'
+ ' never chains', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/role-grants/rg-3', DEV_TOKEN,
        grantFields('walt', 'member'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/role-grants/rg-3', DEV_TOKEN,
        grantFields('walt', 'admin'),
    ));
    assert.equal(second.status, 200);
    assert.notEqual(second.headers.get('Response-ID'), firstId);
    assert.equal(second.headers.get('Supersedes'), null);
    const domainRow = await db.roleGrants.getById('rg-3');
    assert.equal(domainRow.role, 'admin');
});

test('a failed write (invalid action) appends nothing',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/role-grants/rg-doomed', DEV_TOKEN,
        { ...grantFields('walt'), action: 'sideways' },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/role-grants/rg-9', DEV_TOKEN,
        grantFields('walt'),
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay balanced across a mix'
+ ' including one failed write', async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/role-grants/rg-10', DEV_TOKEN,
        grantFields('walt'),
    ));
    await handleRequest(db, req(
        'PUT', '/role-grants/rg-11', DEV_TOKEN,
        grantFields('jesse'),
    ));
    const failed = await handleRequest(db, req(
        'PUT', '/role-grants/rg-fail', DEV_TOKEN,
        { ...grantFields('walt'), action: 'sideways' },
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
