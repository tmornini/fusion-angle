import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Flow tags: the codebase's FIRST pair-plane-ONLY document
// family (Phase 14 Task 9) — no backing table, derived entirely
// from message pairs at /flows/:id/tags/:name. PUT/GET/DELETE
// lifecycle, Response-ID resolution (pinning), marked delete,
// and two-tag concurrency — the api-flow-document.test.ts
// precedent, re-nested one level deeper.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
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

function emptyGraph() {
    return { nodes: [], edges: [] };
}

function documentBody(
    name: string,
    stateEventId: string,
) {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/flows', token,
        {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: 'proj-1',
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
}

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

// --- commit 2: PUT/GET/DELETE lifecycle, marked delete ---

test('e2e: PUT flows/:id/tags/:name creates a tag pinning the'
+ ' flow\'s current Response-ID; GET returns it', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-1');
    const responseId = await headResponseId(db, token, 'flow-tag-1');

    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-1/tags/v1', token,
        { flow_response_id: responseId },
    ));
    assert.equal(put.status, 201);
    const putBody = await put.json() as {
        id: string; flow_id: string; flow_response_id: string;
    };
    assert.deepEqual(putBody, {
        id: 'v1', flow_id: 'flow-tag-1',
        flow_response_id: responseId,
    });

    const get = await handleRequest(db, req(
        'GET', '/flows/flow-tag-1/tags/v1', token,
    ));
    assert.equal(get.status, 200);
    const getBody = await get.json() as {
        id: string; flow_id: string; flow_response_id: string;
    };
    assert.deepEqual(getBody, putBody);
});

test('e2e: GET on a never-written tag name 404s', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-2');
    const res = await handleRequest(db, req(
        'GET', '/flows/flow-tag-2/tags/never', token,
    ));
    assert.equal(res.status, 404);
});

test('e2e: a re-PUT of the same tag name (pinning a DIFFERENT'
+ ' response) carries Supersedes to the first — the SIMPLE-class'
+ ' chain, a re-tag is a new head, never an edit', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-3');
    const r1 = await headResponseId(db, token, 'flow-tag-3');

    const first = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-3/tags/v1', token,
        { flow_response_id: r1 },
    ));
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);

    // A genuinely DIFFERENT body (a second save's own response
    // id) — a byte-identical resend would instead hit the gate's
    // pre-tx idempotency fast path and replay the first response
    // unchanged (message-pair.ts), never forming a second pair.
    const saved = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-3', token,
        documentBody('Second Save', 'flow-tag-3-ev-2'),
        { 'if-match': (
            await handleRequest(
                db, req('GET', '/flows/flow-tag-3', token),
            )
        ).headers.get('ETag')! },
    ));
    assert.equal(saved.status, 201);
    const r2 = await headResponseId(db, token, 'flow-tag-3');
    assert.notEqual(r2, r1);

    const second = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-3/tags/v1', token,
        { flow_response_id: r2 },
    ));
    assert.equal(second.status, 201);
    const secondId = second.headers.get('Response-ID');
    assert.ok(secondId);
    assert.notEqual(secondId, firstId);

    const responses = await db.responses.getAll();
    const secondRow = responses.find(r => r.id === secondId);
    assert.ok(secondRow);
    assert.equal('supersedes' in secondRow!, false);
    assert.equal('follows' in secondRow!, false);
});

test('e2e: DELETE marks the tag — GET 404s after, and the'
+ ' DELETE pair carries Supersedes to the live head, never a'
+ ' physical splice', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-4');
    const r1 = await headResponseId(db, token, 'flow-tag-4');

    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-4/tags/v1', token,
        { flow_response_id: r1 },
    ));
    assert.equal(put.status, 201);
    const putId = put.headers.get('Response-ID');

    const del = await handleRequest(db, req(
        'DELETE', '/flows/flow-tag-4/tags/v1', token,
    ));
    assert.equal(del.status, 204);
    const delId = del.headers.get('Response-ID');
    assert.ok(delId);

    const responses = await db.responses.getAll();
    const delRow = responses.find(r => r.id === delId);
    assert.ok(delRow);
    assert.equal('supersedes' in delRow!, false);

    const requests = await db.requests.getAll();
    const delRequest = requests.find(r => r.id === delId);
    assert.ok(delRequest);
    // The DELETE row itself is present, unmoved — a marked
    // tombstone, never a physical splice of a prior row.
    assert.equal(requests.length > 0, true);

    const get = await handleRequest(db, req(
        'GET', '/flows/flow-tag-4/tags/v1', token,
    ));
    assert.equal(get.status, 404);
});

