import { assert, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import { messageStore } from '../api/message-store.ts';
import { strongEtagOf } from '../api/message-pair.ts';
import { isIdentifier } from '../shared/identifier.ts';

const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const MEMBERSHIP_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/';

function ideaDocument(
    title: string,
    _stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

function membershipDocument(
    _identityId: string,
): Record<string, unknown> {
    return {
        type: 'member',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function pairsAt(
    db: MemoryDbAdapter,
    prefix: string,
    uriId: string,
): Promise<number> {
    const rows = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    return rows.filter((row) => row.uri_id === uriId)
        .length;
}

async function storedResponseAt(
    db: MemoryDbAdapter,
    prefix: string,
    uriId: string,
): Promise<{
    readonly requestId: string;
    readonly method: string;
    readonly status: number;
    readonly hasOperationId: boolean;
}> {
    const requests = (await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === uriId);
    const last = requests[requests.length - 1];
    assert(last !== undefined, 'no stored request');
    const stored = await db.messagePairs.getById(last.id);
    assert(stored !== undefined, 'no stored response');
    const model = parseWire(stored.response);
    assertStrictEquals(model.startLine.kind, 'response');
    return {
        requestId: last.id,
        method: last.method,
        status: model.startLine.status,
        hasOperationId: model.fields.some(
            (field) => field.name === 'operation-id',
        ),
    };
}

Deno.test('first PUT is 201 and stores a 200 start-line',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yNqCXXgKLCqDESGScIzYrQ', token,
        ideaDocument('First', 'ev-ws-1'),
    ));
    assertStrictEquals(res.status, 201);
    assertStrictEquals(
        res.headers.get('Operation-ID'),
        TEST_OPERATION_ID,
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yNqCXXgKLCqDESGScIzYrQ',
    );
    assertStrictEquals(stored.method, 'PUT');
    assertStrictEquals(stored.status, 200);
    assertStrictEquals(stored.hasOperationId, false);
});

Deno.test('document GET detail ETag equals Response-ID',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'yGetEtagEqRespIdXXXXXw';
    const put = await handleRequest(
        db, req('PUT', path, token, ideaDocument(
            'GetEtag', 'ev-ws-get-etag',
        )),
    );
    assertStrictEquals(put.status, 201);
    const putId = put.headers.get('Response-ID');
    assert(putId !== null && isIdentifier(putId));
    assertStrictEquals(put.headers.get('ETag'), strongEtagOf(putId));
    const got = await handleRequest(
        db, req('GET', path, token),
    );
    assertStrictEquals(got.status, 200);
    const getId = got.headers.get('Response-ID');
    assert(getId !== null && isIdentifier(getId));
    assertStrictEquals(got.headers.get('ETag'), strongEtagOf(getId));
    assertStrictEquals(getId, putId);
});

Deno.test('same-body PUT is 200 and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Same', 'ev-ws-same');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yjsYYXruOryrZjnfLsgSJg', token, body),
    );
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    assert(firstId !== null && isIdentifier(firstId));
    const firstEtag = first.headers.get('ETag');
    assertStrictEquals(firstEtag, strongEtagOf(firstId));
    const before = await pairsAt(
        db, IDEA_PREFIX, 'yjsYYXruOryrZjnfLsgSJg',
    );
    assertStrictEquals(before, 1);
    const second = await handleRequest(
        db,
        new Request('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/yjsYYXruOryrZjnfLsgSJg', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
                'Idempotency-Key': 'k-ws-same',
                'operation-id': TEST_OPERATION_ID,
            },
            body: JSON.stringify(body),
        }),
    );
    assertStrictEquals(second.status, 200);
    assertStrictEquals(second.headers.get('ETag'), firstEtag);
    assertStrictEquals(
        await pairsAt(db, IDEA_PREFIX, 'yjsYYXruOryrZjnfLsgSJg'),
        1,
    );
});

Deno.test('exact retry returns the original 201',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Retry', 'ev-ws-retry');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body),
    );
    assertStrictEquals(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const firstOp = first.headers.get('Operation-ID');
    const firstBytes = await first.text();
    const second = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body),
    );
    assertStrictEquals(second.status, 201);
    assertStrictEquals(
        second.headers.get('Operation-ID'), firstOp,
    );
    assertStrictEquals(
        second.headers.get('Response-ID'), firstId,
    );
    assertStrictEquals(await second.text(), firstBytes);
    assertStrictEquals(
        await pairsAt(db, IDEA_PREFIX, 'yggAqfvrChBmrMfrOilSUg'),
        1,
    );
});

Deno.test('DELETE live is 204 and appends',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yTCVdPetYIGKpMKGzQJxPQ',
        token,
        membershipDocument('yTCVdPetYIGKpMKGzQJxPQ'),
    ));
    assertStrictEquals(put.status, 201);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
    );
    assertStrictEquals(before, 1);
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yTCVdPetYIGKpMKGzQJxPQ',
        token,
    ));
    assertStrictEquals(del.status, 204);
    const stored = await storedResponseAt(
        db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
    );
    assertStrictEquals(stored.method, 'DELETE');
    assertStrictEquals(stored.status, 204);
    assertStrictEquals(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
        ),
        2,
    );
});

Deno.test('DELETE already-gone is 204 and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yPsWmFGqnMtjifSSmvZrUw',
        token,
        membershipDocument('yPsWmFGqnMtjifSSmvZrUw'),
    ));
    const first = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yPsWmFGqnMtjifSSmvZrUw',
        token,
    ));
    assertStrictEquals(first.status, 204);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'yPsWmFGqnMtjifSSmvZrUw',
    );
    assertStrictEquals(before, 2);
    const second = await handleRequest(
        db,
        new Request(
            'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yPsWmFGqnMtjifSSmvZrUw',
            {
                method: 'DELETE',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Idempotency-Key': 'k-ws-del-gone',
                    'operation-id': TEST_OPERATION_ID,
                },
            },
        ),
    );
    assertStrictEquals(second.status, 204);
    assertStrictEquals(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yPsWmFGqnMtjifSSmvZrUw',
        ),
        2,
    );
});

Deno.test('DELETE never-written is 404 and stores nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, req(
        'DELETE', '/memberships/yatHlUsoiwxMlkqjKvCVGQ', token,
    ));
    assertStrictEquals(res.status, 404);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    assertStrictEquals(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yatHlUsoiwxMlkqjKvCVGQ',
        ),
        0,
    );
});

Deno.test('empty-body PUT is a live document, not a delete',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db,
        new Request('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/yXVKeCiguypnNcNelXVldQ', {
            method: 'PUT',
            headers: {
                Authorization: 'Bearer ' + token,
                'operation-id': TEST_OPERATION_ID,
            },
        }),
    );
    assertStrictEquals(res.status, 201);
    const responseId = res.headers.get('Response-ID');
    assert(
        responseId !== null && isIdentifier(responseId),
    );
    assertStrictEquals(
        res.headers.get('ETag'),
        strongEtagOf(responseId),
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assertStrictEquals(stored.method, 'PUT');
    assertStrictEquals(stored.status, 200);
    const live = await messageStore(db).get(
        IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assert(live !== undefined, 'empty PUT must live');
});
