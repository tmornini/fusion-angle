import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { organizationRow } from './test-fixtures.ts';
import { documentPairsAt } from '../api/derive-documents.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';
import { sha256Hex } from '../shared/digest.ts';
import { deriveInvitations } from '../api/derive-invitations.ts';

// Phase 8 Task 6: the invitation document plane — the grant's
// PUT-shaped invitation document (the entity minus id, NO email
// by construction) and the accept's PUT-shaped memberships
// document (the B2 closure: the third memberships writer to join
// the document plane, after the live PUT route and the seed).
// Neither document routes anywhere (Author gate 2 — the
// invitations side channel never joins the route table); both
// are storage-only.

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

// ── grant: the invitation document pair ──

test('a fresh grant appends 2 pairs — the operation and the'
+ ' invitation document, email ABSENT by construction',
async () => {
    const db = await freshDb();
    const res = await grant(db, 'inv-doc-1');
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 2);
    const atAddress = requests.filter(
        r => r.uri_prefix === '/invitations/'
            && r.uri_id === 'inv-doc-1',
    );
    assert.equal(atAddress.length, 2);
    // The document head: the ONE PUT/2xx pair at this address —
    // documentPairsAt excludes the operation pair's POST method
    // by construction (design decision 6), so a match here IS
    // the document.
    const documents = documentPairsAt(
        requests, responses, '/invitations/',
    ).filter(pair => pair.uriId === 'inv-doc-1');
    assert.equal(documents.length, 1);
    const wire = documents[0]!.body;
    assert.deepEqual(
        Object.keys(wire).sort(),
        ['at', 'identity_id', 'organization_id'],
    );
    assert.equal(wire.organization_id, '1');
    assert.equal(wire.identity_id, 'sarah');
    assert.equal(wire.at, AT);
    assert.equal(wire.email, undefined);
});

test('a duplicate grant appends ONLY its operation pair — no'
+ ' phantom document at the duplicate\'s submitted id',
async () => {
    const db = await freshDb();
    const first = await grant(db, 'inv-doc-2a');
    assert.equal(first.status, 200);
    const second = await grant(db, 'inv-doc-2b');
    assert.equal(second.status, 200);
    const requests = await db.requests.getAll();
    const atDuplicateId = requests.filter(
        r => r.uri_prefix === '/invitations/'
            && r.uri_id === 'inv-doc-2b',
    );
    assert.equal(atDuplicateId.length, 1);
    const atFreshId = requests.filter(
        r => r.uri_prefix === '/invitations/'
            && r.uri_id === 'inv-doc-2a',
    );
    assert.equal(atFreshId.length, 2);
});

test('a failed (member-conflict) grant appends nothing',
async () => {
    const db = await freshDb();
    await db.memberships.put('m-sarah-conflict', {
        organization_id: '1', identity_id: 'sarah', at: AT,
    });
    const res = await grant(db, 'inv-doc-fail');
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

// ── accept: the memberships document pair (the B2 closure) ──
// Distinct, strictly-increasing `at` stamps across grant/accept:
// both share ONE invitation entity_id in the states log, so a
// tied `at` would fall to the (at, id) reduction's id tie-break
// rather than genuinely proving which branch ran.

async function accept(
    db: MemoryDbAdapter,
    invitationId: string,
    membershipId: string,
    eventId: string,
    acceptAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/invitations/' + invitationId + '/acceptance',
        await organizationToken('sarah', '1'),
        { membershipId, acceptEventId: eventId, acceptAt },
    ));
}

test('a fresh accept appends its memberships document at the'
+ ' invitation-org address, and the derived memberships plane'
+ ' sees the new membership (the B2 closure)', async () => {
    const db = await freshDb();
    await grant(db, 'inv-doc-3');
    const res = await accept(
        db, 'inv-doc-3', 'ms-doc-3', 'ev-acc-3',
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    const documents = documentPairsAt(
        requests, responses, '/organizations/1/memberships/',
    ).filter(pair => pair.uriId === 'ms-doc-3');
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0]!.body, {
        organization_id: '1', identity_id: 'sarah',
        at: '2026-01-01T00:00:01.000000Z',
    });
    // The direct proof: the generic, family-agnostic document
    // derivation (the SAME machinery a live GET /memberships/:id
    // would use once Task 8 flips it) sees the membership the
    // accept just synthesized.
    const wiring = documentFamilyWiring('memberships')!;
    const derived = await documentGetHandler(wiring)(
        db, ['ms-doc-3'], 'sarah', '1',
    );
    assert.deepEqual(derived, {
        id: 'ms-doc-3', organization_id: '1',
        identity_id: 'sarah',
        at: '2026-01-01T00:00:01.000000Z',
    });
});

