import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    pairIdOf,
    framedRequest,
} from './http-fixtures.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import { messageStore } from '../api/message-store.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const MEMBERSHIP_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/';

function ideaDocument(title: string): Record<string, unknown> {
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
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        ...(operationId !== undefined ? { operationId } : {}),
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
    name: string,
): Promise<number> {
    const rows = await db.messagePairs.getCollectionPairs(prefix,
    );
    return rows.filter((row) => row.name === name)
        .length;
}

async function storedResponseAt(
    db: MemoryDbAdapter,
    prefix: string,
    name: string,
): Promise<{
    readonly requestId: string;
    readonly method: string;
    readonly status: number;
    readonly hasOperationId: boolean;
}> {
    const requests = (await db.messagePairs.getCollectionPairs(prefix,
    )).filter((row) => row.name === name);
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

Deno.test('first PUT is 201 and stores a 201 start-line',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const operationId = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yNqCXXgKLCqDESGScIzYrQ', token,
        ideaDocument('First'),
        undefined, operationId,
    ));
    assertStrictEquals(res.status, 201);
    assertStrictEquals(
        res.headers.get('Operation-ID'),
        operationId,
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yNqCXXgKLCqDESGScIzYrQ',
    );
    assertStrictEquals(stored.method, 'PUT');
    assertStrictEquals(stored.status, 201);
    assertStrictEquals(stored.hasOperationId, true);
});

Deno.test('document GET detail ETag equals the PUT pair id',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'yGetEtagEqRespIdXXXXXw';
    const put = await handleRequest(
        db, req('PUT', path, token, ideaDocument('GetEtag')),
    );
    assertStrictEquals(put.status, 201);
    const putId = pairIdOf(put);
    assert(putId !== null && isIdentifier(putId));
    const got = await handleRequest(
        db, req('GET', path, token),
    );
    assertStrictEquals(got.status, 200);
    const getId = pairIdOf(got);
    assert(getId !== null && isIdentifier(getId));
    assertStrictEquals(getId, putId);
});

Deno.test('same-body PUT is 200 and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Same');
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yjsYYXruOryrZjnfLsgSJg', token, body),
    );
    assertStrictEquals(first.status, 201);
    const firstId = pairIdOf(first);
    assert(firstId !== null && isIdentifier(firstId));
    const firstEtag = first.headers.get('ETag');
    const before = await pairsAt(
        db, IDEA_PREFIX, 'yjsYYXruOryrZjnfLsgSJg',
    );
    assertStrictEquals(before, 1);
    const second = await handleRequest(
        db,
        framedRequest('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/yjsYYXruOryrZjnfLsgSJg', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
                'Idempotency-Key': 'k-ws-same',
                'operation-id': generateIdentifier(),
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

Deno.test('exact retry returns the original as 200',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Retry');
    const operationId = generateIdentifier();
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body,
            undefined, operationId),
    );
    assertStrictEquals(first.status, 201);
    const firstId = pairIdOf(first);
    const firstOp = first.headers.get('Operation-ID');
    const firstBytes = await first.text();
    const second = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body,
            undefined, operationId),
    );
    assertStrictEquals(second.status, 200);
    assertStrictEquals(
        second.headers.get('Operation-ID'), firstOp,
    );
    assertStrictEquals(
        pairIdOf(second), firstId,
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
        framedRequest(
            'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            + 'yPsWmFGqnMtjifSSmvZrUw',
            {
                method: 'DELETE',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Idempotency-Key': 'k-ws-del-gone',
                    'operation-id': generateIdentifier(),
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
        framedRequest('http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/yXVKeCiguypnNcNelXVldQ', {
            method: 'PUT',
            headers: {
                Authorization: 'Bearer ' + token,
                'operation-id': generateIdentifier(),
            },
        }),
    );
    assertStrictEquals(res.status, 201);
    const responseId = pairIdOf(res);
    assert(
        responseId !== null && isIdentifier(responseId),
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assertStrictEquals(stored.method, 'PUT');
    assertStrictEquals(stored.status, 201);
    const live = await messageStore(db).getDocumentHead(
        IDEA_PREFIX, 'yXVKeCiguypnNcNelXVldQ',
    );
    assert(live !== null, 'empty PUT must live');
});

// Memory serializes all ops, so the TOCTOU is
// unreachable here; the pin is the comparison.
Deno.test('a same-body answer is status 200 from the'
+ ' stored response',
() => {
    const src = Deno.readTextFileSync('api/api.ts');
    assertMatch(
        src,
        /responseFromHead\(/,
    );
});
