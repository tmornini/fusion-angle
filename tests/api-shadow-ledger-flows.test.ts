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
    headers?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(headers ?? {}),
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

// PUT /flows/:id now takes the FULL document (Decision 7,
// LOCKED class — Task 3): the entity fields plus the state
// trio, the client-authored graph snapshot, and the two
// transitional decomposition sidecars.
function putBody(name: string, eventId: string) {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: eventId,
        graph: '{"nodes":[],"edges":[]}',
        graphDelta: emptyDelta(),
        revivals: [],
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

// Task 5: create's own operation pair (204, no body) is no
// longer the address's head — its synthesized document pair
// (appended after, so strictly later) is. A save must echo THIS
// id, read fresh via GET, exactly as the real client
// (buildFlowPutBody's ctx.GETWithResponseId) does.
async function headResponseId(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /flows/' + flowId);
    return id!;
}

test('a flow create appends its pair at the entity address',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createFlow(db, token, 'flow-1');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    // Task 5: three pairs — the operation pair (this address),
    // its synthesized document pair (same address), and its
    // synthesized join pair (the project_flows address).
    assert.equal(requests.length, 3);
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

// flows/:id is the locked class (Task 3): a save on an
// existing flow carries the CURRENT head's Response-ID as its
// If-Response-ID echo and the stored response carries Follows
// — the locked sibling of Supersedes, never both. Task 5: the
// head is create's OWN synthesized document pair, never the
// create response's own (204, operation-pair) Response-ID — so
// the echo is read fresh via GET, exactly as the real client
// does.
test('a PUT save follows the flow create at the SAME'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-2');
    const headId = await headResponseId(db, token, 'flow-2');
    const saved = await handleRequest(db, req(
        'PUT', '/flows/flow-2', token,
        putBody('Renamed Flow', 'flow-2-save-ev'),
        { 'if-response-id': headId },
    ));
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('Follows'), headId);
});

test('each 200 route\'s wire body matches a direct domain '
+ 'read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-3');
    const headId = await headResponseId(db, token, 'flow-3');
    const saved = await handleRequest(db, req(
        'PUT', '/flows/flow-3', token,
        putBody('Wired Flow', 'flow-3-save-ev'),
        { 'if-response-id': headId },
    ));
    assert.equal(saved.status, 200);
    const flowRow = await db.flows.getById('flow-3');
    assert.deepEqual(await saved.json(), flowRow);
});

test('undo/versions-publish are operation-addressed:'
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
            graph: '{"nodes":[],"edges":[]}',
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
});

// Task 4 (R1/E5): POST /flows/:id/redo left the URI tree — the
// covenant this test pinned for redo (an operation-addressed
// pair, uriId empty, never chaining) no longer describes what
// redo does. Redo now composes the SAME two writes performRedo
// (the client) drives: a versions POST (operation-addressed,
// uriId empty, exactly like publish above) followed by a
// document PUT AT THE FLOW'S OWN ADDRESS (entity-addressed,
// uriId is the flow id, chaining via Follows) — never a single
// combined pair at a /redo segment, because that segment no
// longer exists.
test('redo produces a versions operation pair plus a'
+ ' document pair at the flow\'s address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-9');
    const headId = await headResponseId(db, token, 'flow-9');

    const published = await handleRequest(db, req(
        'POST', '/flows/flow-9/versions', token, {
            id: 'v-9',
            version: versionBody('flow-9'),
            trimIds: [],
        },
    ));
    assert.equal(published.status, 204);
    const versionRows = (await db.requests.getAll())
        .filter(r => r.uri_prefix
            === '/organizations/1/flows/flow-9/versions/');
    assert.equal(versionRows.length, 1);
    assert.equal(versionRows[0]!.uri_id, '');

    const redone = await handleRequest(db, req(
        'PUT', '/flows/flow-9', token,
        putBody('Redone Flow', 'flow-9-redo-ev'),
        { 'if-response-id': headId },
    ));
    assert.equal(redone.status, 200);
    // Entity-addressed at the flow's OWN address (never a
    // /redo segment) and chains from the create's document pair
    // via Follows, exactly like any other save to an existing
    // flow.
    assert.equal(redone.headers.get('Follows'), headId);
    const documentRows = (await db.requests.getAll())
        .filter(r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-9');
    // Task 5: the create's OWN operation pair, its synthesized
    // document pair, plus this redo save's pair.
    assert.equal(documentRows.length, 3);
});

