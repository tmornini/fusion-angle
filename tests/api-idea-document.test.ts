import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    deriveIdea,
    deriveIdeaStateHistory,
    ideaEntityOf,
} from '../api/derive-ideas.ts';
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

Deno.test('a document PUT with a new state writes wire entity'
+ ' and exactly one event, authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw', token,
        ideaDocument('Fresh', 'active'),
    ));
    assertStrictEquals(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assertStrictEquals(putWire.title, 'Fresh');
    assertStrictEquals(putWire.state, 'active');
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw', token),
    );
    assertStrictEquals(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state?: string;
    };
    assertStrictEquals(getWire.title, 'Fresh');
    assertStrictEquals(getWire.state, 'active');
    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'XufQcWIKhZshfJYOVNeUSw');
    assertStrictEquals(events.length, 1);
    assertStrictEquals(events[0]!.state, 'active');
    assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('a state-unchanged edit writes no second event',
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
    assertStrictEquals(edit.status, 201);
    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'YHvbnJSZHECuziaHXcsKpw');
    assertStrictEquals(events.length, 1);
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YHvbnJSZHECuziaHXcsKpw', token),
    );
    const wire = await getRes.json() as { title: string };
    assertStrictEquals(wire.title, 'Second');
});

Deno.test('a byte-identical resend converges: one event,'
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
    assertStrictEquals(events.length, 1);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
    assertStrictEquals((await db.messagePairs.getAll()).length, 3);
});

Deno.test('same-body second PUT on a simple document is 200'
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
    assertStrictEquals(first.status, 201);
    const firstEtag = first.headers.get('ETag');
    assert(firstEtag !== null && firstEtag !== '');
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
    const before = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'tmPPRaXkMetWxTSisIPFLA');
    assertStrictEquals(before.length, 1);
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
    assertStrictEquals(second.status, 200);
    assertStrictEquals(second.headers.get('ETag'), firstEtag);
    const after = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === 'tmPPRaXkMetWxTSisIPFLA');
    assertStrictEquals(after.length, 1);
});

Deno.test('the pair request body carries domain state;'
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
    assertStrictEquals(wire.title, 'Wired');
    assertStrictEquals(wire.state, 'in_review');
    assertStrictEquals('state_at' in wire, false);
    assertStrictEquals('state_event_id' in wire, false);
    const requests = await db.messagePairs.getAll();
    // seedRootAdmin 2 + idea PUT 1
    assertStrictEquals(requests.length, 3);
    const parsed = messagePairJsonOf(requests[2]!.request) as {
        body: { state: string };
    };
    assertStrictEquals(parsed.body.state, 'in_review');
    assertStrictEquals('state_at' in parsed.body, false);
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
Deno.test('a same-state edit by a DIFFERENT member never'
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
    assertStrictEquals(created.status, 201);

    const edited = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenB,
        ideaDocument('Second', 'active'),
    ));
    assertStrictEquals(edited.status, 201);

    const events = await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'YLbPBVpBLImxPQRqLKPKLw');
    assertStrictEquals(events.length, 1);
    assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');

    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assertStrictEquals(wire.title, 'Second');
});

// Task 19: GET streams the stored PUT. Body octets match the
// live PUT response JSON; Date is send-time now; no
// Operation-ID on GET.
Deno.test('GET /organizations/:id/ideas/:id body octets equal the live PUT '
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
        assertStrictEquals(put.status, 201);
        const stored = await messageStore(db).get(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                , 'uTrFecjHJxcgUGbYxyDPfw',
        );
        assert(stored !== undefined);
        const storedBody = HttpMessage.fromWire(
            stored.response,
        ).body();
        assert(storedBody.exists());
        setClockForTest(
            () => Date.parse('2026-06-01T00:00:02Z'),
        );
        const getRes = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'uTrFecjHJxcgUGbYxyDPfw', token),
        );
        assertStrictEquals(getRes.status, 200);
        assertStrictEquals(
            await getRes.text(), storedBody.toText(),
        );
        assert(getRes.headers.get('Date'));
        assertNotStrictEquals(
            getRes.headers.get('Date'),
            put.headers.get('Date'),
        );
        assertStrictEquals(
            getRes.headers.get('Operation-ID'), null,
        );
    } finally {
        resetClock();
    }
});

Deno.test('stored PUT body equals ideaEntityOf of the same chain',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const body = ideaDocument('Streamed', 'active');
    const put = await handleRequest(
        db, req('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id
            , token, body),
    );
    assertStrictEquals(put.status, 201);
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
    assertEquals(stored, expected);
    assertEquals(stored, await deriveIdea(db, 'AjdvjuECVZEgZoFajaIEkg'
        , id));
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id, token,
        ideaDocument('Revised', 'in_review'),
    ));
    assertStrictEquals(later.status, 201);
    const after = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assertEquals(
        after,
        await deriveIdea(db, 'AjdvjuECVZEgZoFajaIEkg', id),
    );
    assertStrictEquals(after.state, 'in_review');
    assertStrictEquals(after.title, 'Revised');
    assertStrictEquals('state_at' in after, false);
});
