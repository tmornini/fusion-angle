import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

async function seedMembership(
    db: MemoryDbAdapter,
    identityId: string,
    org: string,
) {
    await db.memberships.put('m-' + identityId + '-' + org, {
        organization_id: org,
        identity_id: identityId,
        at: AT,
    });
}

// eventId + at are now caller-minted; far-future AT is used so
// timestamps are deterministic across timezones.
const EVENT_AT = '2099-01-01T00:00:00.000000Z';

function putDefaultOrg(
    token: string,
    identityId: string,
    org: string,
    eventId?: string,
    at?: string,
) {
    const payload: Record<string, string> =
        { organization_id: org };
    if (eventId !== undefined) payload['eventId'] = eventId;
    if (at !== undefined) payload['at'] = at;
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
        });
}

function getDefaultOrg(token: string, identityId: string) {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            headers: { 'Authorization': 'Bearer ' + token },
        });
}

test('PUT default-org sets it and GET returns it', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrg(
            token, 'current', '1', 'ev-set-1', EVENT_AT,
        ));
    assert.equal(put.status, 204);
    const got = await handleRequest(
        db, getDefaultOrg(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, '1');
});

test('PUT a non-member org is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrg(
            token, 'current', '2', 'ev-forbid-1', EVENT_AT,
        ));
    assert.equal(res.status, 403);
});

test('PUT to another identity tree is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'other', '1');
    const token = await devToken();   // sub = current
    const res = await handleRequest(
        db, putDefaultOrg(
            token, 'other', '1', 'ev-tree-1', EVENT_AT,
        ));
    assert.equal(res.status, 403);
});

test('PUT the same org twice appends one event', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(
        db, putDefaultOrg(
            token, 'current', '1', 'ev-dup-1', EVENT_AT,
        ));
    await handleRequest(
        db, putDefaultOrg(
            token, 'current', '1', 'ev-dup-1', EVENT_AT,
        ));
    const rows = await db.identityDefaultOrganizations.getAll();
    assert.equal(rows.length, 1);
});

test('GET resolves to the primary membership when unset',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrg(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, '1');
});

test('GET is null for an org-less identity', async () => {
    const db = await freshDb();
    const token = await devToken();
    const got = await handleRequest(
        db, getDefaultOrg(token, 'current'));
    assert.equal(got.status, 200);
    const body = await got.json() as
        { organization_id: string | null };
    assert.equal(body.organization_id, null);
});

test('PUT persists the caller-supplied eventId as the row id',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrg(
            token, 'current', '1', 'caller-id-1', EVENT_AT,
        ));
    assert.equal(put.status, 204);
    const rows =
        await db.identityDefaultOrganizations.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'caller-id-1');
    assert.equal(rows[0]!.at, EVENT_AT);
});

test('PUT with same eventId + org is idempotent (no-op)',
async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const req1 = putDefaultOrg(
        token, 'current', '1', 'caller-id-2', EVENT_AT,
    );
    const req2 = putDefaultOrg(
        token, 'current', '1', 'caller-id-2', EVENT_AT,
    );
    const r1 = await handleRequest(db, req1);
    assert.equal(r1.status, 204);
    const r2 = await handleRequest(db, req2);
    assert.equal(r2.status, 204);
    const rows =
        await db.identityDefaultOrganizations.getAll();
    // org unchanged on second PUT — no new row appended
    assert.equal(rows.length, 1);
});

test('PUT with empty eventId returns 400', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    const res = await handleRequest(
        db, putDefaultOrg(
            token, 'current', '1', '', EVENT_AT,
        ));
    assert.equal(res.status, 400);
});
