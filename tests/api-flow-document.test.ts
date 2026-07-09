import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    postFlowDocumentOp,
} from '../api/routes.ts';
import {
    validateFlowDocumentBody,
} from '../api/validators.ts';
import {
    headPairIdAt,
    canonicalUriPrefix,
} from '../api/message-pair.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// The flows-specific below-gate op + locked-class e2e coverage
// for Task 3's document PUT (the generic locked arm itself is
// already Task-2-tested against ideas/projects-shaped synthetic
// families in tests/document-family.test.ts).

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

function emptyGraph(): string {
    return JSON.stringify({ nodes: [], edges: [] });
}

// The full wire document PUT /flows/:id now takes (Decision 7):
// the entity fields, the lifecycle trio, the client-authored
// graph snapshot, and the two transitional decomposition
// sidecars (graphDelta/revivals).
function documentBody(
    name: string,
    stateEventId: string,
    overrides?: Record<string, unknown>,
) {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
        ...(overrides ?? {}),
    };
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
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

// Decode a stored request row's canonical message back into its
// method + body — the SAME decode derive-documents.ts's private
// requestMethodOf/requestBodyOf perform, reconstructed here
// read-only for wire-level assertions (this file never imports
// those, since they are not exported production surface).
function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseJson(message, defaultBodyRegistry());
    if (model.startLine.kind !== 'request') {
        throw new Error(
            'stored message carries no request line',
        );
    }
    const body = HttpMessage.fromModel(model).body();
    return {
        method: model.startLine.method,
        body: body.exists()
            ? JSON.parse(body.toText()) as Record<string, unknown>
            : {},
    };
}

// --- below-gate op tests (postFlowDocumentOp directly — no
// route called it until the flip below wired flows/:id onto
// it) ---

test('postFlowDocumentOp writes the flow row, exactly one'
+ ' updated event, the graph-delta rows, and nothing in'
+ ' flow_versions', async () => {
    const db = await freshDb();
    await db.flows.put('flow-op-1', {
        organization_id: '1',
        ...flowFields('Original'),
    });
    await db.states.postEvent(
        'flow-op-1-create', 'flow-op-1', 'active',
        'current', AT,
    );
    const written = await postFlowDocumentOp(
        db, 'flow-op-1',
        {
            ...documentBody('Renamed', 'flow-op-1-upd', {
                graphDelta: {
                    ...emptyDelta(),
                    nodes: [{
                        id: 'n1',
                        flow_id: 'flow-op-1',
                        name: 'N1',
                        position_x: 0,
                        position_y: 0,
                        is_create: false,
                        is_archive: false,
                        task_instructions: '',
                        at: AT,
                    }],
                },
            }),
            organization_id: '1',
        },
        'current',
    );
    assert.equal(written.name, 'Renamed');
    const flow = await db.flows.getById('flow-op-1');
    assert.equal(flow.name, 'Renamed');
    const events = await db.states.getAllFor('flow-op-1');
    assert.deepEqual(
        events.map(e => e.state), ['active', 'updated'],
    );
    const nodes = await db.flowNodes.getAllWhere(
        'flow_id', 'flow-op-1',
    );
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.id, 'n1');
    const versions = await db.flowVersions.getAll();
    assert.equal(versions.length, 0);
});

test('postFlowDocumentOp with revivals posts the restored'
+ ' events (the undo decomposition parity case)', async () => {
    const db = await freshDb();
    await db.flows.put('flow-op-2', {
        organization_id: '1',
        ...flowFields('Original'),
    });
    await db.states.postEvent(
        'flow-op-2-create', 'flow-op-2', 'active',
        'current', AT,
    );
    await db.states.postEvent(
        'node-x-delete', 'node-x', 'deleted', 'current', AT,
    );
    await postFlowDocumentOp(
        db, 'flow-op-2',
        {
            ...documentBody('Revived', 'flow-op-2-upd'),
            revivals: [
                {
                    eventId: 'node-x-restore',
                    entityId: 'node-x',
                    at: AT,
                },
            ],
            organization_id: '1',
        },
        'current',
    );
    const nodeEvents = await db.states.getAllFor('node-x');
    assert.deepEqual(
        nodeEvents.map(e => e.state),
        ['deleted', 'restored'],
    );
});

