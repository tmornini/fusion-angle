import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2099-01-01T00:00:00.000000Z';

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

async function seedMembership(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
): Promise<void> {
    await db.memberships.put(
        'm-' + identityId + '-' + organization, {
            organization_id: organization,
            identity_id: identityId,
            at: AT,
        });
}

function putDefaultOrganization(
    token: string,
    identityId: string,
    organization: string,
    eventId: string,
    at: string,
): Request {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({
                organization_id: organization, eventId, at,
            }),
        });
}

// Event-append class: uriId is the body's OWN eventId, NOT the
// identity from the URL — a fresh id every write, so a repeat
// write to a DIFFERENT org (or a fresh eventId) never chains.

test('a default-org write appends its pair addressed at the'
+ ' eventId, not the identity', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-1', AT,
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/identities/current/default-org/',
    );
    assert.equal(requests[0]!.uri_id, 'ev-1');
});

test('two writes to different orgs each append their OWN'
+ ' genesis pair, never superseding', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    await seedMembership(db, 'current', '2');
    const token = await devToken();
    const first = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-2a', AT,
    ));
    assert.equal(first.status, 204);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-2b', AT,
    ));
    assert.equal(second.status, 204);
    assert.equal(second.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 2);
});

test('the idempotent no-change branch still appends its own'
+ ' pair — the pair is that request\'s only write',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-3a', AT,
    ));
    // A DIFFERENT eventId, but the SAME org (already current) —
    // a distinct request message (so not a byte-identical
    // resend) whose domain effect is a no-op.
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-3b', AT,
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 2);
    const ledgerRows =
        await db.identityDefaultOrganizations.getAll();
    // The no-op write appended NO ledger row (the org already
    // was '1') — only the pair recorded the second call.
    assert.equal(ledgerRows.length, 1);
});

test('a byte-identical PUT resend returns the stored response'
+ ' and appends nothing', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const body = putDefaultOrganization(
        token, 'current', '1', 'ev-4', AT,
    );
    const first = await handleRequest(db, body);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const second = await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-4', AT,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('a forbidden (non-member org) PUT appends nothing',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-5', AT,
    ));
    assert.equal(res.status, 403);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    await seedMembership(db, 'current', '2');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-6a', AT,
    ));
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-6b', AT,
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
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-7a', AT,
    ));
    await handleRequest(db, putDefaultOrganization(
        token, 'current', '1', 'ev-7b', AT,
    ));
    const failed = await handleRequest(db, putDefaultOrganization(
        token, 'current', '2', 'ev-7fail', AT,
    ));
    assert.equal(failed.status, 403);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
