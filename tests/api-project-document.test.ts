import { test } from 'node:test';
import {
    deriveProject,
    deriveProjectStateHistory,
    projectEntityOf,
} from '../api/derive-projects.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import {
    apiRequest, TEST_OPERATION_ID,
    storedPutBodyText,
} from './http-fixtures.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';

function pairJsonOf(message: string): {
    readonly body: Record<string, unknown>;
} {
    const body = HttpMessage.fromWire(message).body();
    return {
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// Phase 3 Task 2 (Decision 7 state-in-entity): PUT
// /projects/:id takes the FULL document — entity fields plus
// the state trio. G1: stored PUT body is projectEntityOf of
// the same chain (trio included). GET streams that body.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
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
    assert.equal(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assert.equal(putWire.title, 'Fresh');
    assert.equal(putWire.state, 'submitted');
    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-1', token),
    );
    assert.equal(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state: string;
        state_at: string;
        state_event_id: string;
    };
    assert.equal(getWire.title, 'Fresh');
    assert.equal(getWire.state, 'submitted');
    const events = await deriveProjectStateHistory(db, '1', 'doc-1');
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
    assert.equal(edit.status, 201);
    const events = await deriveProjectStateHistory(db, '1', 'doc-2');
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
    const events = await deriveProjectStateHistory(db, '1', 'doc-3');
    assert.equal(events.length, 1);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('the pair request body carries the lifecycle trio;'
+ ' GET streams the stored PUT (with trio)', async () => {
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
    const wire = await getRes.json() as {
        title: string;
        state?: string;
    };
    assert.equal(wire.title, 'Wired');
    assert.equal(wire.state, 'under_review');
    const requests = await db.requests.getAll();
    // seedRootAdmin 2 + project PUT 1
    assert.equal(requests.length, 3);
    const parsed = pairJsonOf(requests[2]!.message) as {
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
    assert.equal(created.status, 201);

    const edited = await handleRequest(db, req(
        'PUT', '/projects/doc-5', tokenB,
        projectDocument(
            'Second', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(edited.status, 201);

    const events = await deriveProjectStateHistory(db, '1', 'doc-5');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');

    const getRes = await handleRequest(
        db, req('GET', '/projects/doc-5', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('stored PUT body equals projectEntityOf of the same'
+ ' chain', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const id = 'project-g1-stream';
    const at = '2026-01-01T00:00:00.000000Z';
    const ev = 'ev-g1';
    const body = projectDocument(
        'Streamed', 'submitted', at, ev,
    );
    const put = await handleRequest(
        db, req('PUT', '/projects/' + id, token, body),
    );
    assert.equal(put.status, 201);
    const prefix = '/organizations/1/projects/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = projectEntityOf(
        {
            uriId: id,
            pairId: id,
            method: 'PUT',
            body,
        },
        '1',
        {
            id: ev,
            entity_id: id,
            state: 'submitted',
            member_id: 'current',
            at,
        },
    );
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored, await deriveProject(db, '1', id),
    );
    const skewed = await handleRequest(db, req(
        'PUT', '/projects/' + id, token,
        projectDocument(
            'Skewed', 'under_review',
            '2020-01-01T00:00:00.000000Z', 'ev-g1-skew',
        ),
    ));
    assert.equal(skewed.status, 201);
    const afterSkew = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        afterSkew,
        await deriveProject(db, '1', id),
    );
    assert.equal(afterSkew.state, 'submitted');
    assert.equal(afterSkew.state_event_id, ev);
    assert.equal(afterSkew.title, 'Skewed');
});
