import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';

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

async function person(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    email: string,
): Promise<void> {
    await db.members.put(id, { type: 'human' });
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, {
        name, email, phone: '', bio: '',
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.organizations.put('1', organizationRow('Stark'));
    await db.roleGrants.put('rg-current-1', {
        organization_id: '1', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await db.memberships.put('m-current-1', {
        organization_id: '1', identity_id: 'current', at: AT,
    });
    await person(db, 'current', 'Tony', 'demo@example.com');
    await person(db, 'sarah', 'Sarah', 'sarah@x.com');
    return db;
}

async function grant(
    db: MemoryDbAdapter,
    invitationId: string,
    email = 'sarah@x.com',
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/invitations', await organizationToken(),
        {
            email,
            invitationId,
            grantEventId: 'ev-grant-' + invitationId,
            grantAt: AT,
        },
    ));
}

// ── memberships/:id ──

function membershipFields(identityId: string, at: string) {
    return { organization_id: '1', identity_id: identityId, at };
}

test('PUT memberships/:id appends its pair at the entity'
+ ' address, and the wire body matches a domain read',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/memberships/ms-1', await organizationToken(),
        membershipFields('sarah', AT),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/organizations/1/memberships/',
    );
    assert.equal(requests[0]!.uri_id, 'ms-1');
    const domainRow = await db.memberships.getById('ms-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('DELETE memberships/:id appends its tombstone pair,'
+ ' superseding the PUT', async () => {
    const db = await freshDb();
    const put = await handleRequest(db, req(
        'PUT', '/memberships/ms-2', await organizationToken(),
        membershipFields('sarah', AT),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/memberships/ms-2', await organizationToken(),
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(() => db.memberships.getById('ms-2'));
});

// ── invitations: grant (POST /invitations) ──
// create-shaped, document-class, addressed at the client-minted
// invitationId — NOT organization-nested (global plane).

test('a grant appends its pair at the invitation address',
async () => {
    const db = await freshDb();
    const res = await grant(db, 'inv-1');
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    // Operation pair + the invitation document pair (Phase 8
    // Task 6), both at this SAME address.
    assert.equal(requests.length, 2);
    assert.equal(requests[0]!.uri_prefix, '/invitations/');
    assert.equal(requests[0]!.uri_id, 'inv-1');
});

test('a member-conflict grant (409) appends nothing',
async () => {
    const db = await freshDb();
    await db.memberships.put('m-sarah-1', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    const res = await grant(db, 'inv-conflict');
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('a duplicate (idempotent-echo) grant still appends its'
+ ' own pair, addressed at ITS OWN client-minted id',
async () => {
    const db = await freshDb();
    const first = await grant(db, 'inv-2a');
    assert.equal(first.status, 200);
    const second = await grant(db, 'inv-2b');
    assert.equal(second.status, 200);
    const firstBody = await first.json() as { id: string };
    const secondBody = await second.json() as { id: string };
    // Both branches echo the SAME original invitation id...
    assert.equal(firstBody.id, 'inv-2a');
    assert.equal(secondBody.id, 'inv-2a');
    // ...but each HTTP call still gets its OWN pair, addressed
    // at the id ITS OWN request body proposed. The FIRST call is
    // 'fresh' — its operation pair AND the invitation document
    // pair both land at 'inv-2a'; the SECOND is a duplicate echo
    // — ONLY its operation pair lands at 'inv-2b', no document
    // (a duplicate never synthesizes one).
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 3);
    const ids = requests.map(r => r.uri_id).sort();
    assert.deepEqual(ids, ['inv-2a', 'inv-2a', 'inv-2b']);
});

test('a byte-identical grant resend returns the stored'
+ ' response and appends nothing', async () => {
    const db = await freshDb();
    const first = await grant(db, 'inv-3');
    const firstId = first.headers.get('Response-ID');
    const second = await grant(db, 'inv-3');
    assert.equal(second.headers.get('Response-ID'), firstId);
    // 2 (operation + document); the resend appends nothing.
    assert.equal((await db.requests.getAll()).length, 2);
    assert.equal((await db.responses.getAll()).length, 2);
});

// ── invitations: acceptance/decline/revocation ──
// operation-addressed (uriId ''), global plane, never chains —
// a repeat (idempotent no-op) still gets its own genesis pair.

test('accept appends its pair at the operation address',
async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-4');
    const id = ((await granted.json()) as { id: string }).id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        { membershipId: 'ms-acc', acceptEventId: 'ev-acc',
            acceptAt: AT },
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/invitations/' + id + '/acceptance/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
    // The B2 closure (Phase 8 Task 6): a fresh membership-writing
    // accept ALSO appends the memberships document, at the
    // INVITATION-org-nested address, keyed by the caller's own
    // membershipId.
    const document = requests.find(
        r => r.uri_prefix === '/organizations/1/memberships/'
            && r.uri_id === 'ms-acc',
    );
    assert.ok(document);
});

test('a repeat (no-op) accept still appends its own pair,'
+ ' never superseding', async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-5');
    const id = ((await granted.json()) as { id: string }).id;
    const first = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        { membershipId: 'ms-5', acceptEventId: 'ev-5',
            acceptAt: AT },
    ));
    assert.equal(first.status, 204);
    const second = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        { membershipId: 'ms-5b', acceptEventId: 'ev-5b',
            acceptAt: AT },
    ));
    assert.equal(second.status, 204);
    assert.equal(second.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    const rows = requests.filter(
        r => r.uri_prefix
            === '/invitations/' + id + '/acceptance/',
    );
    assert.equal(rows.length, 2);
    // The no-op re-accept writes no membership row, so it
    // synthesizes no document either (the security property's
    // message-plane mirror) — exactly ONE memberships document
    // exists, at the FIRST (fresh) accept's own membershipId.
    const documents = requests.filter(
        r => r.uri_prefix === '/organizations/1/memberships/',
    );
    assert.equal(documents.length, 1);
    assert.equal(documents[0]!.uri_id, 'ms-5');
});

