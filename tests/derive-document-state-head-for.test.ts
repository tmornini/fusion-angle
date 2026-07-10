import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { documentStateHeadFor } from '../api/derive-states.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';
import { organizationToken } from './token-fixtures.ts';

// Phase 14 Task 5's shared head helper: documentStateHeadFor
// serves the four member_id-echo write-path decision reads
// (postIdeaDocumentOp, postProjectDocumentOp, postRecordDocumentOp,
// postRecordWriteOp's edit arm) — see its own header in
// api/derive-states.ts. This file proves its OWN correctness
// (genesis, a real transition, and the states/:id union leg)
// against the row-plane oracle (db.states.getCurrentFor) before
// any production route depends on it; the flip commits wire it in
// and the standing pins prove the ternary unchanged.

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

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    return db;
}

function ideaDocument(
    state: string, stateAt: string, stateEventId: string,
): Record<string, unknown> {
    return {
        title: 'T', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm',
        state, state_at: stateAt, state_event_id: stateEventId,
    };
}

test('documentStateHeadFor: a never-created id derives null,'
+ ' no throw', async () => {
    const db = await seededDb();
    await assert.doesNotReject(
        () => documentStateHeadFor(db, 'no-such-idea'),
    );
    assert.equal(
        await documentStateHeadFor(db, 'no-such-idea'), null,
    );
});

test('documentStateHeadFor: genesis (one PUT) matches the'
+ ' row-plane oracle, authored by the actor', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'idea-head-genesis';
    const at = nowUtc();
    const created = await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument('active', at, id + '-ev1'),
    ));
    assert.equal(created.status, 200);

    const head = await documentStateHeadFor(db, id);
    assert.ok(head !== null); // Phase Final Task 2: pair plane only
    assert.equal(head?.member_id, 'current');
    assert.equal(head?.state, 'active');
});

test('documentStateHeadFor: a later transition matches the'
+ ' row-plane oracle — the (at, id) reduction picks the'
+ ' LATEST document trio', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'idea-head-transition';
    const at1 = nowUtc();
    await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument('active', at1, id + '-ev1'),
    ));
    const at2 = nowUtc();
    const edited = await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument('archived', at2, id + '-ev2'),
    ));
    assert.equal(edited.status, 200);

    const head = await documentStateHeadFor(db, id);
    assert.ok(head !== null); // Phase Final Task 2: pair plane only
    assert.equal(head?.state, 'archived');
    assert.equal(head?.id, id + '-ev2');
});

// Phase Final Task 1(b): standalone states/:id is pair-plane-
// only (row half stripped). Drop the row-plane oracle half;
// pin the head against the live write's own fields.
test('documentStateHeadFor: a standalone states/:id event'
+ ' UNIONS in and wins when it is the LATEST — pair-plane pin'
+ ' (row-oracle half dropped at Task 1(b) strip)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'idea-head-standalone';
    await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument('active', nowUtc(), id + '-ev1'),
    ));

    const standaloneEventId = generateCryptoSafeBase62();
    const standaloneAt = nowUtc();
    const standalone = await handleRequest(db, req(
        'PUT', '/states/' + standaloneEventId, token, {
            entity_id: id,
            state: 'archived',
            at: standaloneAt,
        },
    ));
    assert.equal(standalone.status, 200);

    const head = await documentStateHeadFor(db, id);
    assert.deepEqual(head, {
        id: standaloneEventId,
        entity_id: id,
        state: 'archived',
        member_id: 'current',
        at: standaloneAt,
    });
});