test('the document body carries state/state_at/graph while'
+ ' the old-plane flow row carries none of them', async () => {
    const db = await freshDb();
    await db.flows.put('flow-op-4', {
        organization_id: '1',
        ...flowFields('Original'),
    });
    await db.states.postEvent(
        'flow-op-4-create', 'flow-op-4', 'active',
        'current', AT,
    );
    const body = {
        ...documentBody('Doc Shape', 'flow-op-4-upd'),
        organization_id: '1',
    };
    for (const key of ['state', 'state_at', 'graph']) {
        assert.ok(key in body, key + ' missing from wire body');
    }
    await postFlowDocumentOp(db, 'flow-op-4', body, 'current');
    const flow = await db.flows.getById('flow-op-4');
    for (const key of [
        'state', 'state_at', 'state_event_id',
        'graph', 'graphDelta', 'revivals',
    ]) {
        assert.ok(
            !(key in flow),
            'flows row must not carry ' + key,
        );
    }
});

// --- e2e locked-class tests (through handleRequest — flows/:id
// is now wired onto documentPutHandler(FLOWS_WIRING)) ---

test('e2e: a byte-identical resend converges (one event, one'
+ ' pair, stored response returned)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-locked-3');
    const headId = await headResponseId(db, token, 'flow-locked-3');
    const body = documentBody('Resend', 'flow-locked-3-a');
    const headers = { 'if-response-id': headId };
    const first = await handleRequest(db, req(
        'PUT', '/flows/flow-locked-3', token, body, headers,
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    const eventsAfterFirst =
        await db.states.getAllFor('flow-locked-3');
    const requestsAfterFirst = await db.requests.getAll();

    const second = await handleRequest(db, req(
        'PUT', '/flows/flow-locked-3', token, body, headers,
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Response-ID'), firstId);
    const eventsAfterSecond =
        await db.states.getAllFor('flow-locked-3');
    assert.equal(
        eventsAfterSecond.length, eventsAfterFirst.length,
    );
    const requestsAfterSecond = await db.requests.getAll();
    assert.equal(
        requestsAfterSecond.length, requestsAfterFirst.length,
    );
});

test('e2e: a save without If-Response-ID on an existing flow'
+ ' 412s; with the stale echo 412s; with the fresh echo'
+ ' succeeds and the stored response carries Follows',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-locked-1');
    const headId = await headResponseId(db, token, 'flow-locked-1');

    const noEcho = await handleRequest(db, req(
        'PUT', '/flows/flow-locked-1', token,
        documentBody('No Echo', 'flow-locked-1-a'),
    ));
    assert.equal(noEcho.status, 412);

    const staleEcho = await handleRequest(db, req(
        'PUT', '/flows/flow-locked-1', token,
        documentBody('Stale Echo', 'flow-locked-1-b'),
        { 'if-response-id': 'not-the-real-head' },
    ));
    assert.equal(staleEcho.status, 412);

    const fresh = await handleRequest(db, req(
        'PUT', '/flows/flow-locked-1', token,
        documentBody('Fresh Echo', 'flow-locked-1-c'),
        { 'if-response-id': headId },
    ));
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get('Follows'), headId);
});

