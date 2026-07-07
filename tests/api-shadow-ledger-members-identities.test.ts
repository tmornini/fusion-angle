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

// PII no longer rides the create body (Phase 10 Task 2's intake
// decomposition) — it enters via a separate PUT
// identities/:id/pii, formed independently via humanPii() at
// call sites that need it.
function humanCreateBody(id: string, eventId: string) {
    return {
        id,
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

test('an ai-member create appends its bundle: operation +'
+ ' detail document share the entity address, member document'
+ ' sits at its own', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-1', 'ev-1', 'Claude'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // Create balance: operation + detail document (both at the
    // shared ai-members address) + member document (its own
    // address) = 3 — the H7/arrival-order hazard means a
    // positional requests[0] read is unsafe once an address
    // holds two pairs, so filter/count instead (the
    // objectives-family precedent).
    assert.equal(requests.length, 3);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/ai-members/'
            && r.uri_id === 'ai-1',
    );
    assert.equal(atEntity.length, 2);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'ai-1',
    );
    assert.equal(atMember.length, 1);
    // The synthesized member document is byte-indistinguishable
    // from a live PUT members/:id pair: `type` alone.
    const memberBody = JSON.parse(atMember[0]!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(memberBody.body, { type: 'ai' });
    // The synthesized detail document — distinguished from the
    // operation pair by its OWN 200 response, the operation
    // pair's being 204 — is byte-indistinguishable from a live
    // PUT ai-members/:id pair: the four detail keys verbatim.
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    const detailRow = atEntity.find(
        r => responseById.get(r.id)?.status === 200,
    );
    assert.ok(detailRow, 'no detail document pair');
    const detailBody = JSON.parse(detailRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(detailBody.body).sort(),
        ['description', 'model', 'name', 'skill_focus'],
    );
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

test('POST ai-members/:id (composed edit) appends its bundle'
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
    // Edit balance: the PUT's own pair, plus the edit's own
    // operation + detail document (both at the shared
    // ai-members address) + member document (its own address)
    // = 4.
    assert.equal(requests.length, 4);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/ai-members/'
            && r.uri_id === 'ai-3',
    );
    assert.equal(atEntity.length, 3);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'ai-3',
    );
    assert.equal(atMember.length, 1);
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    const editDetailRow = atEntity.find(
        r => responseById.get(r.id)?.status === 200
            && r.message.includes('Edited'),
    );
    assert.ok(editDetailRow, 'no edit detail-document pair');
    assert.equal(
        responseById.get(editDetailRow!.id)?.supersedes, firstId,
    );
});

test('POST ai-members/:id (composed edit after a create)'
+ ' folds the member-document pair and supersedes the create',
async () => {
    const db = await freshDb();
    const created = await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-4', 'ev-4', 'Cassandra'),
    ));
    assert.equal(created.status, 204);
    // The create's OWN detail-document pair — appended strictly
    // after the operation pair within the same tx — becomes the
    // shared address's true head (nowUtc monotonicity), NOT the
    // operation pair's own Response-ID (the human-members
    // create-then-edit precedent above).
    const afterCreate = (await db.responses.getAll()).filter(
        r => r.uri_prefix === '/ai-members/'
            && r.uri_id === 'ai-4',
    );
    assert.equal(afterCreate.length, 2);
    const trueHead = afterCreate.find(r => r.status === 200);
    assert.ok(trueHead, 'no detail document pair after create');
    // Distinct detail values (the E6 fold note, AI-symmetric):
    // the edit's own detail-document pair must differ from the
    // create's, or it folds via message_hash and never lands.
    const edit = await handleRequest(db, req(
        'POST', '/ai-members/ai-4', DEV_TOKEN,
        { detail: aiDetail('Cass') },
    ));
    assert.equal(edit.status, 204);
    assert.equal(edit.headers.get('Supersedes'), trueHead!.id);
    // Balance: create's 3 + the edit's operation and detail
    // document (2) = 5. The edit's OWN member-document pair
    // folds: `type` is invariant per member (an AI never
    // becomes non-AI across an edit), so its body ({type: 'ai'})
    // is byte-identical to the create's own — the member-
    // document address permanently folds after genesis, by
    // construction, for every member (the human-members
    // precedent's cross-family code-identity, confirmed at
    // Phase 8).
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 5);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/ai-members/'
            && r.uri_id === 'ai-4',
    );
    assert.equal(atEntity.length, 4);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'ai-4',
    );
    assert.equal(atMember.length, 1);
});

test('a failed ai-member edit appends nothing', async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'POST', '/ai-members', DEV_TOKEN,
        aiCreateBody('ai-edit-fail', 'ev-ef', 'Base'),
    ));
    const before = (await db.requests.getAll()).length;
    const res = await handleRequest(db, req(
        'POST', '/ai-members/ai-edit-fail', DEV_TOKEN,
        { detail: { ...aiDetail('Bad'), model: 'not-a-model' } },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, before);
    assert.equal((await db.responses.getAll()).length, before);
});

