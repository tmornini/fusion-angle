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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
// /organizations/:id/projects/:id takes the FULL document — entity fields
// plus
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
    };
}

test('a document PUT with a new state writes wire entity'
+ ' and exactly one event, authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'XufQcWIKhZshfJYOVNeUSw', token,
        projectDocument('Fresh', 'submitted'),
    ));
    assert.equal(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assert.equal(putWire.title, 'Fresh');
    assert.equal(putWire.state, 'submitted');
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'XufQcWIKhZshfJYOVNeUSw', token),
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
    const events = await deriveProjectStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'XufQcWIKhZshfJYOVNeUSw');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.state, 'submitted');
    assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
});

test('a state-unchanged edit writes no second event',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YHvbnJSZHECuziaHXcsKpw', token,
        projectDocument('First', 'submitted'),
    ));
    const edit = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YHvbnJSZHECuziaHXcsKpw', token,
        projectDocument('Second', 'submitted'),
    ));
    assert.equal(edit.status, 201);
    const events = await deriveProjectStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'YHvbnJSZHECuziaHXcsKpw');
    assert.equal(events.length, 1);
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YHvbnJSZHECuziaHXcsKpw', token),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('a byte-identical resend converges: one event,'
+ ' one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = projectDocument('Idempotent', 'submitted');
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body),
    );
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body),
    );
    const events = await deriveProjectStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'YIuEjXvCwXAgrpyvcvLJjg');
    assert.equal(events.length, 1);
    assert.equal((await db.pairs.getAll()).length, 3);
    assert.equal((await db.pairs.getAll()).length, 3);
});

test('the pair request body carries domain state;'
+ ' GET has no trio metadata', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YKtyCizelcaUAaHGwetojA', token,
        projectDocument('Wired', 'under_review'),
    ));
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YKtyCizelcaUAaHGwetojA', token),
    );
    const wire = await getRes.json() as {
        title: string;
        state?: string;
    };
    assert.equal(wire.title, 'Wired');
    assert.equal(wire.state, 'under_review');
    assert.equal('state_at' in wire, false);
    const requests = await db.pairs.getAll();
    // seedRootAdmin 2 + project PUT 1
    assert.equal(requests.length, 3);
    const parsed = pairJsonOf(requests[2]!.request) as {
        body: { state: string };
    };
    assert.equal(parsed.body.state, 'under_review');
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
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenA,
        projectDocument('First', 'submitted'),
    ));
    assert.equal(created.status, 201);

    const edited = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenB,
        projectDocument('Second', 'submitted'),
    ));
    assert.equal(edited.status, 201);

    const events = await deriveProjectStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg', 'YLbPBVpBLImxPQRqLKPKLw');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');

    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YLbPBVpBLImxPQRqLKPKLw', tokenA),
    );
    const wire = await getRes.json() as { title: string };
    assert.equal(wire.title, 'Second');
});

test('stored PUT body equals projectEntityOf of the same'
+ ' chain', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const body = projectDocument('Streamed', 'submitted');
    const put = await handleRequest(
        db, req('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + id, token, body),
    );
    assert.equal(put.status, 201);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/';
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
        'AjdvjuECVZEgZoFajaIEkg',
        { state: 'submitted' },
    );
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored, await deriveProject(db, 'AjdvjuECVZEgZoFajaIEkg', id),
    );
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id, token,
        projectDocument('Revised', 'under_review'),
    ));
    assert.equal(later.status, 201);
    const after = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assert.deepEqual(
        after,
        await deriveProject(db, 'AjdvjuECVZEgZoFajaIEkg', id),
    );
    assert.equal(after.state, 'under_review');
    assert.equal(after.title, 'Revised');
    assert.equal('state_at' in after, false);
});
