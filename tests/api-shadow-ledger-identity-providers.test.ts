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

function providerFields(
    identityId: string, action = 'linked' as const,
) {
    return {
        identity_id: identityId, provider: 'google',
        provider_subject: 'sub-' + identityId,
        action, at: AT,
    };
}

// identity_providers is a HistoryEntityStore ledger row and a
// GLOBAL-plane store (no organization_id field), so this
// family is EVENT-APPEND — no head-read, no Supersedes.

test('PUT identity-providers/:id appends its pair at the'
+ ' entity address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-1', DEV_TOKEN,
        providerFields('sarah'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix, '/identity-providers/',
    );
    assert.equal(requests[0]!.uri_id, 'idp-1');
    const domainRow = await db.identityProviders.getById('idp-1');
    assert.deepEqual(await res.json(), domainRow);
});

test('two PUTs to DIFFERENT identity-providers/:id ids each'
+ ' form a genesis pair with no Supersedes on either',
async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-2a', DEV_TOKEN,
        providerFields('sarah'),
    ));
    const second = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-2b', DEV_TOKEN,
        providerFields('bobby'),
    ));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers.get('Supersedes'), null);
    assert.equal(second.headers.get('Supersedes'), null);
});

test('a second PUT to the SAME identity-providers/:id id'
+ ' overwrites the row and forms its OWN genesis pair — this'
+ ' address never chains', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-3', DEV_TOKEN,
        providerFields('sarah', 'linked'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-3', DEV_TOKEN,
        providerFields('sarah', 'unlinked'),
    ));
    assert.equal(second.status, 200);
    assert.notEqual(second.headers.get('Response-ID'), firstId);
    assert.equal(second.headers.get('Supersedes'), null);
    const domainRow =
        await db.identityProviders.getById('idp-3');
    assert.equal(domainRow.action, 'unlinked');
});

test('a failed write (unknown action) appends nothing',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-doomed', DEV_TOKEN,
        { ...providerFields('sarah'), action: 'sideways' },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/identity-providers/idp-9', DEV_TOKEN,
        providerFields('sarah'),
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
        'PUT', '/identity-providers/idp-10', DEV_TOKEN,
        providerFields('sarah'),
    ));
    await handleRequest(db, req(
        'PUT', '/identity-providers/idp-11', DEV_TOKEN,
        providerFields('bobby'),
    ));
    const failed = await handleRequest(db, req(
        'PUT', '/identity-providers/idp-fail', DEV_TOKEN,
        { ...providerFields('sarah'), action: 'sideways' },
    ));
    assert.equal(failed.status, 400);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
