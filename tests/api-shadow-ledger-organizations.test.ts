import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';

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
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('a PUT to a fresh organization appends its pair at the'
+ ' entity address — GLOBAL plane, no organization nesting',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/org-1', DEV_TOKEN,
        organizationRow('Acme'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/organizations/');
    assert.equal(requests[0]!.uri_id, 'org-1');
    const domainRow = await db.organizations.getById('org-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('a second PUT to the same organization records'
+ ' Supersedes', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/organizations/org-2', DEV_TOKEN,
        organizationRow('First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', '/organizations/org-2', DEV_TOKEN,
        organizationRow('Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('a byte-identical PUT resend returns the stored response'
+ ' and appends nothing', async () => {
    const db = await freshDb();
    const body = organizationRow('Idempotent');
    const first = await handleRequest(db, req(
        'PUT', '/organizations/org-3', DEV_TOKEN, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/organizations/org-3', DEV_TOKEN, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('a failed PUT (missing required field) appends nothing',
async () => {
    const db = await freshDb();
    const { seats: _seats, ...incomplete } =
        organizationRow('Broken');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/org-doomed', DEV_TOKEN,
        incomplete,
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/organizations/org-9', DEV_TOKEN,
        organizationRow('Verify'),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/org-9', DEV_TOKEN,
        organizationRow('Verify Again'),
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
+ ' of PUTs and one failed write', async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/organizations/org-10', DEV_TOKEN,
        organizationRow('Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/organizations/org-10', DEV_TOKEN,
        organizationRow('Mixed Again'),
    ));
    const { seats: _seats, ...incomplete } =
        organizationRow('Broken');
    const failed = await handleRequest(db, req(
        'PUT', '/organizations/org-fail', DEV_TOKEN, incomplete,
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