// ── human-members ──

test('a human-member create appends its bundle: operation +'
+ ' detail document share the entity address, member document'
+ ' and the identities document each sit at their own; its PII'
+ ' intake forms its own pair at identities/:id/pii', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-1', 'ev-2'),
    ));
    assert.equal(res.status, 204);
    const pii = await handleRequest(db, req(
        'PUT', '/identities/hm-1/pii', DEV_TOKEN,
        humanPii('Alice'),
    ));
    assert.equal(pii.status, 200);
    const requests = await db.requests.getAll();
    // Create balance: operation + detail document (both at the
    // shared human-members address) + member document (its own
    // address) + identities document (its own address, Task 5) =
    // 4 — the ai-members precedent above, widened by one. + 1 for
    // the PII intake's own pair at its own address (Phase 10 Task
    // 2's intake decomposition — pii no longer rides the create's
    // own request) = 5.
    assert.equal(requests.length, 5);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/human-members/'
            && r.uri_id === 'hm-1',
    );
    assert.equal(atEntity.length, 2);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'hm-1',
    );
    assert.equal(atMember.length, 1);
    const atIdentity = requests.filter(
        r => r.uri_prefix === '/identities/' && r.uri_id === 'hm-1',
    );
    assert.equal(atIdentity.length, 1);
    const atPii = requests.filter(
        r => r.uri_prefix === '/identities/hm-1/pii/',
    );
    assert.equal(atPii.length, 1);
    assert.equal(atPii[0]!.uri_id, '');
    const memberBody = JSON.parse(atMember[0]!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(memberBody.body, { type: 'human' });
    // The synthesized identities document — byte-indistinguishable
    // from a live PUT identities/:id pair: `kind` alone.
    const identityBody = JSON.parse(atIdentity[0]!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(identityBody.body, { kind: 'person' });
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    const detailRow = atEntity.find(
        r => responseById.get(r.id)?.status === 200,
    );
    assert.ok(detailRow, 'no detail document pair');
    const detailBody = JSON.parse(detailRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(detailBody.body).sort(),
        ['department', 'strengths', 'team_dimensions', 'title'],
    );
});

test('POST human-members/:id (composed edit) appends its'
+ ' bundle at the entity address and supersedes the create',
async () => {
    const db = await freshDb();
    const created = await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-2', 'ev-3'),
    ));
    assert.equal(created.status, 204);
    // The create's OWN detail-document pair — appended strictly
    // after the operation pair within the same tx — becomes the
    // shared address's true head (nowUtc monotonicity), NOT the
    // operation pair's own Response-ID (the objectives duplicate-
    // create precedent).
    const afterCreate = (await db.responses.getAll()).filter(
        r => r.uri_prefix === '/human-members/'
            && r.uri_id === 'hm-2',
    );
    assert.equal(afterCreate.length, 2);
    const trueHead = afterCreate.find(r => r.status === 200);
    assert.ok(trueHead, 'no detail document pair after create');
    // Distinct detail values (the E6 fold note): the edit's own
    // detail-document pair must differ from the create's, or it
    // folds via message_hash and never lands.
    const edit = await handleRequest(db, req(
        'POST', '/human-members/hm-2', DEV_TOKEN,
        {
            detail: { ...humanDetail(), title: 'Senior Engineer' },
        },
    ));
    assert.equal(edit.status, 204);
    assert.equal(edit.headers.get('Supersedes'), trueHead!.id);
    // Balance: create's 4 (Task 5's widened bundle) + the edit's
    // operation and detail document (2) = 6. The edit's OWN
    // member-document pair folds: `type` is invariant per member
    // (a human never becomes non-human across an edit), so its
    // body ({type: 'human'}) is byte-identical to the create's
    // own — the member-document address permanently folds after
    // genesis, by construction, for every member. The edit's OWN
    // identities document pair folds the SAME way (the E6 fold):
    // {kind:'person'} is byte-identical to the create's own, so it
    // never appends a second row either.
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 6);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/human-members/'
            && r.uri_id === 'hm-2',
    );
    assert.equal(atEntity.length, 4);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'hm-2',
    );
    assert.equal(atMember.length, 1);
    const atIdentity = requests.filter(
        r => r.uri_prefix === '/identities/' && r.uri_id === 'hm-2',
    );
    assert.equal(atIdentity.length, 1);
});

