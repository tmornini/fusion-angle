import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function flowFields(name: string) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function emptyDelta() {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function createBody(
    flowId: string,
    projectFlowId: string,
    eventId: string,
) {
    return {
        id: flowId,
        flow: flowFields('Fresh Flow'),
        projectFlowId,
        projectFlow: {
            project_id: 'proj-1',
            flow_id: flowId,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
        graphDelta: emptyDelta(),
    };
}

function putBody(name: string, eventId: string) {
    return {
        flow: flowFields(name),
        eventId,
        at: AT,
        history: { kind: 'none' },
        graphDelta: emptyDelta(),
    };
}

function versionBody(flowId: string) {
    return {
        flow_id: flowId,
        name: 'Fresh Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: '{"nodes":[],"edges":[]}',
        at: AT,
    };
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/flows', token,
        createBody(flowId, flowId + '-pf', flowId + '-ev'),
    ));
}

test('a flow create appends its pair at the entity address',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createFlow(db, token, 'flow-1');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0]!.uri_prefix,
        '/organizations/1/flows/',
    );
    assert.equal(requests[0]!.uri_id, 'flow-1');
});

test('a failed flow create appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await db.states.put('ev-x', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/flows', token,
        createBody('flow-doomed', 'pf-doomed', 'ev-x'),
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 0);
    assert.equal((await db.responses.getAll()).length, 0);
});

test('a PUT save supersedes the flow create at the SAME'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await createFlow(db, token, 'flow-2');
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const saved = await handleRequest(db, req(
        'PUT', '/flows/flow-2', token,
        putBody('Renamed Flow', 'flow-2-save-ev'),
    ));
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('Supersedes'), createdId);
});

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-3');
    const saved = await handleRequest(db, req(
        'PUT', '/flows/flow-3', token,
        putBody('Wired Flow', 'flow-3-save-ev'),
    ));
    assert.equal(saved.status, 200);
    const flowRow = await db.flows.getById('flow-3');
    assert.deepEqual(await saved.json(), flowRow);
});

test('undo/redo/versions-publish are operation-addressed:'
+ ' uriId stays empty, never chains', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-4');

    const published = await handleRequest(db, req(
        'POST', '/flows/flow-4/versions', token, {
            id: 'v-1',
            version: versionBody('flow-4'),
            trimIds: [],
        },
    ));
    assert.equal(published.status, 204);
    const publishRow = (await db.requests.getAll())
        .find(r => r.uri_prefix
            === '/organizations/1/flows/flow-4/versions/');
    assert.ok(publishRow);
    assert.equal(publishRow!.uri_id, '');

    const undone = await handleRequest(db, req(
        'POST', '/flows/flow-4/undo', token, {
            flow: flowFields('Fresh Flow'),
            eventId: 'flow-4-undo-ev',
            at: AT,
            consumedVersionId: 'v-1',
            graphDelta: emptyDelta(),
            revivals: [],
        },
    ));
    assert.equal(undone.status, 204);
    const undoRow = (await db.requests.getAll())
        .find(r => r.uri_prefix
            === '/organizations/1/flows/flow-4/undo/');
    assert.ok(undoRow);
    assert.equal(undoRow!.uri_id, '');

    const redone = await handleRequest(db, req(
        'POST', '/flows/flow-4/redo', token, {
            version: {
                id: 'v-2',
                version: versionBody('flow-4'),
                trimIds: [],
            },
            flow: flowFields('Fresh Flow'),
            eventId: 'flow-4-redo-ev',
            at: AT,
            graphDelta: emptyDelta(),
            revivals: [],
        },
    ));
    assert.equal(redone.status, 204);
    const redoRow = (await db.requests.getAll())
        .find(r => r.uri_prefix
            === '/organizations/1/flows/flow-4/redo/');
    assert.ok(redoRow);
    assert.equal(redoRow!.uri_id, '');
});

test('a byte-identical PUT resend returns the stored'
+ ' response and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-5');
    const body = putBody('Idempotent Flow', 'flow-5-save-ev');
    const first = await handleRequest(
        db, req('PUT', '/flows/flow-5', token, body),
    );
    const firstId = first.headers.get('Response-ID');
    const countAfterFirst = (await db.requests.getAll())
        .length;
    const second = await handleRequest(
        db, req('PUT', '/flows/flow-5', token, body),
    );
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal(
        (await db.requests.getAll()).length,
        countAfterFirst,
    );
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-6');
    await handleRequest(db, req(
        'PUT', '/flows/flow-6', token,
        putBody('Verify Flow', 'flow-6-save-ev'),
    ));
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-7');
    await handleRequest(db, req(
        'PUT', '/flows/flow-7', token,
        putBody('Mixed Flow', 'flow-7-save-ev'),
    ));
    await handleRequest(db, req(
        'POST', '/flows/flow-7/versions', token, {
            id: 'flow-7-v1',
            version: versionBody('flow-7'),
            trimIds: [],
        },
    ));
    await db.states.put('ev-conflict', {
        entity_id: 'other',
        state: 'active',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/flows', token,
        createBody('flow-fail', 'pf-fail', 'ev-conflict'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