test('a no-op re-accept appends no memberships document',
async () => {
    const db = await freshDb();
    await grant(db, 'inv-doc-4');
    const first = await accept(
        db, 'inv-doc-4', 'ms-doc-4', 'ev-acc-4',
        '2026-01-01T00:00:01.000000Z',
    );
    assert.equal(first.status, 204);
    const second = await accept(
        db, 'inv-doc-4', 'ms-doc-4b', 'ev-acc-4b',
        '2026-01-01T00:00:02.000000Z',
    );
    assert.equal(second.status, 204);
    const documents = (await db.requests.getAll()).filter(
        r => r.uri_prefix === '/organizations/1/memberships/',
    );
    assert.equal(documents.length, 1);
    assert.equal(documents[0]!.uri_id, 'ms-doc-4');
});

// ── deriveInvitations: the message-plane reduction ──

async function declineFor(
    db: MemoryDbAdapter,
    invitationId: string,
    invitee: string,
    eventId: string,
    declineAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/invitations/' + invitationId + '/decline',
        await organizationToken(invitee, '1'),
        { declineEventId: eventId, declineAt },
    ));
}

async function revokeFor(
    db: MemoryDbAdapter,
    invitationId: string,
    eventId: string,
    revokeAt: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/invitations/' + invitationId + '/revocation',
        await organizationToken(),
        { revokeEventId: eventId, revokeAt },
    ));
}

test('deriveInvitations round-trips every terminal state:'
+ ' grant→pending, accept→accepted, decline→declined,'
+ ' revoke→revoked', async () => {
    const db = await freshDb();
    await person(db, 'bruce', 'Bruce', 'bruce@x.com');
    await person(db, 'clark', 'Clark', 'clark@x.com');
    await person(db, 'diana', 'Diana', 'diana@x.com');

    await grant(db, 'inv-derive-pending', 'sarah@x.com');

    await grant(db, 'inv-derive-accept', 'bruce@x.com');
    await handleRequest(db, req(
        'POST', '/invitations/inv-derive-accept/acceptance',
        await organizationToken('bruce', '1'),
        {
            membershipId: 'ms-derive-bruce',
            acceptEventId: 'ev-derive-acc',
            acceptAt: '2026-01-01T00:00:01.000000Z',
        },
    ));

    await grant(db, 'inv-derive-decline', 'clark@x.com');
    await declineFor(
        db, 'inv-derive-decline', 'clark', 'ev-derive-dec',
        '2026-01-01T00:00:01.000000Z',
    );

    await grant(db, 'inv-derive-revoke', 'diana@x.com');
    await revokeFor(
        db, 'inv-derive-revoke', 'ev-derive-rev',
        '2026-01-01T00:00:01.000000Z',
    );

    const derived = await deriveInvitations(db);
    const byId = new Map(derived.map(row => [row.id, row]));
    assert.equal(
        byId.get('inv-derive-pending')?.state, 'pending');
    assert.equal(
        byId.get('inv-derive-accept')?.state, 'accepted');
    assert.equal(
        byId.get('inv-derive-decline')?.state, 'declined');
    assert.equal(
        byId.get('inv-derive-revoke')?.state, 'revoked');
    // id-lex ordered (byIdAscending, the IndexedDB reference).
    const ids = derived.map(row => row.id);
    assert.deepEqual(ids, [...ids].sort());
});

test('a no-op replay changes nothing deriveInvitations reads',
async () => {
    const db = await freshDb();
    await grant(db, 'inv-derive-replay');
    const before = await deriveInvitations(db);
    await grant(db, 'inv-derive-replay');   // byte-identical resend
    const after = await deriveInvitations(db);
    assert.deepEqual(after, before);
});

test('every stored invitation-family message verifies against'
+ ' its hash, and requests/responses stay balanced across a'
+ ' full grant→accept→decline mix', async () => {
    const db = await freshDb();
    await person(db, 'bruce', 'Bruce', 'bruce@x.com');
    await person(db, 'clark', 'Clark', 'clark@x.com');
    await grant(db, 'inv-balance-1', 'sarah@x.com');
    await grant(db, 'inv-balance-2', 'bruce@x.com');
    await handleRequest(db, req(
        'POST', '/invitations/inv-balance-2/acceptance',
        await organizationToken('bruce', '1'),
        {
            membershipId: 'ms-balance-2',
            acceptEventId: 'ev-balance-acc',
            acceptAt: '2026-01-01T00:00:01.000000Z',
        },
    ));
    await grant(db, 'inv-balance-3', 'clark@x.com');
    await declineFor(
        db, 'inv-balance-3', 'clark', 'ev-balance-dec',
        '2026-01-01T00:00:01.000000Z',
    );
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    // 3 grants x 2 (operation + invitation document) + 1 accept
    // x 2 (operation + memberships document) + 1 decline x 1
    // (operation only — decline synthesizes no document) = 9.
    assert.equal(requests.length, 9);
    assert.equal(responses.length, 9);
    for (const row of requests) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of responses) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});
