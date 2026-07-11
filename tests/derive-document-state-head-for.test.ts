import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { nowUtc } from '../api/types.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { documentStateHeadFor } from '../api/derive-states.ts';
import { organizationToken } from './token-fixtures.ts';

// Phase 14 Task 5's shared head helper: documentStateHeadFor
// serves the four member_id-echo write-path decision reads
// (postIdeaDocumentOp, postProjectDocumentOp, postRecordDocumentOp,
// postRecordWriteOp's edit arm) — see its own header in
// api/derive-states.ts. This file proves its OWN correctness
// (genesis and a later document-trio transition). The
// standalone states/:id union leg retired with the address.

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
