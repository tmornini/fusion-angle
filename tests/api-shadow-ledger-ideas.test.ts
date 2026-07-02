import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { httpDateOf } from '../api/message-pair.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

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

// The idea body OMITS organization_id — the org fence stamps
// it from the verified token before the store validates.
function ideaFields(title: string) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

function createIdea(
    db: MemoryDbAdapter,
    token: string,
    id: string,
): Promise<Response> {
    return handleRequest(db, req('POST', '/ideas', token, {
        id,
        idea: ideaFields('Fresh Idea'),
        initialState: 'active',
        initialStateEventId: 'ev-' + id,
        initialStateAt: '2026-01-01T00:00:00.000000Z',
    }));
}

test('an idea create appends its pair at the entity address',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createIdea(db, token, 'idea-1');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/organizations/1/ideas/',
    );
    assert.equal(requests[0]!.uri_id, 'idea-1');
    const responses = await db.responses.getAll();
    assert.equal(responses[0]!.id, requests[0]!.id);
});

test('a failed create appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    // Pre-seed a DIFFERENT event at the create's
    // initialStateEventId so the domain write's own guard
    // (LedgerImmutabilityError) rejects it mid-tx — the pair
    // append is the LAST act of that same transaction, so it
    // rolls back with everything else.
    await db.states.put('ev-x', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/ideas', token, {
            id: 'idea-rollback',
            idea: ideaFields('Doomed'),
            initialState: 'active',
            initialStateEventId: 'ev-x',
            initialStateAt: '2099-01-02T00:00:00.000000Z',
        },
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('a second PUT to the same idea records supersedes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/ideas/idea-2', token, ideaFields('First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', '/ideas/idea-2', token, ideaFields('Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
    const secondId = second.headers.get('Response-ID');
    const secondRow = (await db.responses.getAll())
        .find((row) => row.id === secondId);
    assert.equal(secondRow?.supersedes, firstId);
});

test('the wire Date renders the response row at',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/ideas/idea-3', token, ideaFields('Dated'),
    ));
    const responseId = res.headers.get('Response-ID');
    const row = (await db.responses.getAll())
        .find((r) => r.id === responseId);
    assert.equal(res.headers.get('Date'), httpDateOf(row!.at));
});

test('a byte-identical resend keeps the ORIGINAL Date',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaFields('Resend');
    const first = await handleRequest(
        db, req('PUT', '/ideas/idea-4', token, body),
    );
    const firstDate = first.headers.get('Date');
    const second = await handleRequest(
        db, req('PUT', '/ideas/idea-4', token, body),
    );
    assert.equal(second.headers.get('Date'), firstDate);
});

test('a byte-identical resend returns the stored response '
+ 'and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaFields('Idempotent');
    const first = await handleRequest(
        db, req('PUT', '/ideas/idea-5', token, body),
    );
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(
        db, req('PUT', '/ideas/idea-5', token, body),
    );
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createIdea(db, token, 'idea-6');
    await handleRequest(db, req(
        'PUT', '/ideas/idea-6', token, ideaFields('Verify'),
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

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const idea = await handleRequest(db, req(
        'PUT', '/ideas/idea-8', token, ideaFields('Wired'),
    ));
    assert.equal(idea.status, 200);
    const ideaRow = await db.ideas.getById('idea-8');
    assert.deepEqual(await idea.json(), ideaRow);

    const submission = await handleRequest(db, req(
        'PUT', '/ideas/idea-8/submissions/sub-8', token, {
            idea_id: 'idea-8',
            member_id: 'current',
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    assert.equal(submission.status, 200);
    const submissionRow =
        await db.ideaSubmissions.getById('sub-8');
    assert.deepEqual(await submission.json(), submissionRow);

    const state = await handleRequest(db, req(
        'PUT', '/states/ev-8', token, {
            entity_id: 'idea-8',
            state: 'active',
            at: '2026-01-01T00:00:02.000000Z',
        },
    ));
    assert.equal(state.status, 200);
    const stateRow = await db.states.getById('ev-8');
    assert.deepEqual(await state.json(), stateRow);
});

test('a DELETE to a pair-wired PUT-only route still 405s '
+ 'instead of running the pair machinery', async () => {
    // ideas/:id is pair-wired for PUT but exposes no DELETE
    // handler — the gate must skip pair formation (and its
    // successBody validation) for a verb no handler serves,
    // rather than surfacing that validation's 400 in place of
    // the ordinary 405.
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE', '/ideas/idea-9', token),
    );
    assert.equal(res.status, 405);
    assert.equal((await db.requests.getAll()).length, 0);
});

test('request and response counts stay equal',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createIdea(db, token, 'idea-7');
    await handleRequest(db, req(
        'PUT', '/ideas/idea-7', token, ideaFields('Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/ideas/idea-7/submissions/sub-1', token, {
            idea_id: 'idea-7',
            member_id: 'current',
            at: '2026-01-01T00:00:01.000000Z',
        },
    ));
    await handleRequest(db, req(
        'PUT', '/states/ev-mixed', token, {
            entity_id: 'idea-7',
            state: 'active',
            at: '2026-01-01T00:00:02.000000Z',
        },
    ));
    // One failed write in the mix — a state ledger conflict —
    // must not disturb the invariant.
    await db.states.put('ev-conflict', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'PUT', '/states/ev-conflict', token, {
            entity_id: 'idea-7',
            state: 'promoted',
            at: '2026-01-01T00:00:03.000000Z',
        },
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
