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

const IDEA_PREFIX = '/organizations/1/ideas/';
const MEMBERSHIP_PREFIX = '/organizations/1/memberships/';

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
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: stateEventId,
    };
}

function membershipDocument(
    identityId: string,
): Record<string, unknown> {
    return {
        organization_id: '1',
        identity_id: identityId,
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
    const rows = await db.requests.getAllWhere(
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
    const requests = (await db.requests.getAllWhere(
        'uri_collection', prefix,
    )).filter((row) => row.uri_id === uriId);
    const last = requests[requests.length - 1];
    assert.ok(last !== undefined, 'no stored request');
    const stored = await db.responses.getById(last.id);
    assert.ok(stored !== undefined, 'no stored response');
    const model = parseWire(stored.message);
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
        'PUT', '/ideas/ws-1', token,
        ideaDocument('First', 'ev-ws-1'),
    ));
    assert.equal(res.status, 201);
    assert.equal(
        res.headers.get('Operation-ID'),
        TEST_OPERATION_ID,
    );
    const stored = await storedResponseAt(
        db, IDEA_PREFIX, 'ws-1',
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
        db, req('PUT', '/ideas/ws-same', token, body),
    );
    assert.equal(first.status, 201);
    const firstEtag = first.headers.get('ETag');
    assert.ok(firstEtag !== null && firstEtag !== '');
    const before = await pairsAt(
        db, IDEA_PREFIX, 'ws-same',
    );
    assert.equal(before, 1);
    const second = await handleRequest(
        db,
        new Request('http://localhost/ideas/ws-same', {
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
        await pairsAt(db, IDEA_PREFIX, 'ws-same'),
        1,
    );
});

test('exact retry returns the original 201',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Retry', 'ev-ws-retry');
    const first = await handleRequest(
        db, req('PUT', '/ideas/ws-retry', token, body),
    );
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const firstOp = first.headers.get('Operation-ID');
    const firstBytes = await first.text();
    const second = await handleRequest(
        db, req('PUT', '/ideas/ws-retry', token, body),
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
        await pairsAt(db, IDEA_PREFIX, 'ws-retry'),
        1,
    );
});

test('DELETE live is 204 and appends',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const put = await handleRequest(db, req(
        'PUT', '/memberships/ws-del-live', token,
        membershipDocument('ws-del-live'),
    ));
    assert.equal(put.status, 201);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'ws-del-live',
    );
    assert.equal(before, 1);
    const del = await handleRequest(db, req(
        'DELETE', '/memberships/ws-del-live', token,
    ));
    assert.equal(del.status, 204);
    const stored = await storedResponseAt(
        db, MEMBERSHIP_PREFIX, 'ws-del-live',
    );
    assert.equal(stored.method, 'DELETE');
    assert.equal(stored.status, 204);
    assert.equal(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'ws-del-live',
        ),
        2,
    );
});

test('DELETE already-gone is 204 and does not append',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/memberships/ws-del-gone', token,
        membershipDocument('ws-del-gone'),
    ));
    const first = await handleRequest(db, req(
        'DELETE', '/memberships/ws-del-gone', token,
    ));
    assert.equal(first.status, 204);
    const before = await pairsAt(
        db, MEMBERSHIP_PREFIX, 'ws-del-gone',
    );
    assert.equal(before, 2);
    const second = await handleRequest(
        db,
        new Request(
            'http://localhost/memberships/ws-del-gone',
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
            db, MEMBERSHIP_PREFIX, 'ws-del-gone',
        ),
        2,
    );
});

test('DELETE never-written is 404 and stores nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const before = (await db.requests.getAll()).length;
    const res = await handleRequest(db, req(
        'DELETE', '/memberships/ws-never', token,
    ));
    assert.equal(res.status, 404);
    assert.equal(
        (await db.requests.getAll()).length, before,
    );
    assert.equal(
        await pairsAt(
            db, MEMBERSHIP_PREFIX, 'ws-never',
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
        new Request('http://localhost/ideas/ws-empty', {
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
        db, IDEA_PREFIX, 'ws-empty',
    );
    assert.equal(stored.method, 'PUT');
    assert.equal(stored.status, 200);
    const live = await messageStore(db).get(
        IDEA_PREFIX, 'ws-empty',
    );
    assert.ok(live !== undefined, 'empty PUT must live');
    assert.equal(live.version, emptyTag.slice(1, -1));
});
