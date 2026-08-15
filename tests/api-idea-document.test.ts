import { test } from 'node:test';
import {
    deriveIdea,
    deriveIdeaStateHistory,
    ideaEntityOf,
} from '../api/derive-ideas.ts';
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
import { messageStore } from '../api/message-store.ts';
import { setClockForTest, resetClock } from '../api/types.ts';

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

// Phase 2 Task 2 (Decision 7 state-in-entity): PUT /ideas/:id
// takes the FULL document — entity fields plus the state trio.
// G1: stored PUT body is ideaEntityOf of the same chain
// (trio included). GET streams that stored body.

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
    assert.equal(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assert.equal(putWire.title, 'Fresh');
    assert.equal(putWire.state, 'active');
    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-1', token),
    );
    assert.equal(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state?: string;
    };
    assert.equal(getWire.title, 'Fresh');
    assert.equal(getWire.state, 'active');
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
    assert.equal(edit.status, 201);
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

test('same-body second PUT on a simple document is 200'
+ ' and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument(
        'Same Body', 'active',
        '2026-01-01T00:00:00.000000Z', 'ev-same-1',
    );
    const first = await handleRequest(
        db, req('PUT', '/ideas/same-1', token, body),
    );
    assert.equal(first.status, 201);
    const firstEtag = first.headers.get('ETag');
    assert.ok(firstEtag !== null && firstEtag !== '');
    const prefix = '/organizations/1/ideas/';
    const before = (await db.requests.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'same-1');
    assert.equal(before.length, 1);
    // Different hoisted header → different request hash,
    // so this is same-body, not replay.
    const second = await handleRequest(
        db,
        new Request('http://localhost/ideas/same-1', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
                'Idempotency-Key': 'k-same-1',
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify(body),
        }),
    );
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('ETag'), firstEtag);
    const after = (await db.requests.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'same-1');
    assert.equal(after.length, 1);
});

test('the pair request body carries the lifecycle trio;'
+ ' GET streams the stored PUT (with trio)', async () => {
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
        title: string;
        state?: string;
    };
    assert.equal(wire.title, 'Wired');
    assert.equal(wire.state, 'in_review');
    const requests = await db.requests.getAll();
    // seedRootAdmin 2 + idea PUT 1
    assert.equal(requests.length, 3);
    const parsed = pairJsonOf(requests[2]!.message) as {
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
    assert.equal(created.status, 201);

    const edited = await handleRequest(db, req(
        'PUT', '/ideas/doc-5', tokenB,
        ideaDocument(
            'Second', trio.state, trio.stateAt,
            trio.stateEventId,
        ),
    ));
    assert.equal(edited.status, 201);

    const events = await deriveIdeaStateHistory(db, '1', 'doc-5');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'current');

    const getRes = await handleRequest(
        db, req('GET', '/ideas/doc-5', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

// Task 19: GET streams the stored PUT. Body octets match the
// live PUT response JSON; Date is send-time now; no
// Operation-ID on GET.
test('GET /ideas/:id body octets equal the live PUT '
+ 'stored body', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    try {
        resetClock();
        setClockForTest(
            () => Date.parse('2026-06-01T00:00:00Z'),
        );
        const put = await handleRequest(db, req(
            'PUT', '/ideas/stream-1', token,
            ideaDocument(
                'Streamed', 'active',
                '2026-01-01T00:00:00.000000Z', 'ev-stream-1',
            ),
        ));
        assert.equal(put.status, 201);
        const stored = await messageStore(db).get(
            '/organizations/1/ideas/', 'stream-1',
        );
        assert.ok(stored !== undefined);
        const storedBody = HttpMessage.fromWire(
            stored.message,
        ).body();
        assert.ok(storedBody.exists());
        setClockForTest(
            () => Date.parse('2026-06-01T00:00:02Z'),
        );
        const getRes = await handleRequest(
            db, req('GET', '/ideas/stream-1', token),
        );
        assert.equal(getRes.status, 200);
        assert.equal(
            await getRes.text(), storedBody.toText(),
        );
        assert.ok(getRes.headers.get('Date'));
        assert.notEqual(
            getRes.headers.get('Date'),
            put.headers.get('Date'),
        );
        assert.equal(
            getRes.headers.get('Operation-ID'), null,
        );
    } finally {
        resetClock();
    }
});

test('stored PUT body equals ideaEntityOf of the same chain',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const id = 'idea-g1-stream';
    const at = '2026-01-01T00:00:00.000000Z';
    const ev = 'ev-g1';
    const body = ideaDocument('Streamed', 'active', at, ev);
    const put = await handleRequest(
        db, req('PUT', '/ideas/' + id, token, body),
    );
    assert.equal(put.status, 201);
    const prefix = '/organizations/1/ideas/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = ideaEntityOf(
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
            state: 'active',
            member_id: 'current',
            at,
        },
    );
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await deriveIdea(db, '1', id));
    const skewed = await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument(
            'Skewed', 'in_review',
            '2020-01-01T00:00:00.000000Z', 'ev-g1-skew',
        ),
    ));
    assert.equal(skewed.status, 201);
    const afterSkew = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        afterSkew,
        await deriveIdea(db, '1', id),
    );
    assert.equal(afterSkew.state, 'active');
    assert.equal(afterSkew.state_event_id, ev);
    assert.equal(afterSkew.title, 'Skewed');
});
