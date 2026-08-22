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
import { generateIdentifier } from
    '../shared/identifier.ts';

function messagePairJsonOf(message: string): {
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

// Phase 2 Task 2 (Decision 7 state-in-entity): PUT
// /organizations/:id/ideas/:id
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
    };
}

test('a document PUT with a new state writes wire entity'
+ ' and exactly one event, authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw', token,
        ideaDocument('Fresh', 'active'),
    ));
    assert.equal(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assert.equal(putWire.title, 'Fresh');
    assert.equal(putWire.state, 'active');
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw', token),
    );
    assert.equal(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state?: string;
    };
    assert.equal(getWire.title, 'Fresh');
    assert.equal(getWire.state, 'active');
    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'XufQcWIKhZshfJYOVNeUSw');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'active');
    assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

test('a state-unchanged edit writes no second event',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YHvbnJSZHECuziaHXcsKpw', token,
        ideaDocument('First', 'active'),
    ));
    const edit = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YHvbnJSZHECuziaHXcsKpw', token,
        ideaDocument('Second', 'active'),
    ));
    assert.equal(edit.status, 201);
    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'YHvbnJSZHECuziaHXcsKpw');
    assert.equal(events.length, 1);
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YHvbnJSZHECuziaHXcsKpw', token),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('a byte-identical resend converges: one event,'
+ ' one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Idempotent', 'active');
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body),
    );
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body),
    );
    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'YIuEjXvCwXAgrpyvcvLJjg');
    assert.equal(events.length, 1);
    assert.equal((await db.messagePairs.getAll()).length, 3);
    assert.equal((await db.messagePairs.getAll()).length, 3);
});

test('same-body second PUT on a simple document is 200'
+ ' and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Same Body', 'active');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'tmPPRaXkMetWxTSisIPFLA', token, body),
    );
    assert.equal(first.status, 201);
    const firstEtag = first.headers.get('ETag');
    assert.ok(firstEtag !== null && firstEtag !== '');
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const before = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'tmPPRaXkMetWxTSisIPFLA');
    assert.equal(before.length, 1);
    // Different hoisted header → different request hash,
    // so this is same-body, not replay.
    const second = await handleRequest(
        db,
        new Request('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/tmPPRaXkMetWxTSisIPFLA', {
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
    const after = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'tmPPRaXkMetWxTSisIPFLA');
    assert.equal(after.length, 1);
});

test('the pair request body carries domain state;'
+ ' GET has no trio metadata', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YKtyCizelcaUAaHGwetojA', token,
        ideaDocument('Wired', 'in_review'),
    ));
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YKtyCizelcaUAaHGwetojA', token),
    );
    const wire = await getRes.json() as {
        title: string;
        state?: string;
        state_at?: string;
        state_event_id?: string;
    };
    assert.equal(wire.title, 'Wired');
    assert.equal(wire.state, 'in_review');
    assert.equal('state_at' in wire, false);
    assert.equal('state_event_id' in wire, false);
    const requests = await db.messagePairs.getAll();
    // seedRootAdmin 2 + idea PUT 1
    assert.equal(requests.length, 3);
    const parsed = messagePairJsonOf(requests[2]!.request) as {
        body: { state: string };
    };
    assert.equal(parsed.body.state, 'in_review');
    assert.equal('state_at' in parsed.body, false);
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
    const memberB = generateIdentifier();
    await seedOrganizationMember(db, memberB);
    const tokenA = await organizationToken('XXZruirZyAOoRpNxaDnpSA');
    const tokenB = await organizationToken(memberB);
    const created = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenA,
        ideaDocument('First', 'active'),
    ));
    assert.equal(created.status, 201);

    const edited = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenB,
        ideaDocument('Second', 'active'),
    ));
    assert.equal(edited.status, 201);

    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'YLbPBVpBLImxPQRqLKPKLw');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');

    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

// Task 19: GET streams the stored PUT. Body octets match the
// live PUT response JSON; Date is send-time now; no
// Operation-ID on GET.
test('GET /organizations/:id/ideas/:id body octets equal the live PUT '
+ 'stored body', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    try {
        resetClock();
        setClockForTest(
            () => Date.parse('2026-06-01T00:00:00Z'),
        );
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'uTrFecjHJxcgUGbYxyDPfw', token,
            ideaDocument('Streamed', 'active'),
        ));
        assert.equal(put.status, 201);
        const stored = await messageStore(db).get(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'uTrFecjHJxcgUGbYxyDPfw',
        );
        assert.ok(stored !== undefined);
        const storedBody = HttpMessage.fromWire(
            stored.response,
        ).body();
        assert.ok(storedBody.exists());
        setClockForTest(
            () => Date.parse('2026-06-01T00:00:02Z'),
        );
        const getRes = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'uTrFecjHJxcgUGbYxyDPfw', token),
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
    const id = generateIdentifier();
    const body = ideaDocument('Streamed', 'active');
    const put = await handleRequest(
        db, req('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id
            , token, body),
    );
    assert.equal(put.status, 201);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = ideaEntityOf(
        {
            uriId: id,
            messagePairId: id,
            method: 'PUT',
            body,
        },
        'AjdvjuECVZEgZoFajaIEkg',
        { state: 'active' },
    );
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await deriveIdea(db, 'AjdvjuECVZEgZoFajaIEkg'
        , id));
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id, token,
        ideaDocument('Revised', 'in_review'),
    ));
    assert.equal(later.status, 201);
    const after = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        after,
        await deriveIdea(db, 'AjdvjuECVZEgZoFajaIEkg', id),
    );
    assert.equal(after.state, 'in_review');
    assert.equal(after.title, 'Revised');
    assert.equal('state_at' in after, false);
});
