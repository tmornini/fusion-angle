import { test } from 'node:test';
import assert from 'node:assert/strict';
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
import { sha256HexOfBytes } from '../shared/digest.ts';
import { messageStore } from '../api/message-store.ts';
import { strongEtagOf } from '../api/message-pair.ts';

const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const MEMBERSHIP_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/';

function ideaDocument(
    title: string,
    stateEventId: string,
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
        headers,
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
    const rows = await db.pairs.getAllWhere(
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
    const requests = (await db.pairs.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === uriId);
    const last = requests[requests.length - 1];
    assert.ok(last !== undefined, 'no stored request');
    const stored = await db.pairs.getById(last.id);
    assert.ok(stored !== undefined, 'no stored response');
    const model = parseWire(stored.response);
    assert.equal(model.startLine.kind, 'response');
    return {
        requestId: last.id,
        method: last.method,
        status: model.startLine.status,
        hasOperationId: model.fields.some(
            (field) => field.name === 'operation-id',
        ),
    };
}

test('first PUT is 201 and stores a 200 start-line',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yNqCXXgKLCqDESGScIzYrQ', token,
        ideaDocument('First', 'ev-ws-1'),
    ));
    assert.equal(res.status, 201);
    assert.equal(
        res.headers.get('Operation-ID'),
        TEST_OPERATION_ID,
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yNqCXXgKLCqDESGScIzYrQ',
    );
    assert.equal(stored.method, 'PUT');
    assert.equal(stored.status, 200);
    assert.equal(stored.hasOperationId, false);
});

test('same-body PUT is 200 and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Same', 'ev-ws-same');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yjsYYXruOryrZjnfLsgSJg', token, body),
    );
    assert.equal(first.status, 201);
    const firstEtag = first.headers.get('ETag');
    assert.ok(firstEtag !== null && firstEtag !== '');
    const before = await pairsAt(
        db, IDEA_PREFIX, 'yjsYYXruOryrZjnfLsgSJg',
    );
    assert.equal(before, 1);
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
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('ETag'), firstEtag);
    assert.equal(
        await pairsAt(db, IDEA_PREFIX, 'yjsYYXruOryrZjnfLsgSJg'),
        1,
    );
});

test('exact retry returns the original 201',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Retry', 'ev-ws-retry');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body),
    );
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const firstOp = first.headers.get('Operation-ID');
    const firstBytes = await first.text();
    const second = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body),
    );
    assert.equal(second.status, 201);
    assert.equal(
        second.headers.get('Operation-ID'), firstOp,
    );
    assert.equal(
        second.headers.get('Response-ID'), firstId,
    );
    assert.equal(await second.text(), firstBytes);
    assert.equal(
        await pairsAt(db, IDEA_PREFIX, 'yggAqfvrChBmrMfrOilSUg'),
        1,
    );
});

test('DELETE live is 204 and appends',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yTCVdPetYIGKpMKGzQJxPQ',
        token,
        membershipDocument('yTCVdPetYIGKpMKGzQJxPQ'),
    ));
    assert.equal(put.status, 201);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
    );
    assert.equal(before, 1);
    const del = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yTCVdPetYIGKpMKGzQJxPQ',
        token,
    ));
    assert.equal(del.status, 204);
    const stored = await storedResponseAt(
        db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
    );
    assert.equal(stored.method, 'DELETE');
    assert.equal(stored.status, 204);
    assert.equal(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yTCVdPetYIGKpMKGzQJxPQ',
        ),
        2,
    );
});

test('DELETE already-gone is 204 and does not append',
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
    assert.equal(first.status, 204);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'yPsWmFGqnMtjifSSmvZrUw',
    );
    assert.equal(before, 2);
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
    assert.equal(second.status, 204);
    assert.equal(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yPsWmFGqnMtjifSSmvZrUw',
        ),
        2,
    );
});

test('DELETE never-written is 404 and stores nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const before = (await db.pairs.getAll()).length;
    const res = await handleRequest(db, req(
        'DELETE', '/memberships/yatHlUsoiwxMlkqjKvCVGQ', token,
    ));
    assert.equal(res.status, 404);
    assert.equal(
        (await db.pairs.getAll()).length, before,
    );
    assert.equal(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'yatHlUsoiwxMlkqjKvCVGQ',
        ),
        0,
    );
});

test('empty-body PUT is a live document, not a delete',
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
    assert.equal(res.status, 201);
    const emptyTag = strongEtagOf(
        await sha256HexOfBytes(new Uint8Array(0)),
    );
    assert.equal(res.headers.get('ETag'), emptyTag);
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assert.equal(stored.method, 'PUT');
    assert.equal(stored.status, 200);
    const live = await messageStore(db).get(
        IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assert.ok(live !== undefined, 'empty PUT must live');
    assert.equal(live.version, emptyTag.slice(1, -1));
});