// Task 5: create's own 204 operation pair and its synthesized
// document pair are now TWO rows at flows/:id's address — the
// GET-attached head is the DOCUMENT pair (appended strictly
// later; a live PUT chains Follows/Supersedes off it), never
// the create response's own operation Response-ID.
test('e2e: GET flows/:id carries Response-ID == the head pair'
+ ' id — create\'s own synthesized document pair, never its'
+ ' operation response (Task 8: ledger-derived handler)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await createFlow(db, token, 'flow-locked-2');
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const got = await handleRequest(
        db, req('GET', '/flows/flow-locked-2', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    assert.notEqual(headId, createdId);
    const requests = await db.requests.getAll();
    const atAddress = requests.filter(
        r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-locked-2',
    );
    assert.equal(atAddress.length, 2);
    assert.ok(atAddress.some(r => r.id === headId));
});

// Task 8: the flows/:id GET's Response-ID source switched from
// headPairIdAt (message-pair.ts's ANY-method LOCK head) to
// documentHeadPairId (document-family.ts's DOCUMENT head — the
// SAME deriveDocumentsAt reduction the GET already runs to build
// the entity). Design decision 6 means only PUT ever writes at a
// document address, so the two reductions agree for a live flow
// — this proves the wire Response-ID equals headPairIdAt's own,
// independently computed value, not merely that the route
// returns SOME header.
test('e2e: the flows/:id Response-ID equals headPairIdAt\'s own'
+ ' reduction over the same address (documentHeadPairId parity)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-parity-1');
    const got = await handleRequest(
        db, req('GET', '/flows/flow-parity-1', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    const lockHead = await headPairIdAt(
        db,
        canonicalUriPrefix('1', '/flows/'),
        'flow-parity-1',
    );
    assert.equal(headId, lockHead);
});

test('e2e: an old-shape PUT body 400s (validateFlowPutBody'
+ ' retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-old-shape');
    const res = await handleRequest(db, req(
        'PUT', '/flows/flow-old-shape', token,
        {
            flow: flowFields('Old Shape'),
            eventId: 'ev-1',
            at: AT,
            history: { kind: 'none' },
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(res.status, 400);
});

test('e2e: an old-shape POST flows/:id/undo body (missing the'
+ ' new required graph field) 400s and stores nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-undo-old-shape');
    const published = await handleRequest(db, req(
        'POST', '/flows/flow-undo-old-shape/versions', token, {
            id: 'v-undo-old-shape',
            version: {
                flow_id: 'flow-undo-old-shape',
                name: 'v1',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
                graph: emptyGraph(),
                at: AT,
            },
            trimIds: [],
        },
    ));
    assert.equal(published.status, 204);

    const requestsBefore = await db.requests.getAll();
    const responsesBefore = await db.responses.getAll();
    const eventsBefore = await db.states.getAllFor(
        'flow-undo-old-shape',
    );

    const res = await handleRequest(db, req(
        'POST', '/flows/flow-undo-old-shape/undo', token, {
            flow: flowFields('Old Shape Undo'),
            eventId: 'flow-undo-old-shape-undo-ev',
            at: AT,
            consumedVersionId: 'v-undo-old-shape',
            graphDelta: emptyDelta(),
            revivals: [],
            // `graph` deliberately omitted — the old shape.
        },
    ));
    assert.equal(res.status, 400);

    const requestsAfter = await db.requests.getAll();
    const responsesAfter = await db.responses.getAll();
    const eventsAfter = await db.states.getAllFor(
        'flow-undo-old-shape',
    );
    assert.equal(requestsAfter.length, requestsBefore.length);
    assert.equal(responsesAfter.length, responsesBefore.length);
    assert.equal(eventsAfter.length, eventsBefore.length);
});

// --- Task 5: create + undo synthesized second pairs ---

test('e2e: POST flows forms a document pair at the flow\'s'
+ ' own address and a join pair at the project_flows'
+ ' address, all sharing the create\'s requestAt',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await createFlow(db, token, 'flow-pairs-1');
    assert.equal(created.status, 204);

    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 6);
    assert.equal(responses.length, 6);

    const flowAddress = requests.filter(
        r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-pairs-1',
    );
    assert.equal(flowAddress.length, 2);
    const documentRow = flowAddress.find(
        r => decodeRequestMessage(r.message).method === 'PUT',
    );
    assert.ok(documentRow, 'no document pair at the flow address');
    const decodedDocument =
        decodeRequestMessage(documentRow!.message);
    const expectedDocument = {
        name: 'Fresh Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: 'flow-pairs-1-ev',
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
    };
    // Validates as a genuine FlowDocumentBody — the Phase 3
    // gate-validate precedent, proven at the wire.
    assert.deepEqual(
        validateFlowDocumentBody(decodedDocument.body).entity,
        {
            name: 'Fresh Flow',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
    );
    assert.deepEqual(decodedDocument.body, expectedDocument);

    const joinPrefix =
        '/organizations/1/projects/proj-1/flows/';
    const joinAddress = requests.filter(
        r => r.uri_prefix === joinPrefix
            && r.uri_id === 'flow-pairs-1-pf',
    );
    assert.equal(joinAddress.length, 1);
    const decodedJoin =
        decodeRequestMessage(joinAddress[0]!.message);
    assert.equal(decodedJoin.method, 'PUT');
    assert.deepEqual(decodedJoin.body, {
        project_id: 'proj-1',
        flow_id: 'flow-pairs-1',
        at: AT,
    });

    // All three pairs share ONE origination — the create's own
    // requestAt. slice(3): the fixture's own root-admin pairs
    // (organization document + role grant + membership, Phase 13
    // Tasks 1 and 3) precede every test write and carry their
    // OWN requestAt.
    const ats = new Set(requests.slice(3).map(r => r.at));
    assert.equal(ats.size, 1);
});

