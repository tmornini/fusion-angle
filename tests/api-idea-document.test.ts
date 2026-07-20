import { test } from 'node:test';
import { deriveIdeaStateHistory } from
    '../api/derive-ideas.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

// Phase 2 Task 2 (Decision 7 state-in-entity): PUT /ideas/:id
// takes the FULL document — entity fields plus the state trio.
// Phase Final Task 2: ideas ROW half stripped; the trio still
// lands on the states log via states.postEvent (until the
// states-trace strip). Cases exercise the MEMBER_ID CAVEAT
// (state-unchanged edit replays the STORED head event's
// member_id) and wire-parity (pair request carries the trio;
// GET/WRITE_RESPONSE_SPECS form the entity without state).

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
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function ideaDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

test('a document PUT with a new state writes wire entity'
+ ' and exactly one event, authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/ideas/doc-1', token,
        ideaDocument(
            'Fresh', 'active',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-1',
        ),
    ));
    assert.equal(res.status, 200);
    const putWire = await res.json() as Record<string, unknown>;
    assert.equal(putWire.title, 'Fresh');
    // PUT successBody is entity fields only — no trio.
    assert.ok(!('state' in putWire));
    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-1', token),
    );
    assert.equal(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state: string;
        state_at: string;
        state_event_id: string;
    };
    assert.equal(getWire.title, 'Fresh');
    // GET stamps lifecycle-current trio from the event.
    assert.equal(getWire.state, 'active');
    assert.equal(
        getWire.state_at, '2026-01-01T00:00:00.000000Z',
    );
    assert.equal(getWire.state_event_id, 'ev-doc-1');
    const events = await deriveIdeaStateHistory(db, '1', 'doc-1');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'active');
    assert.equal(events[0]!.member_id, 'current');
});

test('a state-unchanged edit writes no second event',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/ideas/doc-2', token,
        ideaDocument(
            'First', 'active',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-2',
        ),
    ));
    const edit = await handleRequest(db, req(
        'PUT', '/ideas/doc-2', token,
        ideaDocument(
            'Second', 'active',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-2',
        ),
    ));
    assert.equal(edit.status, 200);
    const events = await deriveIdeaStateHistory(db, '1', 'doc-2');
    assert.equal(events.length, 1);
    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-2', token),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('a byte-identical resend converges: one event,'
+ ' one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument(
        'Idempotent', 'active',
        '2026-01-01T00:00:00.000000Z', 'ev-doc-3',
    );
    await handleRequest(
        db, req('PUT', '/ideas/doc-3', token, body),
    );
    await handleRequest(
        db, req('PUT', '/ideas/doc-3', token, body),
    );
    const events = await deriveIdeaStateHistory(db, '1', 'doc-3');
    assert.equal(events.length, 1);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('the pair body and GET wire both carry the'
+ ' lifecycle-current trio (stamped from the event,'
+ ' not re-copied from the head body)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/ideas/doc-4', token,
        ideaDocument(
            'Wired', 'in_review',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-4',
        ),
    ));
    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-4', token),
    );
    const wire = await getRes.json() as {
        state: string;
        state_at: string;
        state_event_id: string;
    };
    assert.equal(wire.state, 'in_review');
    assert.equal(
        wire.state_at, '2026-01-01T00:00:00.000000Z',
    );
    assert.equal(wire.state_event_id, 'ev-doc-4');
    const requests = await db.requests.getAll();
    // seedRootAdmin 2 + idea PUT 1
    assert.equal(requests.length, 3);
    const parsed = JSON.parse(requests[2]!.message) as {
        body: { state: string; state_at: string };
    };
    assert.equal(parsed.body.state, 'in_review');
    assert.equal(
        parsed.body.state_at, '2026-01-01T00:00:00.000000Z',
    );
});

// The MEMBER_ID CAVEAT, isolated: every OTHER case above uses
// one actor throughout, so actor === head.member_id always —
// the op's ternary (replay head.member_id vs use actor) is
// indistinguishable from its buggy inverse there. This case
// forces the two apart: member B edits a title-only field
// AFTER member A's own PUT authored the head event. If the
// branches were swapped, the op would stamp B's id onto the
// replayed event; sameEvent (store-state.ts) compares
// member_id too, so that mismatch against the ALREADY-STORED
// (A-authored) row would 409 — this assertion turns that
// swap into a failing test instead of a silent regression.
test('a same-state edit by a DIFFERENT member never'
+ ' reattributes the head event\'s authorship', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'member-b');
    const tokenA = await organizationToken('current');
    const tokenB = await organizationToken('member-b');
    const trio = {
        state: 'active',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-doc-5',
    };

    const created = await handleRequest(db, req(
        'PUT', '/ideas/doc-5', tokenA,
        ideaDocument(
            'First', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(created.status, 200);

    const edited = await handleRequest(db, req(
        'PUT', '/ideas/doc-5', tokenB,
        ideaDocument(
            'Second', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(edited.status, 200);

    const events = await deriveIdeaStateHistory(db, '1', 'doc-5');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');

    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-5', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});