test('a failed human-member edit appends nothing', async () => {
    const db = await freshDb();
    await handleRequest(db, req(
        'POST', '/human-members', DEV_TOKEN,
        humanCreateBody('hm-edit-fail', 'ev-hf'),
    ));
    const before = (await db.requests.getAll()).length;
    const res = await handleRequest(db, req(
        'POST', '/human-members/hm-edit-fail', DEV_TOKEN,
        {
            detail: { ...humanDetail(), strengths: 'not-json' },
        },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, before);
    assert.equal((await db.responses.getAll()).length, before);
});

// ── identities ──

test('an identity (person) create appends its bundle: operation'
+ ' + identities document share the entity address, and its PII'
+ ' intake forms its own pair at identities/:id/pii', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/identities', DEV_TOKEN,
        { id: 'idp-1', kind: 'person' },
    ));
    assert.equal(res.status, 204);
    const pii = await handleRequest(db, req(
        'PUT', '/identities/idp-1/pii', DEV_TOKEN,
        humanPii('Carol'),
    ));
    assert.equal(pii.status, 200);
    const requests = await db.requests.getAll();
    // The bare create's own bundle — operation + the synthesized
    // identities document, both at the entity address (Task 5's
    // create-address-collapse, the ai-members/detail-document
    // precedent) — = 2, + the PII intake's own pair at its own
    // address (Phase 10 Task 2's intake decomposition — pii no
    // longer rides the create's own request) = 3.
    assert.equal(requests.length, 3);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/identities/'
            && r.uri_id === 'idp-1',
    );
    assert.equal(atEntity.length, 2);
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    const documentRow = atEntity.find(
        r => responseById.get(r.id)?.status === 200,
    );
    assert.ok(documentRow, 'no identities document pair');
    const documentBody = JSON.parse(documentRow!.message) as {
        body: Record<string, unknown>;
    };
    // Byte-indistinguishable from a live PUT identities/:id pair:
    // `kind` alone.
    assert.deepEqual(documentBody.body, { kind: 'person' });
    const atPii = requests.find(
        r => r.uri_prefix === '/identities/idp-1/pii/',
    );
    assert.ok(atPii, 'no request row for the PII intake');
    assert.equal(atPii!.uri_id, '');
});

test('an identity (service) create appends its bundle:'
+ ' operation + identities document share the entity address,'
+ ' credential document sits at its own', async () => {
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
    // operation + identities document (both at the entity
    // address, Task 5's create-address-collapse) + credential
    // document (its own address) = 3.
    assert.equal(requests.length, 3);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/identities/'
            && r.uri_id === 'ids-1',
    );
    assert.equal(atEntity.length, 2);
    const atCredential = requests.filter(
        r => r.uri_prefix === '/identities/ids-1/credentials/'
            && r.uri_id === 'ids-1-secret',
    );
    assert.equal(atCredential.length, 1);
    const credentialBody = JSON.parse(
        atCredential[0]!.message,
    ) as { body: Record<string, unknown> };
    // Byte-indistinguishable from a live PUT
    // identities/:id/credentials/:cid pair: the five credential
    // keys, mirroring the live wire body (hash-bearing per the
    // covenant — the secret arrives already client-hashed).
    assert.deepEqual(
        Object.keys(credentialBody.body).sort(),
        ['at', 'identity_id', 'kind', 'secret', 'status'],
    );
});

test('a service identity create with an invalid credential body'
+ ' appends nothing: the credential-document pair never forms,'
+ ' so postIdentityCreationOp is never even called'
+ ' (bundle-or-nothing)', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/identities', DEV_TOKEN,
        {
            id: 'ids-bad', kind: 'service',
            credential: {
                id: 'ids-bad-secret',
                ...credentialFields('ids-bad'),
                kind: 'not-a-kind',
            },
        },
    ));
    assert.equal(res.status, 400);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
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
// a :param, so messageAddress yields uriId ''. The address is
// ALSO the message plane's sanctioned hard-delete zone (Phase
// 10 Task 3): chainless, single-slot — a second write REPLACES
// the prior pair rather than recording Supersedes over it.

test('PUT identities/:id/pii appends its pair at uriId'
+ ' empty, and a second PUT REPLACES it (the single-slot'
+ ' zone, Phase 10 Task 3)', async () => {
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
    // Chainless (gate 4): the zone never records Supersedes —
    // the second write REPLACES the slot under its OWN, fresh
    // Response-ID, so exactly ONE pair survives at the address.
    assert.equal(second.headers.get('Supersedes'), null);
    assert.notEqual(second.headers.get('Response-ID'), firstId);
    const atAddress = (await db.requests.getAll()).filter(
        r => r.uri_prefix === '/identities/sarah/pii/',
    );
    assert.equal(atAddress.length, 1);
});

test('DELETE identities/:id/pii appends its tombstone pair,'
+ ' REPLACING the PUT (the single-slot zone)', async () => {
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
    // Chainless: the tombstone carries no Supersedes either — it
    // physically replaces the PUT's row rather than chaining
    // past it.
    assert.equal(del.headers.get('Supersedes'), null);
    assert.notEqual(del.headers.get('Response-ID'), putId);
    const atAddress = (await db.requests.getAll()).filter(
        r => r.uri_prefix === '/identities/sarah2/pii/',
    );
    assert.equal(atAddress.length, 1);
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
        humanCreateBody('hm-10', 'ev-11'),
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
