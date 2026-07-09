import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

// Phase 2 Task 2 (Decision 7 state-in-entity): PUT /ideas/:id
// now takes the FULL document — the entity's fields plus the
// state trio (state, state_at, state_event_id). The op
// decomposes it: the old-plane ideas row stays byte-identical
// (no state column), and the trio lands on the states log via
// ONE states.postEvent call in the same transaction. These
// cases exercise the MEMBER_ID CAVEAT split (a state-unchanged
// edit must replay the STORED head event's member_id, never
// the editing actor) and the wire-parity rule (the pair's
// stored request carries the trio; the old-plane row does not).

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

test('a document PUT with a new state writes the row and'
+ ' exactly one event, authored by the actor', async () => {
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
    const row = await db.ideas.getById('doc-1');
    assert.equal(row.title, 'Fresh');
    assert.ok(!('state' in row));
    const events = await db.states.getAllFor('doc-1');
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
    const events = await db.states.getAllFor('doc-2');
    assert.equal(events.length, 1);
    const row = await db.ideas.getById('doc-2');
    assert.equal(row.title, 'Second');
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
    const events = await db.states.getAllFor('doc-3');
    assert.equal(events.length, 1);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

test('the pair body carries state/state_at while the'
+ ' old-plane row carries neither', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/ideas/doc-4', token,
        ideaDocument(
            'Wired', 'in_review',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-4',
        ),
    ));
    const row = await db.ideas.getById('doc-4') as
        Record<string, unknown>;
    assert.ok(!('state' in row));
    assert.ok(!('state_at' in row));
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    const parsed = JSON.parse(requests[3]!.message) as {
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

    const events = await db.states.getAllFor('doc-5');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');

    const row = await db.ideas.getById('doc-5');
    assert.equal(row.title, 'Second');
});
