import {
    assert, assertEquals, assertStrictEquals,
} from '@std/assert';
import { projectEntityOf } from '../api/derive-projects.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    partsOf,
    storedPutBodyText,
} from './http-fixtures.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
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

// Phase 3 Task 2 (Decision 7 state-in-entity): PUT
// /organizations/:id/projects/:id takes the FULL document — entity fields
// plus
// the state. G1: stored PUT body is projectEntityOf of
// the same chain. GET streams that body.

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function versionsOf(
    db: MemoryDbAdapter, token: string,
    family: string, id: string,
): Promise<{ state: string; member_id: string }[]> {
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/' + family
            + '/' + id + '/versions/',
        token,
    ));
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<{ state: string }>(res);
    return parts.map((part) => ({
        state: part.body().toValue().state,
        member_id: part.query(
            'header.requester-identity-id',
        ).toText(),
    }));
}

async function getWire(
    db: MemoryDbAdapter, token: string,
    family: string, id: string,
): Promise<Record<string, unknown>> {
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/' + family
            + '/' + id,
        token,
    ));
    assertStrictEquals(res.status, 200);
    return await res.json() as Record<string, unknown>;
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

Deno.test('a document PUT with a new state writes wire entity'
+ ' and one version, authored by the actor', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'XufQcWIKhZshfJYOVNeUSw', token,
        projectDocument('Fresh', 'submitted'),
    ));
    assertStrictEquals(res.status, 201);
    const putWire = await res.json() as Record<string, unknown>;
    assertStrictEquals(putWire.title, 'Fresh');
    assertStrictEquals(putWire.state, 'submitted');
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'XufQcWIKhZshfJYOVNeUSw', token),
    );
    assertStrictEquals(getRes.status, 200);
    const getWire = await getRes.json() as {
        title: string;
        state: string;
        state_at: string;
        state_event_id: string;
    };
    assertStrictEquals(getWire.title, 'Fresh');
    assertStrictEquals(getWire.state, 'submitted');
    const versions = await versionsOf(
        db, token, 'projects', 'XufQcWIKhZshfJYOVNeUSw',
    );
    assertStrictEquals(versions.length, 1);
    assertStrictEquals(versions[0]!.state, 'submitted');
    assertStrictEquals(
        versions[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA',
    );
});

Deno.test('a state-unchanged edit succeeds and the wire reflects'
+ ' the edit', async () => {
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
    assertStrictEquals(edit.status, 200);
    const getRes = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YHvbnJSZHECuziaHXcsKpw', token),
    );
    const wire = await getRes.json() as { title: string };
    assertStrictEquals(wire.title, 'Second');
});

Deno.test('a byte-identical resend converges: one pair',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = projectDocument('Idempotent', 'submitted');
    const operationId = generateIdentifier();
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body,
            operationId),
    );
    await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'YIuEjXvCwXAgrpyvcvLJjg', token, body,
            operationId),
    );
    assertStrictEquals((await db.messagePairs.getAll()).length, 4);
    assertStrictEquals((await db.messagePairs.getAll()).length, 4);
});

Deno.test('the pair request body carries domain state;'
+ ' GET carries no event fields', async () => {
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
    assertStrictEquals(wire.title, 'Wired');
    assertStrictEquals(wire.state, 'under_review');
    assertStrictEquals('state_at' in wire, false);
    const requests = await db.messagePairs.getAll();
    // nil root + seedRootAdmin 2 + project PUT 1
    assertStrictEquals(requests.length, 4);
    const project = requests.find(
        (row) => row.name === 'YKtyCizelcaUAaHGwetojA',
    );
    assert(project);
    const parsed = messagePairJsonOf(project.request) as {
        body: { state: string };
    };
    assertStrictEquals(parsed.body.state, 'under_review');
    assertStrictEquals('state_at' in parsed.body, false);
});

Deno.test('stored PUT body equals projectEntityOf of the same'
+ ' chain', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const body = projectDocument('Streamed', 'submitted');
    const put = await handleRequest(
        db, req('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + id, token, body),
    );
    assertStrictEquals(put.status, 201);
    const prefix = '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    const expected = projectEntityOf(
        {
            name: id,
            messagePairId: id,
            method: 'PUT',
            body,
        },
        'AjdvjuECVZEgZoFajaIEkg',
    );
    assertEquals(stored, expected);
    assertEquals(
        stored, await getWire(db, token, 'projects', id),
    );
    const later = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id, token,
        projectDocument('Revised', 'under_review'),
    ));
    assertStrictEquals(later.status, 200);
    const after = JSON.parse(
        await storedPutBodyText(db, prefix, id),
    );
    assertEquals(
        after,
        await getWire(db, token, 'projects', id),
    );
    assertStrictEquals(after.state, 'under_review');
    assertStrictEquals(after.title, 'Revised');
    assertStrictEquals('state_at' in after, false);
});