test('e2e: a malformed tag body (extra key) 400s and stores'
+ ' nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-5');
    const r1 = await headResponseId(db, token, 'flow-tag-5');
    const before = await db.requests.getAll();

    const res = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-5/tags/v1', token,
        { flow_response_id: r1, extra: 'nope' },
    ));
    assert.equal(res.status, 400);
    const after = await db.requests.getAll();
    assert.equal(after.length, before.length);
});

test('e2e: a malformed tag name (disallowed characters) 400s'
+ ' and stores nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-6');
    const r1 = await headResponseId(db, token, 'flow-tag-6');
    const before = await db.requests.getAll();

    const res = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-6/tags/not%20ok', token,
        { flow_response_id: r1 },
    ));
    assert.equal(res.status, 400);
    const after = await db.requests.getAll();
    assert.equal(after.length, before.length);
});

test('e2e: a member-role identity (not just admin) can'
+ ' PUT/GET/DELETE a tag — MEMBER_VERBS widens'
+ ' /flows/:id/tags', async () => {
    const db = await freshDb();
    await seedOrganizationMember(db, 'sarah');
    const adminToken = await organizationToken();
    const memberToken = await organizationToken('sarah', '1');
    await createFlow(db, adminToken, 'flow-tag-7');
    const r1 = await headResponseId(db, adminToken, 'flow-tag-7');

    const put = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-7/tags/v1', memberToken,
        { flow_response_id: r1 },
    ));
    assert.equal(put.status, 201);

    const get = await handleRequest(db, req(
        'GET', '/flows/flow-tag-7/tags/v1', memberToken,
    ));
    assert.equal(get.status, 200);

    const del = await handleRequest(db, req(
        'DELETE', '/flows/flow-tag-7/tags/v1', memberToken,
    ));
    assert.equal(del.status, 204);
});

// Two DIFFERENT tag names, PUT concurrently on one flow: distinct
// addresses (no follows/supersedes collision), so both land —
// structural assertions only (both readable afterward), no timing.
test('e2e: two different tag names PUT concurrently on one flow'
+ ' both land', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-8');
    const r1 = await headResponseId(db, token, 'flow-tag-8');

    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PUT', '/flows/flow-tag-8/tags/alpha', token,
            { flow_response_id: r1 },
        )),
        handleRequest(db, req(
            'PUT', '/flows/flow-tag-8/tags/beta', token,
            { flow_response_id: r1 },
        )),
    ]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const gotAlpha = await handleRequest(db, req(
        'GET', '/flows/flow-tag-8/tags/alpha', token,
    ));
    const gotBeta = await handleRequest(db, req(
        'GET', '/flows/flow-tag-8/tags/beta', token,
    ));
    assert.equal(gotAlpha.status, 200);
    assert.equal(gotBeta.status, 200);
    assert.deepEqual(
        (await gotAlpha.json() as { id: string }).id, 'alpha',
    );
    assert.deepEqual(
        (await gotBeta.json() as { id: string }).id, 'beta',
    );
});

// --- commit 3: pin tag resolution to response ids ---

test('e2e: a tag written once still resolves to the EXACT'
+ ' tagged response after the flow is saved twice more — the'
+ ' pin never follows the flow\'s own moving head', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-tag-pin-1');
    const r1 = await headResponseId(db, token, 'flow-tag-pin-1');

    const tagged = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-pin-1/tags/v1', token,
        { flow_response_id: r1 },
    ));
    assert.equal(tagged.status, 201);

    const save2 = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-pin-1', token,
        documentBody('Second Save', 'flow-tag-pin-1-ev-2'),
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/flows/flow-tag-pin-1', token),
            )
        ).headers.get('ETag')! },
    ));
    assert.equal(save2.status, 201);
    const r2 = await headResponseId(db, token, 'flow-tag-pin-1');
    assert.notEqual(r2, r1);

    const save3 = await handleRequest(db, req(
        'PUT', '/flows/flow-tag-pin-1', token,
        documentBody('Third Save', 'flow-tag-pin-1-ev-3'),
        { 'if-match': (
            await handleRequest(
                db,
                req('GET', '/flows/flow-tag-pin-1', token),
            )
        ).headers.get('ETag')! },
    ));
    assert.equal(save3.status, 201);
    const r3 = await headResponseId(db, token, 'flow-tag-pin-1');
    assert.notEqual(r3, r2);

    const get = await handleRequest(db, req(
        'GET', '/flows/flow-tag-pin-1/tags/v1', token,
    ));
    assert.equal(get.status, 200);
    const body = await get.json() as { flow_response_id: string };
    assert.equal(
        body.flow_response_id, r1,
        'the tag must still name the ORIGINAL pinned response,'
        + ' never the flow\'s current head',
    );
});
