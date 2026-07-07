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

async function grantAdmin(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
) {
    await db.roleGrants.put('g-' + identityId + '-' + organization, {
        organization_id: organization,
        identity_id: identityId,
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: AT,
    });
}

async function join(
    db: MemoryDbAdapter,
    identityId: string,
    organization: string,
) {
    await db.memberships.put('m-' + identityId + '-' + organization, {
        organization_id: organization,
        identity_id: identityId,
        at: AT,
    });
}

function getMembers(token: string) {
    return new Request(`${BASE}/members`, {
        headers: { 'Authorization': 'Bearer ' + token },
    });
}

// Task 8 (Phase 11): the flat-token fence fallback
// (identityDefaultOrganization) now derives from the
// /identities/:id/default-org/ message-pair ledger, never the
// identity_default_organizations table directly — so seeding a
// SET default here must ride the real PUT route (the same
// production write path), not a raw table put.
function putDefaultOrganization(
    token: string, identityId: string, organization: string,
) {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({
                organization_id: organization,
                eventId: 'ev-flat-default-1',
                at: AT,
            }),
        });
}

test('a flat token resolves its org from the set default',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    await grantAdmin(db, 'current', '2');
    const token = await devToken();
    const put = await handleRequest(
        db, putDefaultOrganization(token, 'current', '2'));
    assert.equal(put.status, 204);
    const res = await handleRequest(db, getMembers(token));
    assert.equal(res.status, 200);
});

test('a flat token falls back to its primary membership org',
async () => {
    const db = await freshDb();
    await join(db, 'current', '2');
    await grantAdmin(db, 'current', '2');
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 200);
});

test('a flat token with no org resolution is denied',
async () => {
    const db = await freshDb();
    await grantAdmin(db, 'current', '1');   // role, no member
    const res = await handleRequest(
        db, getMembers(await devToken()));
    assert.equal(res.status, 403);
});