test('a conflicting (already-revoked) accept 409s and'
+ ' appends nothing', async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-6');
    const id = ((await granted.json()) as { id: string }).id;
    await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken(),
        { revokeEventId: 'ev-rvk', revokeAt: AT },
    ));
    const countBefore = (await db.requests.getAll()).length;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/acceptance',
        await organizationToken('sarah', '1'),
        { membershipId: 'ms-6', acceptEventId: 'ev-6',
            acceptAt: AT },
    ));
    assert.equal(res.status, 409);
    assert.equal(
        (await db.requests.getAll()).length, countBefore,
    );
});

test('decline appends its pair at the operation address',
async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-7');
    const id = ((await granted.json()) as { id: string }).id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await organizationToken('sarah', '1'),
        { declineEventId: 'ev-dec', declineAt: AT },
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/invitations/' + id + '/decline/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
});

test('revoke appends its pair at the operation address',
async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-8');
    const id = ((await granted.json()) as { id: string }).id;
    const res = await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken(),
        { revokeEventId: 'ev-rvk-8', revokeAt: AT },
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/invitations/' + id + '/revocation/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-9');
    const id = ((await granted.json()) as { id: string }).id;
    await handleRequest(db, req(
        'POST', '/invitations/' + id + '/decline',
        await organizationToken('sarah', '1'),
        { declineEventId: 'ev-dec-9', declineAt: AT },
    ));
    await handleRequest(db, req(
        'PUT', '/memberships/ms-9', await organizationToken(),
        membershipFields('sarah', AT),
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

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    const granted = await grant(db, 'inv-10');
    const id = ((await granted.json()) as { id: string }).id;
    await handleRequest(db, req(
        'POST', '/invitations/' + id + '/revocation',
        await organizationToken(),
        { revokeEventId: 'ev-rvk-10', revokeAt: AT },
    ));
    await handleRequest(db, req(
        'PUT', '/memberships/ms-10', await organizationToken(),
        membershipFields('sarah', AT),
    ));
    await db.memberships.put('m-sarah-conflict', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    const failed = await grant(db, 'inv-fail');
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
