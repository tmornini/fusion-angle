import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
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

function putDefaultOrg(
    token: string,
    identityId: string,
    org: string,
) {
    return new Request(
        `${BASE}/identities/${identityId}/default-org`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({ organization_id: org }),
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
        db, putDefaultOrg(token, 'current', '1'));
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
        db, putDefaultOrg(token, 'current', '2'));
    assert.equal(res.status, 403);
});

test('PUT to another identity tree is forbidden', async () => {
    const db = await freshDb();
    await seedMembership(db, 'other', '1');
    const token = await devToken();   // sub = current
    const res = await handleRequest(
        db, putDefaultOrg(token, 'other', '1'));
    assert.equal(res.status, 403);
});

test('PUT the same org twice appends one event', async () => {
    const db = await freshDb();
    await seedMembership(db, 'current', '1');
    const token = await devToken();
    await handleRequest(
        db, putDefaultOrg(token, 'current', '1'));
    await handleRequest(
        db, putDefaultOrg(token, 'current', '1'));
    const rows = await db.identityDefaultOrgs.getAll();
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