test('PUT flows/:id/versions/:vid appends its pair at the'
+ ' version address, and a second PUT supersedes it',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-8');
    const first = await handleRequest(db, req(
        'PUT', '/flows/flow-8/versions/v-8', token,
        versionBody('flow-8'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/organizations/1/flows/flow-8/versions/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'v-8');
    const domainRow = await db.flowVersions.getById('v-8');
    assert.deepEqual(await first.json(), domainRow);
    // A distinct body forces a genuinely different request
    // message — a byte-identical resend would hit the
    // idempotency fast path instead of writing again.
    const second = await handleRequest(db, req(
        'PUT', '/flows/flow-8/versions/v-8', token,
        { ...versionBody('flow-8'), name: 'Renamed Version' },
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('DELETE flows/:id/versions/:vid appends its tombstone'
+ ' pair, superseding the PUT, and the row is physically'
+ ' spliced', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-9');
    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-9/versions/v-9', token,
        versionBody('flow-9'),
    ));
    const putId = put.headers.get('Response-ID');
    assert.ok(putId);
    const del = await handleRequest(db, req(
        'DELETE', '/flows/flow-9/versions/v-9', token,
    ));
    assert.equal(del.status, 204);
    assert.equal(del.headers.get('Supersedes'), putId);
    await assert.rejects(
        () => db.flowVersions.getById('v-9'),
    );
});

test('a PUT/DELETE on a flow version verifies against its'
+ ' hash and keeps request/response counts balanced',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-10');
    await handleRequest(db, req(
        'PUT', '/flows/flow-10/versions/v-10', token,
        versionBody('flow-10'),
    ));
    await handleRequest(db, req(
        'DELETE', '/flows/flow-10/versions/v-10', token,
    ));
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    for (const row of requests) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of responses) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    assert.equal(requests.length, responses.length);
});

test('a byte-identical PUT resend returns the stored'
+ ' response and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-5');
    const headId = await headResponseId(db, token, 'flow-5');
    const body = putBody('Idempotent Flow', 'flow-5-save-ev');
    const headers = { 'if-response-id': headId };
    const first = await handleRequest(
        db, req('PUT', '/flows/flow-5', token, body, headers),
    );
    const firstId = first.headers.get('Response-ID');
    const countAfterFirst = (await db.requests.getAll())
        .length;
    // ORDERING IS LOAD-BEARING: the resend's echo is now stale
    // against the NEW head (firstId), yet the pre-tx fast path
    // matches this SAME message's hash before the locked
    // four-outcome table ever runs, so it replays instead of
    // 412ing.
    const second = await handleRequest(
        db, req('PUT', '/flows/flow-5', token, body, headers),
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
    const headId = await headResponseId(db, token, 'flow-6');
    await handleRequest(db, req(
        'PUT', '/flows/flow-6', token,
        putBody('Verify Flow', 'flow-6-save-ev'),
        { 'if-response-id': headId },
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

// Task 7's additive pin closing unpinned gap (b): a version
// publish over the retention cap physically trims flow_versions
// (routes.ts's own comment: the cap-trim delete "is untouched
// and stores no pair") while requests/responses grow by EXACTLY
// the one operation pair — the trim is a same-transaction
// physical splice, never a tombstone pair of its own.
test('a version publish over the cap trims flow_versions while'
+ ' requests/responses grow by exactly one pair', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-11');

    const first = await handleRequest(db, req(
        'POST', '/flows/flow-11/versions', token, {
            id: 'v-11-a',
            version: versionBody('flow-11'),
            trimIds: [],
        },
    ));
    assert.equal(first.status, 204);

    const requestsBefore = await db.requests.getAll();
    const responsesBefore = await db.responses.getAll();

    const second = await handleRequest(db, req(
        'POST', '/flows/flow-11/versions', token, {
            id: 'v-11-b',
            version: versionBody('flow-11'),
            trimIds: ['v-11-a'],
        },
    ));
    assert.equal(second.status, 204);

    const requestsAfter = await db.requests.getAll();
    const responsesAfter = await db.responses.getAll();
    assert.equal(
        requestsAfter.length, requestsBefore.length + 1,
    );
    assert.equal(
        responsesAfter.length, responsesBefore.length + 1,
    );

    await assert.rejects(
        () => db.flowVersions.getById('v-11-a'),
    );
    const trimmed = await db.flowVersions.getById('v-11-b');
    assert.ok(trimmed);
});

test('request and response counts stay equal across a mix'
+ ' including one failure', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-7');
    const headId = await headResponseId(db, token, 'flow-7');
    await handleRequest(db, req(
        'PUT', '/flows/flow-7', token,
        putBody('Mixed Flow', 'flow-7-save-ev'),
        { 'if-response-id': headId },
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
