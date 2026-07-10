import { test } from 'node:test';
import { deriveStatesFor } from
    '../api/derive-states.ts';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

// Phase 3 Task 2 (Decision 7 state-in-entity): PUT
// /projects/:id takes the FULL document — entity fields plus
// the state trio. Phase Final Task 2: projects ROW half
// stripped; the trio still lands on the states log via
// states.postEvent (until the states-trace strip). Cases
// exercise the MEMBER_ID CAVEAT (state-unchanged edit replays
// the STORED head event's member_id) and wire-parity (pair
// request carries the trio; GET/WRITE_RESPONSE_SPECS form
// the entity without state).

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

function projectDocument(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
) {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
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
        'PUT', '/projects/doc-1', token,
        projectDocument(
            'Fresh', 'submitted',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-1',
        ),
    ));
    assert.equal(res.status, 200);
    const wire = await res.json() as Record<string, unknown>;
    assert.equal(wire.title, 'Fresh');
    assert.ok(!('state' in wire));
    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-1', token),
    );
    assert.equal(getRes.status, 200);
    assert.deepEqual(await getRes.json(), wire);
    const events = await deriveStatesFor(db, '1', 'doc-1');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'submitted');
    assert.equal(events[0]!.member_id, 'current');
});

test('a state-unchanged edit writes no second event',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/projects/doc-2', token,
        projectDocument(
            'First', 'submitted',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-2',
        ),
    ));
    const edit = await handleRequest(db, req(
        'PUT', '/projects/doc-2', token,
        projectDocument(
            'Second', 'submitted',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-2',
        ),
    ));
    assert.equal(edit.status, 200);
    const events = await deriveStatesFor(db, '1', 'doc-2');
    assert.equal(events.length, 1);
    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-2', token),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('a byte-identical resend converges: one event,'
+ ' one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = projectDocument(
        'Idempotent', 'submitted',
        '2026-01-01T00:00:00.000000Z', 'ev-doc-3',
    );
    await handleRequest(
        db, req('PUT', '/projects/doc-3', token, body),
    );
    await handleRequest(
        db, req('PUT', '/projects/doc-3', token, body),
    );
    const events = await deriveStatesFor(db, '1', 'doc-3');
    assert.equal(events.length, 1);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

test('the pair body carries state/state_at while the'
+ ' GET wire entity carries neither', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/projects/doc-4', token,
        projectDocument(
            'Wired', 'under_review',
            '2026-01-01T00:00:00.000000Z', 'ev-doc-4',
        ),
    ));
    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-4', token),
    );
    const wire = await getRes.json() as
        Record<string, unknown>;
    assert.ok(!('state' in wire));
    assert.ok(!('state_at' in wire));
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    const parsed = JSON.parse(requests[3]!.message) as {
        body: { state: string; state_at: string };
    };
    assert.equal(parsed.body.state, 'under_review');
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
        state: 'submitted',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-doc-5',
    };

    const created = await handleRequest(db, req(
        'PUT', '/projects/doc-5', tokenA,
        projectDocument(
            'First', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(created.status, 200);

    const edited = await handleRequest(db, req(
        'PUT', '/projects/doc-5', tokenB,
        projectDocument(
            'Second', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(edited.status, 200);

    const events = await deriveStatesFor(db, '1', 'doc-5');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');

    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-5', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});
