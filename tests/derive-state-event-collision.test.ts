import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { LedgerImmutabilityError } from '../api/db.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    stateEventCollisionFromPairs,
} from '../api/derive-states.ts';

// Phase 15 Task 6 / Phase Final Task 1(b): 
// stateEventCollisionFromPairs — pair-plane immutability for
// PUT /states/:id. Row half STRIPPED at Task 1(b); this file
// is pure pair-plane. Wire pins: 409 LedgerImmutabilityError
// bytes; different-envelope resend is a pinned case.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const EVENT_ID = 'ev-collision-1';
const BODY = {
    entity_id: 'ghost-collision',
    state: 'active',
    at: AT,
};
// DEV_TOKEN's sub is the root admin identity — stamped as
// member_id / requesterIdentityId on live writes.
const ACTOR = 'current';

// Exact wire body of LedgerImmutabilityError for states/:id.
function ledger409Body(id: string): { error: string } {
    const err = new LedgerImmutabilityError('states', id);
    return { error: err.message };
}

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            ...(headers ?? {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function statesPairCount(
    responses: readonly { uri_prefix: string;
        uri_id: string; status: number }[],
    eventId: string,
): number {
    return responses.filter((r) =>
        r.uri_id === eventId
        && /\/states\/$/.test(r.uri_prefix)
        && r.status >= 200
        && r.status < 300,
    ).length;
}

test('stateEventCollisionFromPairs: absent when no pairs'
+ ' name the event id', async () => {
    const db = await freshDb();
    const disposition = await stateEventCollisionFromPairs(
        db, EVENT_ID, {
            entity_id: BODY.entity_id,
            state: BODY.state,
            member_id: 'anyone',
            at: BODY.at,
        },
    );
    assert.equal(disposition, 'absent');
});

test('stateEventCollisionFromPairs: same after a live PUT'
+ ' lands one pair', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/states/' + EVENT_ID, DEV_TOKEN, BODY,
    ));
    assert.equal(res.status, 200);
    const disposition = await stateEventCollisionFromPairs(
        db, EVENT_ID, {
            entity_id: BODY.entity_id,
            state: BODY.state,
            member_id: ACTOR,
            at: BODY.at,
        },
    );
    assert.equal(disposition, 'same');
});

test('stateEventCollisionFromPairs: conflict when candidate'
+ ' differs from the stored pair body', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/states/' + EVENT_ID, DEV_TOKEN, BODY,
    ));
    assert.equal(res.status, 200);
    const disposition = await stateEventCollisionFromPairs(
        db, EVENT_ID, {
            entity_id: BODY.entity_id,
            state: 'deleted',
            member_id: ACTOR,
            at: BODY.at,
        },
    );
    assert.equal(disposition, 'conflict');
});

test('stateEventCollisionFromPairs: different-envelope resend'
+ ' yields two pairs and still reports same', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'PUT', '/states/' + EVENT_ID, DEV_TOKEN, BODY,
        { 'x-request-id': 'envelope-a' },
    ));
    assert.equal(first.status, 200);
    const second = await handleRequest(db, req(
        'PUT', '/states/' + EVENT_ID, DEV_TOKEN, BODY,
        { 'x-request-id': 'envelope-b' },
    ));
    assert.equal(second.status, 200);

    const responses = await db.responses.getAllWhere(
        'uri_id', EVENT_ID,
    );
    assert.equal(
        statesPairCount(responses, EVENT_ID), 2,
        'finding 2: two 2xx pairs at one uri_id',
    );

    const disposition = await stateEventCollisionFromPairs(
        db, EVENT_ID, {
            entity_id: BODY.entity_id,
            state: BODY.state,
            member_id: ACTOR,
            at: BODY.at,
        },
    );
    assert.equal(disposition, 'same');
});

// -- Wire pins: pure pair-plane (Task 1(b) strip) --

test('immutability: differing body is 409 with exact'
+ ' LedgerImmutabilityError bytes; pair plane conflict',
async () => {
    const db = await freshDb();
    const id = 'ev-parity-409';
    const first = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, BODY,
    ));
    assert.equal(first.status, 200);

    const conflict = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, {
            ...BODY,
            state: 'deleted',
        },
        { 'x-request-id': 'diff-body' },
    ));
    assert.equal(conflict.status, 409);
    assert.deepEqual(
        await conflict.json(),
        ledger409Body(id),
    );

    // No second pair for the rejected write.
    const responses = await db.responses.getAllWhere(
        'uri_id', id,
    );
    assert.equal(statesPairCount(responses, id), 1);

    assert.equal(
        await stateEventCollisionFromPairs(db, id, {
            entity_id: BODY.entity_id,
            state: 'deleted',
            member_id: ACTOR,
            at: BODY.at,
        }),
        'conflict',
    );
});

test('immutability: different-envelope same-content resend'
+ ' is 200 no-op; two 2xx pairs',
async () => {
    const db = await freshDb();
    const id = 'ev-parity-resend';
    const first = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, BODY,
        { 'x-request-id': 'resend-a' },
    ));
    assert.equal(first.status, 200);
    const firstBody = await first.json() as {
        id: string; state: string;
    };

    const second = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, BODY,
        { 'x-request-id': 'resend-b' },
    ));
    assert.equal(second.status, 200);
    const secondBody = await second.json() as {
        id: string; state: string;
    };
    assert.equal(secondBody.id, id);
    assert.equal(secondBody.state, BODY.state);
    assert.equal(firstBody.id, secondBody.id);

    const responses = await db.responses.getAllWhere(
        'uri_id', id,
    );
    assert.equal(
        statesPairCount(responses, id), 2,
        'finding 2 probe: two 2xx pairs at one uri_id',
    );

    const candidate = {
        entity_id: BODY.entity_id,
        state: BODY.state,
        member_id: ACTOR,
        at: BODY.at,
    };
    assert.equal(
        await stateEventCollisionFromPairs(
            db, id, candidate,
        ),
        'same',
    );
});

test('immutability: byte-identical resend folds at the'
+ ' message_hash gate (one pair)',
async () => {
    const db = await freshDb();
    const id = 'ev-parity-fold';
    const headers = { 'x-request-id': 'same-envelope' };
    const first = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, BODY, headers,
    ));
    assert.equal(first.status, 200);
    const second = await handleRequest(db, req(
        'PUT', '/states/' + id, DEV_TOKEN, BODY, headers,
    ));
    assert.equal(second.status, 200);

    const responses = await db.responses.getAllWhere(
        'uri_id', id,
    );
    assert.equal(
        statesPairCount(responses, id), 1,
        'E6 message_hash fold: no second pair',
    );
});
