import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';

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

function aiDetail(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

function aiCreateBody(id: string, eventId: string, name: string) {
    return {
        id,
        detail: aiDetail(name),
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

function humanPii(name: string) {
    return {
        name,
        email: `${name}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
}

function humanDetail() {
    return {
        title: 'Engineer',
        department: 'Product',
        strengths: '[]',
        team_dimensions: '{}',
    };
}

function humanCreateBody(id: string, eventId: string, name: string) {
    return {
        id,
        pii: humanPii(name),
        detail: humanDetail(),
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

function credentialFields(identityId: string) {
    return {
        identity_id: identityId,
        kind: 'client_secret',
        status: 'set',
        secret: 'hashed-secret',
        at: AT,
    };
}

// ── members (the directory row, global plane) ──

test('PUT members/:id appends its pair at the entity address,'
+ ' and a second PUT supersedes it', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/members/mem-1', DEV_TOKEN, { type: 'human' },
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === 'mem-1');
    assert.ok(row);
    assert.equal(row!.uri_prefix, '/members/');
    const domainRow = await db.members.getById('mem-1');
    assert.deepEqual(await first.json(), domainRow);
    const second = await handleRequest(db, req(
        'PUT', '/members/mem-1', DEV_TOKEN, { type: 'ai' },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('a byte-identical PUT resend to a member returns the'
+ ' stored response and appends nothing', async () => {
    const db = await freshDb();
    const body = { type: 'human' };
    const first = await handleRequest(db, req(
        'PUT', '/members/mem-2', DEV_TOKEN, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/members/mem-2', DEV_TOKEN, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('a PUT to members/:id verifies against its hash and'
+ ' keeps request/response counts balanced', async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'PUT', '/members/mem-3', DEV_TOKEN, { type: 'human' },
    ));
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
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
    assert.equal(requests.length, responses.length);
});

// ── ai-members ──

test('an ai-member create appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-1', 'ev-1', 'Claude'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/ai-members/');
    assert.equal(requests[0]!.uri_id, 'ai-1');
});

test('a failed ai-member create appends nothing', async () => {
    const db = await freshDb();
    await db.states.put('ev-x', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-doomed', 'ev-x', 'Doomed'),
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('PUT ai-members/:id appends its pair, and the wire body'
+ ' matches a domain read', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/ai-members/ai-2', DEV_TOKEN, aiDetail('Bare'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/ai-members/');
    assert.equal(requests[0]!.uri_id, 'ai-2');
    const domainRow = await db.aiMembers.getById('ai-2');
    assert.deepEqual(await res.json(), domainRow);
});

test('POST ai-members/:id (composed edit) appends its pair'
+ ' at the SAME address as a prior PUT, and supersedes it',
async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/ai-members/ai-3', DEV_TOKEN, aiDetail('First'),
    ));
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const edit = await handleRequest(db, req(
        'POST', '/ai-members/ai-3', DEV_TOKEN,
        { detail: aiDetail('Edited') },
    ));
    assert.equal(edit.status, 204);
    assert.equal(edit.headers.get('Supersedes'), firstId);
    const requests = await db.requests.getAll();
    const editRow = requests.find(r => r.uri_id === 'ai-3'
        && r.message.includes('Edited'));
    assert.ok(editRow);
    assert.equal(editRow!.uri_prefix, '/ai-members/');
});

// ── human-members ──

test('a human-member create appends its pair at the entity'
+ ' address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-1', 'ev-2', 'Alice'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/human-members/');
    assert.equal(requests[0]!.uri_id, 'hm-1');
});

test('POST human-members/:id (composed edit) appends its'
+ ' pair at the entity address and supersedes the create',
async () => {
    const db = await freshDb();
    const created = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-2', 'ev-3', 'Bob'),
    ));
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const edit = await handleRequest(db, req(
        'POST', '/human-members/hm-2', DEV_TOKEN,
        { pii: humanPii('Bobby'), detail: humanDetail() },
    ));
    assert.equal(edit.status, 204);
    assert.equal(edit.headers.get('Supersedes'), createdId);
});

// ── identities ──

test('an identity (person) create appends its pair at the'
+ ' entity address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/identities', DEV_TOKEN,
        { id: 'idp-1', kind: 'person', pii: humanPii('Carol') },
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/identities/');
    assert.equal(requests[0]!.uri_id, 'idp-1');
});

test('an identity (service) create appends its pair at the'
+ ' entity address', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/identities', DEV_TOKEN,
        {
            id: 'ids-1', kind: 'service',
            credential: {
                id: 'ids-1-secret',
                ...credentialFields('ids-1'),
            },
        },
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.uri_prefix, '/identities/');
    assert.equal(requests[0]!.uri_id, 'ids-1');
});

test('PUT identities/:id appends its pair, and a second PUT'
+ ' supersedes it', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/identities/idp-2', DEV_TOKEN,
        { kind: 'person' },
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const domainRow = await db.identities.getById('idp-2');
    assert.deepEqual(await first.json(), domainRow);
    // A distinct body (person -> service) forces a genuinely
    // different request message — a byte-identical resend would
    // hit the idempotency fast path instead of writing again.
    const second = await handleRequest(db, req(
        'PUT', '/identities/idp-2', DEV_TOKEN,
        { kind: 'service' },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

// ── identities/:id/pii — singleton at a collection-style
// address (uriId ''): the pattern's last segment 'pii' is not
// a :param, so messageAddress yields uriId '' — a second PUT
// must still record Supersedes at that same (prefix, '') key.

test('PUT identities/:id/pii appends its pair at uriId'
+ ' empty, and a second PUT supersedes it', async () => {
    const db = await freshDb();
    await db.identities.put('sarah', { kind: 'person' });
    const first = await handleRequest(db, req(
        'PUT', '/identities/sarah/pii', DEV_TOKEN,
        humanPii('Sarah'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix === '/identities/sarah/pii/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
    const domainRow = await db.identityPii.getById('sarah');
    assert.deepEqual(await first.json(), domainRow);
    const second = await handleRequest(db, req(
        'PUT', '/identities/sarah/pii', DEV_TOKEN,
        humanPii('Sarah Lee'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('DELETE identities/:id/pii appends its tombstone pair,'
+ ' superseding the PUT', async () => {
    const db = await freshDb();
    await db.identities.put('sarah2', { kind: 'person' });
    const put = await handleRequest(db, req(
        'PUT', '/identities/sarah2/pii', DEV_TOKEN,
        humanPii('Sarah'),
    ));
    const putId = put.headers.get('Response-ID');
    const del = await handleRequest(db, req(
        'DELETE', '/identities/sarah2/pii', DEV_TOKEN,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(() => db.identityPii.getById('sarah2'));
});

// ── identities/:id/credentials/:cid — PUT response carries
// `secret` on the wire (zero-change from today's un-wired
// behavior; GETs still project it out via withoutSecret).

test('PUT identities/:id/credentials/:cid appends its pair,'
+ ' and the wire body INCLUDES the secret field', async () => {
    const db = await freshDb();
    await db.identities.put('svc-1', { kind: 'service' });
    const res = await handleRequest(db, req(
        'PUT', '/identities/svc-1/credentials/cred-1', DEV_TOKEN,
        credentialFields('svc-1'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix === '/identities/svc-1/credentials/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'cred-1');
    const domainRow =
        await db.identityCredentials.getById('cred-1');
    const wireBody = await res.json() as { secret?: string };
    assert.equal(wireBody.secret, 'hashed-secret');
    assert.deepEqual(wireBody, domainRow);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-9', 'ev-9', 'Verify'),
    ));
    await handleRequest(db, req(
        'PUT', '/identities/idp-9', DEV_TOKEN, { kind: 'person' },
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
    await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-10', 'ev-10', 'Mixed'),
    ));
    await handleRequest(db, req(
        'POST', '/ai-members/ai-10', DEV_TOKEN,
        { detail: aiDetail('Mixed2') },
    ));
    await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-10', 'ev-11', 'Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/identities/idp-10', DEV_TOKEN, { kind: 'person' },
    ));
    await db.states.put('ev-conflict', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-fail', 'ev-conflict', 'Fail'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