test('e2e: a duplicate POST flows (same id) succeeds — the'
+ ' create op holds no echo — and its second document pair'
+ ' carries Supersedes to the first, never Follows, while'
+ ' the first document pair was genesis', async () => {
    const db = await freshDb();
    const token = await organizationToken();

    const first = await handleRequest(db, req(
        'POST', '/flows', token,
        {
            id: 'flow-dup-1',
            flow: flowFields('Fresh Flow'),
            projectFlowId: 'flow-dup-1-pf-a',
            projectFlow: {
                project_id: 'proj-1',
                flow_id: 'flow-dup-1',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: 'flow-dup-1-ev-a',
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(first.status, 204);

    const requestsAfterFirst = await db.requests.getAll();
    const flowAddressAfterFirst = requestsAfterFirst.filter(
        r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-dup-1',
    );
    const firstDocumentRequest = flowAddressAfterFirst.find(
        r => decodeRequestMessage(r.message).method === 'PUT',
    );
    assert.ok(
        firstDocumentRequest,
        'no document pair at the flow address after create 1',
    );
    const firstDocumentResponse = await db.responses.getById(
        firstDocumentRequest!.id,
    );
    assert.equal(firstDocumentResponse.supersedes, undefined);
    assert.equal(firstDocumentResponse.follows, undefined);

    const SECOND_AT = '2026-01-01T00:00:01.000000Z';
    const second = await handleRequest(db, req(
        'POST', '/flows', token,
        {
            id: 'flow-dup-1',
            flow: flowFields('Fresh Flow'),
            projectFlowId: 'flow-dup-1-pf-b',
            projectFlow: {
                project_id: 'proj-1',
                flow_id: 'flow-dup-1',
                at: SECOND_AT,
            },
            initialState: 'active',
            initialStateEventId: 'flow-dup-1-ev-b',
            initialStateAt: SECOND_AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(
        second.status, 204,
        'the create op holds no echo — no 412',
    );

    const requestsAfterSecond = await db.requests.getAll();
    const flowAddressAfterSecond = requestsAfterSecond.filter(
        r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-dup-1',
    );
    const documentRequests = flowAddressAfterSecond.filter(
        r => decodeRequestMessage(r.message).method === 'PUT',
    );
    assert.equal(documentRequests.length, 2);
    const secondDocumentRequest = documentRequests.find(
        r => r.id !== firstDocumentRequest!.id,
    );
    assert.ok(
        secondDocumentRequest,
        'no second document pair at the flow address',
    );
    const secondDocumentResponse = await db.responses.getById(
        secondDocumentRequest!.id,
    );
    assert.equal(
        secondDocumentResponse.supersedes,
        firstDocumentResponse.id,
    );
    assert.equal(secondDocumentResponse.follows, undefined);
});

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the old body
// carried a client-computed target (`flow`/`graph`/`graphDelta`/
// `revivals`) plus `consumedVersionId`. The restore target is
// now resolved SERVER-SIDE from the flows/:id document-pair
// history, so the setup needs a genuine PRIOR SAVE (the
// one-node graph) followed by a SECOND save that moves the head
// away from it — undo must revert exactly that second save,
// landing back on the first save's own graph, never a
// client-supplied one.
test('e2e: POST flows/:id/undo forms a document pair carrying'
+ ' Follows to the pre-undo head, with graph matching the'
+ ' post-undo reassembly', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-undo-pairs-1');
    const genesisHead = await headResponseId(
        db, token, 'flow-undo-pairs-1',
    );

    // A non-trivial undo TARGET (one node) — so the graph
    // comparison below actually exercises the mechanism rather
    // than trivially equating two empty graphs.
    const undoneGraph = {
        nodes: [{
            id: 'n-undo', name: 'N',
            positionX: 0, positionY: 0,
            isCreate: false, isArchive: false,
            memberIds: [], attributes: [],
            taskInstructions: '',
        }],
        edges: [],
    };
    const firstSave = await handleRequest(db, req(
        'PUT', '/flows/flow-undo-pairs-1', token,
        documentBody('One Node', 'flow-undo-pairs-1-ev-1', {
            graph: JSON.stringify(undoneGraph),
            graphDelta: {
                nodes: [{
                    id: 'n-undo',
                    flow_id: 'flow-undo-pairs-1',
                    name: 'N',
                    position_x: 0, position_y: 0,
                    is_create: false, is_archive: false,
                    task_instructions: '', at: AT,
                }],
                edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        }),
        { 'if-response-id': genesisHead },
    ));
    assert.equal(firstSave.status, 200);
    const headAfterFirstSave = await headResponseId(
        db, token, 'flow-undo-pairs-1',
    );

    // A SECOND save moves the head away from the one-node
    // graph — undo must revert THIS, landing back on the
    // first save's own one-node graph.
    const secondSave = await handleRequest(db, req(
        'PUT', '/flows/flow-undo-pairs-1', token,
        documentBody('Back To Empty', 'flow-undo-pairs-1-ev-2'),
        { 'if-response-id': headAfterFirstSave },
    ));
    assert.equal(secondSave.status, 200);
    const preUndoHead = await headResponseId(
        db, token, 'flow-undo-pairs-1',
    );

    const requestsBeforeUndo = await db.requests.getAll();
    const responsesBeforeUndo = await db.responses.getAll();

    const undone = await handleRequest(db, req(
        'POST', '/flows/flow-undo-pairs-1/undo', token, {
            eventId: 'flow-undo-pairs-1-undo-ev',
            at: AT,
        },
    ));
    assert.equal(undone.status, 204);

    const requestsAfterUndo = await db.requests.getAll();
    const responsesAfterUndo = await db.responses.getAll();
    assert.equal(
        requestsAfterUndo.length, requestsBeforeUndo.length + 2,
        'undo appends exactly 2 request rows'
        + ' (operation + document)',
    );
    assert.equal(
        responsesAfterUndo.length, responsesBeforeUndo.length + 2,
        'undo appends exactly 2 response rows'
        + ' (operation + document)',
    );

    const responses = await db.responses.getAll();
    const documentResponses = responses.filter(
        r => r.uri_prefix === '/organizations/1/flows/'
            && r.uri_id === 'flow-undo-pairs-1',
    );
    const undoDocumentResponse = documentResponses.find(
        r => r.follows === preUndoHead,
    );
    assert.ok(
        undoDocumentResponse,
        'no document pair follows the pre-undo head',
    );

    const requests = await db.requests.getAll();
    const undoDocumentRequest = requests.find(
        r => r.id === undoDocumentResponse!.id,
    );
    assert.ok(undoDocumentRequest);
    const decoded =
        decodeRequestMessage(undoDocumentRequest!.message);
    assert.equal(decoded.method, 'PUT');
    assert.deepEqual(
        JSON.parse(decoded.body['graph'] as string),
        undoneGraph,
        'the restore write carries the ORIGINAL one-node'
        + ' graph, resolved from the pair plane — never a'
        + ' client-supplied one',
    );

    const after = await handleRequest(
        db, req('GET', '/flows/flow-undo-pairs-1', token),
    );
    const afterBody = await after.json() as { graph: string };
    assert.deepEqual(
        JSON.parse(decoded.body['graph'] as string),
        JSON.parse(afterBody.graph),
    );
});

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): no
// flow_versions row is published or consumed at all any more —
// undo resolves its target from the flows/:id document-pair
// history, so the setup needs a genuine PRIOR SAVE (giving undo
// a target: genesis) before the race, and the post-race
// assertions drop every flow_versions check (there is no
// consumed-or-survives row to inspect).
test('e2e: an undo racing a save collides on the SAME follows'
+ ' target — the loser 412s, storage shows exactly one'
+ ' follower, and the whole loser transaction lands nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-race-1');
    const genesisHead = await headResponseId(
        db, token, 'flow-race-1',
    );
    const before = await handleRequest(db, req(
        'PUT', '/flows/flow-race-1', token,
        documentBody('Before Race', 'flow-race-1-ev-1'),
        { 'if-response-id': genesisHead },
    ));
    assert.equal(before.status, 200);
    const head = await headResponseId(db, token, 'flow-race-1');

    const [undo, save] = await Promise.all([
        handleRequest(db, req(
            'POST', '/flows/flow-race-1/undo', token, {
                eventId: 'flow-race-1-undo-ev',
                at: AT,
            },
        )),
        handleRequest(db, req(
            'PUT', '/flows/flow-race-1', token,
            documentBody('Saved', 'flow-race-1-save-ev'),
            { 'if-response-id': head },
        )),
    ]);

    const winners = [undo, save].filter(r => r.status !== 412);
    const losers = [undo, save].filter(r => r.status === 412);
    assert.equal(winners.length, 1, 'exactly one racer wins');
    assert.equal(losers.length, 1, 'exactly one racer 412s');

    const responses = await db.responses.getAll();
    const following = responses.filter(r => r.follows === head);
    assert.equal(
        following.length, 1,
        'exactly one pair may follow the pre-race head',
    );

    const flow = await db.flows.getById('flow-race-1');
    if (flow.name === 'Fresh Flow') {
        // Undo won the race, reverting all the way back to
        // genesis (the only pair before "Before Race"); the
        // save's write never landed.
        assert.equal(undo.status, 204);
        assert.equal(save.status, 412);
    } else {
        // The save won the race; the undo's write never landed
        // — its own event never posted.
        assert.equal(flow.name, 'Saved');
        assert.equal(save.status, 200);
        assert.equal(undo.status, 412);
        const events = await db.states.getAllFor('flow-race-1');
        assert.ok(
            !events.some(
                e => e.id === 'flow-race-1-undo-ev',
            ),
            'the losing undo must not have posted its event',
        );
    }
});
