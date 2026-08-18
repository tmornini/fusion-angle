import { test } from 'node:test';
import {
    deriveFlowStateHistory,
    flowEntityOf,
    flowStoredEntityOf,
} from '../api/derive-flows.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    postFlowDocumentOp,
} from '../api/routes.ts';
import {
    validateFlowDocumentBody,
} from '../api/validators.ts';
import {
    headPairIdAt,
    canonicalUriCollection,
    strongEtagOf,
} from '../api/message-pair.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';
import { messageStore } from '../api/message-store.ts';

// The flows-specific below-gate op + locked-class e2e coverage
// for Task 3's document PUT (the generic locked arm itself is
// already Task-2-tested against organizations/1/ideas/projects-shaped
// synthetic
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

// The full wire document PUT /organizations/:id/flows/:id now takes (Decision
// 7):
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
        'POST', '/organizations/1/flows/', token,
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
// (buildFlowPutBody's ctx.GETWithEtag) does.
async function headResponseId(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/1/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id, 'no Response-ID on GET /organizations/1/flows/' + flowId);
    return id!;
}

async function headEtag(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const res = await handleRequest(
        db,
        req('GET', '/organizations/1/flows/' + flowId, token),
    );
    assert.equal(res.status, 200);
    const raw = res.headers.get('ETag');
    assert.notEqual(raw, null, 'locked GET carries ETag');
    return raw!;
}

// Decode a stored request row's serializeWire message back into its
// method + body — the SAME decode derive-documents.ts's private
// requestMethodOf/requestBodyOf perform, reconstructed here
// read-only for wire-level assertions (this file never imports
// those, since they are not exported production surface).
function decodeRequestMessage(message: string): {
    readonly method: string;
    readonly body: Record<string, unknown>;
} {
    const model = parseWire(message);
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

// --- below-gate op tests (postFlowDocumentOp directly).
// Phase Final Task 2: flows + graph ROW halves stripped;
// op returns a reconstructed entity + posts states events.

test('postFlowDocumentOp returns the entity, exactly one'
+ ' updated event, no graph rows, nothing in'
+ ' flow_versions', async () => {
    const db = await freshDb();
    // Phase Final Task 2: states ROW half stripped — drive
    // create + update through the live PUT so both trios
    // land on the pair plane.
    const token = await organizationToken();
    const createBody = {
        ...flowFields('Original'),
        state: 'active',
        state_at: AT,
        state_event_id: 'flow-op-1-create',
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
    };
    const create = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-op-1', token, createBody,
    ));
    assert.equal(create.status, 201);
    const headId = create.headers.get('Response-ID')!;
    const update = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-op-1', token,
        documentBody('Renamed', 'flow-op-1-upd', {
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
        { 'if-match': await headEtag(db, token, 'flow-op-1') },
    ));
    assert.equal(update.status, 201);
    const wire = await update.json() as { name: string };
    assert.equal(wire.name, 'Renamed');
    const events = await deriveFlowStateHistory(db, '1', 'flow-op-1');
    assert.deepEqual(
        events.map(e => e.state), ['active', 'updated'],
    );
    // Phase Final Stage B: flow_nodes + flow_versions tables
    // retired — pair-plane state events are the residual pin.
});

test('postFlowDocumentOp with revivals posts the restored'
+ ' events (the undo decomposition parity case)', async () => {
    const db = await freshDb();
    // Phase Final Task 2: pair plane only — create then update
    // with a deletion + revival on the document body.
    const token = await organizationToken();
    const createBody = {
        ...flowFields('Original'),
        state: 'active',
        state_at: AT,
        state_event_id: 'flow-op-2-create',
        graph: emptyGraph(),
        graphDelta: {
            ...emptyDelta(),
            nodes: [{
                id: 'node-x',
                flow_id: 'flow-op-2',
                name: 'X',
                position_x: 0,
                position_y: 0,
                is_create: false,
                is_archive: false,
                task_instructions: '',
                at: AT,
            }],
            deletions: [{
                eventId: 'node-x-delete',
                entityId: 'node-x',
                entityKind: 'node',
                at: AT,
            }],
        },
        revivals: [],
    };
    const create = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-op-2', token, createBody,
    ));
    assert.equal(create.status, 201);
    const headId = create.headers.get('Response-ID')!;
    const update = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-op-2', token,
        {
            ...documentBody('Revived', 'flow-op-2-upd'),
            revivals: [
                {
                    eventId: 'node-x-restore',
                    entityId: 'node-x',
                    at: AT,
                },
            ],
        },
        { 'if-match': await headEtag(db, token, 'flow-op-2') },
    ));
    assert.equal(update.status, 201);
    // SIDECAR-KEEP (C3): pin graphDelta.deletions / revivals
    // on the flow document pairs — no bulk states derive.
    const prefix = canonicalUriCollection('1', '/flows/');
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', prefix),
        db.responses.getAllWhere('uri_collection', prefix),
    ]);
    const pairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((p) => p.uriId === 'flow-op-2');
    const states: string[] = [];
    for (const pair of pairs) {
        const delta = pair.body['graphDelta'];
        const deletions =
            typeof delta === 'object' && delta !== null
                ? (delta as Record<string, unknown>)[
                    'deletions'
                ]
                : undefined;
        if (Array.isArray(deletions)) {
            for (const entry of deletions) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                    && (entry as Record<string, unknown>)[
                        'entityId'
                    ] === 'node-x'
                ) {
                    states.push('deleted');
                }
            }
        }
        const revivals = pair.body['revivals'];
        if (Array.isArray(revivals)) {
            for (const entry of revivals) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                    && (entry as Record<string, unknown>)[
                        'entityId'
                    ] === 'node-x'
                ) {
                    states.push('restored');
                }
            }
        }
    }
    assert.deepEqual(states, ['deleted', 'restored']);
});

test('the document body carries state/state_at/graph while'
+ ' the reconstructed entity carries none of them', async () => {
    const db = await freshDb();
    const body = {
        ...documentBody('Doc Shape', 'flow-op-4-upd'),
        organization_id: '1',
    };
    for (const key of ['state', 'state_at', 'graph']) {
        assert.ok(key in body, key + ' missing from wire body');
    }
    // Phase Final Task 2: below-facade without a pair still
    // reconstructs the return entity from the body.
    const flow = await postFlowDocumentOp(
        db, 'flow-op-4', body, 'current',
    );
    for (const key of [
        'state', 'state_at', 'state_event_id',
        'graph', 'graphDelta', 'revivals',
    ]) {
        assert.ok(
            !(key in flow),
            'reconstructed entity must not carry ' + key,
        );
    }
});

// --- e2e locked-class tests (through handleRequest —
// organizations/:id/flows/:id
// is now wired onto documentPutHandler(FLOWS_WIRING)) ---

test('locked PUT with no If-Match over a head is 428',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-if-match-428');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-if-match-428', token,
        documentBody('No Match', 'flow-if-match-428-a'),
    ));
    assert.equal(res.status, 428);
    const body = await res.json() as {
        name: string;
        error?: string;
    };
    assert.equal(body.error, undefined);
    assert.equal(body.name, 'Fresh Flow');
    assert.ok(res.headers.get('ETag'));
    assert.ok(res.headers.get('Date'));
});

test('locked PUT with a malformed If-Match is 400',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-if-match-400');
    for (const bad of ['*', 'W/"x"', '"a", "b"', 'bare']) {
        const res = await handleRequest(db, req(
            'PUT', '/organizations/1/flows/flow-if-match-400', token,
            documentBody('Bad Match', 'flow-if-match-400-a'),
            { 'if-match': bad },
        ));
        assert.equal(res.status, 400, bad);
        assert.equal(
            (await res.json()).error,
            'If-Match must carry exactly one strong'
            + ' validator',
        );
    }
});

test('locked PUT with a stale If-Match is 412',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-if-match-412');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-if-match-412', token,
        documentBody('Stale Match', 'flow-if-match-412-a'),
        { 'if-match': '"' + 'b'.repeat(64) + '"' },
    ));
    assert.equal(res.status, 412);
    const body = await res.json() as {
        name: string;
        error?: string;
    };
    assert.equal(body.error, undefined);
    assert.equal(body.name, 'Fresh Flow');
    assert.ok(res.headers.get('ETag'));
    assert.ok(res.headers.get('Date'));
});

test('locked PUT with If-Match and no head is 412',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-if-match-none', token,
        documentBody('Ghost', 'flow-if-match-none-a'),
        { 'if-match': '"' + 'b'.repeat(64) + '"' },
    ));
    assert.equal(res.status, 412);
    assert.equal(
        (await res.json()).error,
        'If-Match does not match the current document at '
        + '/organizations/1/flows/flow-if-match-none',
    );
});

test('e2e: a byte-identical resend converges (one event, one'
+ ' pair, stored response returned)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-locked-3');
    const headId = await headResponseId(db, token, 'flow-locked-3');
    const body = documentBody('Resend', 'flow-locked-3-a');
    const headers = {
        'if-match': await headEtag(db, token, 'flow-locked-3'),
    };
    const first = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-locked-3', token, body, headers,
    ));
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const eventsAfterFirst =
        await deriveFlowStateHistory(db, '1', 'flow-locked-3');
    const requestsAfterFirst = await db.requests.getAll();

    const second = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-locked-3', token, body, headers,
    ));
    assert.equal(second.status, 201);
    assert.equal(second.headers.get('Response-ID'), firstId);
    const stored = await db.responses.getById(firstId!);
    assert.ok(stored !== undefined);
    assert.equal(
        second.headers.get('ETag'),
        strongEtagOf(stored.version),
    );
    const eventsAfterSecond =
        await deriveFlowStateHistory(db, '1', 'flow-locked-3');
    assert.equal(
        eventsAfterSecond.length, eventsAfterFirst.length,
    );
    const requestsAfterSecond = await db.requests.getAll();
    assert.equal(
        requestsAfterSecond.length, requestsAfterFirst.length,
    );
});

test('e2e: a save without If-Match on an existing flow'
+ ' 428s; with the stale echo 412s; with the fresh echo'
+ ' succeeds and the stored response carries no predecessor'
+ ' header',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-locked-1');
    const headId = await headResponseId(db, token, 'flow-locked-1');

    const noEcho = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-locked-1', token,
        documentBody('No Echo', 'flow-locked-1-a'),
    ));
    assert.equal(noEcho.status, 428);

    const staleEcho = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-locked-1', token,
        documentBody('Stale Echo', 'flow-locked-1-b'),
        { 'if-match': '"' + 'b'.repeat(64) + '"' },
    ));
    assert.equal(staleEcho.status, 412);

    const fresh = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-locked-1', token,
        documentBody('Fresh Echo', 'flow-locked-1-c'),
        { 'if-match': await headEtag(
            db, token, 'flow-locked-1',
        ) },
    ));
    assert.equal(fresh.status, 201);
    assert.equal(fresh.headers.get('Follows'), null);
    assert.equal(fresh.headers.get('Supersedes'), null);
});

// Task 5: create's own 204 operation pair and its synthesized
// document pair are now TWO rows at organizations/:id/flows/:id's address —
// the
// GET-attached head is the DOCUMENT pair (appended strictly
// later; a live PUT chains Follows/Supersedes off it), never
// the create response's own operation Response-ID.
test('e2e: GET organizations/:id/flows/:id carries'
    + ' Response-ID == the head pair'
+ ' id — create\'s own synthesized document pair, never its'
+ ' operation response (Task 8: ledger-derived handler)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await createFlow(db, token, 'flow-locked-2');
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const got = await handleRequest(
        db, req('GET', '/organizations/1/flows/flow-locked-2', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    assert.notEqual(headId, createdId);
    const etag = await headEtag(db, token, 'flow-locked-2');
    const stored = await db.responses.getById(headId);
    assert.ok(stored !== undefined);
    assert.equal(etag, strongEtagOf(stored.version));
    const requests = await db.requests.getAll();
    const atAddress = requests.filter(
        r => r.uri_collection === '/organizations/1/flows/'
            && r.uri_id === 'flow-locked-2',
    );
    assert.equal(atAddress.length, 2);
    assert.ok(atAddress.some(r => r.id === headId));
});

// Task 8: the organizations/:id/flows/:id GET's Response-ID source switched
// from
// headPairIdAt (message-pair.ts's ANY-method LOCK head) to
// documentHeadPairId (document-family.ts's DOCUMENT head — the
// SAME deriveDocumentsAt reduction the GET already runs to build
// the entity). Design decision 6 means only PUT ever writes at a
// document address, so the two reductions agree for a live flow
// — this proves the wire Response-ID equals headPairIdAt's own,
// independently computed value, not merely that the route
// returns SOME header.
test('e2e: the organizations/:id/flows/:id Response-ID'
    + ' equals headPairIdAt\'s own'
+ ' reduction over the same address (documentHeadPairId parity)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-parity-1');
    const got = await handleRequest(
        db, req('GET', '/organizations/1/flows/flow-parity-1', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    const lockHead = await headPairIdAt(
        db,
        canonicalUriCollection('1', '/flows/'),
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
        'PUT', '/organizations/1/flows/flow-old-shape', token,
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

test('e2e: an old-shape POST organizations/:id/flows/:id'
    + '/undo body (missing the'
+ ' new required graph field) 400s and stores nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-undo-old-shape');
    // versions setup RETIRED (Phase 15 Task 7); undo no longer
    // consumes a flow_versions row.

    const requestsBefore = await db.requests.getAll();
    const responsesBefore = await db.responses.getAll();
    const eventsBefore = await deriveFlowStateHistory(db, '1',
        'flow-undo-old-shape',
    );

    const res = await handleRequest(db, req(
        'POST', '/organizations/1/flows/flow-undo-old-shape/undo', token, {
            flow: flowFields('Old Shape Undo'),
            eventId: 'flow-undo-old-shape-undo-ev',
            at: AT,
            graphDelta: emptyDelta(),
            revivals: [],
            // `graph` deliberately omitted — the old shape.
        },
    ));
    assert.equal(res.status, 400);

    const requestsAfter = await db.requests.getAll();
    const responsesAfter = await db.responses.getAll();
    const eventsAfter = await deriveFlowStateHistory(db, '1',
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
    assert.equal(created.status, 201);

    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 5);
    assert.equal(responses.length, 5);

    const flowAddress = requests.filter(
        r => r.uri_collection === '/organizations/1/flows/'
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
        r => r.uri_collection === joinPrefix
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
        'POST', '/organizations/1/flows/', token,
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
    assert.equal(first.status, 201);

    const requestsAfterFirst = await db.requests.getAll();
    const flowAddressAfterFirst = requestsAfterFirst.filter(
        r => r.uri_collection === '/organizations/1/flows/'
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
    assert.equal('supersedes' in firstDocumentResponse, false);
    assert.equal('follows' in firstDocumentResponse, false);

    const SECOND_AT = '2026-01-01T00:00:01.000000Z';
    const second = await handleRequest(db, req(
        'POST', '/organizations/1/flows/', token,
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
        second.status, 201,
        'the create op holds no echo — no 412',
    );

    const requestsAfterSecond = await db.requests.getAll();
    const flowAddressAfterSecond = requestsAfterSecond.filter(
        r => r.uri_collection === '/organizations/1/flows/'
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
        'supersedes' in secondDocumentResponse, false,
    );
    assert.equal(
        'follows' in secondDocumentResponse, false,
    );
});

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): the old body
// carried a client-computed target (`flow`/`graph`/`graphDelta`/
// `revivals`) plus `consumedVersionId`. The restore target is
// now resolved SERVER-SIDE from the organizations/:id/flows/:id document-pair
// history, so the setup needs a genuine PRIOR SAVE (the
// one-node graph) followed by a SECOND save that moves the head
// away from it — undo must revert exactly that second save,
// landing back on the first save's own graph, never a
// client-supplied one.
test('e2e: POST organizations/:id/flows/:id/undo forms a document pair with'
+ ' graph matching the post-undo reassembly', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-undo-pairs-1');

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
        'PUT', '/organizations/1/flows/flow-undo-pairs-1', token,
        documentBody('One Node', 'flow-undo-pairs-1-ev-1', {
            graph: undoneGraph,
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
        { 'if-match': await headEtag(
            db, token, 'flow-undo-pairs-1',
        ) },
    ));
    assert.equal(firstSave.status, 201);

    // A SECOND save moves the head away from the one-node
    // graph — undo must revert THIS, landing back on the
    // first save's own one-node graph.
    const secondSave = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-undo-pairs-1', token,
        documentBody('Back To Empty', 'flow-undo-pairs-1-ev-2'),
        { 'if-match': await headEtag(
            db, token, 'flow-undo-pairs-1',
        ) },
    ));
    assert.equal(secondSave.status, 201);

    const requestsBeforeUndo = await db.requests.getAll();
    const responsesBeforeUndo = await db.responses.getAll();

    const undone = await handleRequest(db, req(
        'POST', '/organizations/1/flows/flow-undo-pairs-1/undo', token, {
            eventId: 'flow-undo-pairs-1-undo-ev',
            at: AT,
        },
    ));
    assert.equal(undone.status, 201);

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
        r => r.uri_collection === '/organizations/1/flows/'
            && r.uri_id === 'flow-undo-pairs-1',
    );
    const priorIds = new Set(
        responsesBeforeUndo.map((r) => r.id),
    );
    const undoDocumentResponse = documentResponses.find(
        r => !priorIds.has(r.id),
    );
    assert.ok(
        undoDocumentResponse,
        'no new document pair after undo',
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
        decoded.body['graph'],
        undoneGraph,
        'the restore write carries the ORIGINAL one-node'
        + ' graph, resolved from the pair plane — never a'
        + ' client-supplied one',
    );

    const after = await handleRequest(
        db, req('GET', '/organizations/1/flows/flow-undo-pairs-1', token),
    );
    const afterBody = await after.json() as {
        graph: Record<string, unknown>;
    };
    assert.deepEqual(
        decoded.body['graph'],
        afterBody.graph,
    );
});

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): no
// flow_versions row is published or consumed at all any more —
// undo resolves its target from the organizations/:id/flows/:id document-pair
// history, so the setup needs a genuine PRIOR SAVE (giving undo
// a target: genesis) before the race, and the post-race
// assertions drop every flow_versions check (there is no
// consumed-or-survives row to inspect).
test('e2e: an undo racing a save — the loser 412s, storage'
+ ' shows exactly one new document pair, and the whole'
+ ' loser transaction lands nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'flow-race-1');
    const before = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/flow-race-1', token,
        documentBody('Before Race', 'flow-race-1-ev-1'),
        { 'if-match': await headEtag(
            db, token, 'flow-race-1',
        ) },
    ));
    assert.equal(before.status, 201);
    const headEtagValue = await headEtag(
        db, token, 'flow-race-1',
    );

    const [undo, save] = await Promise.all([
        handleRequest(db, req(
            'POST', '/organizations/1/flows/flow-race-1/undo', token, {
                eventId: 'flow-race-1-undo-ev',
                at: AT,
            },
        )),
        handleRequest(db, req(
            'PUT', '/organizations/1/flows/flow-race-1', token,
            documentBody('Saved', 'flow-race-1-save-ev'),
            { 'if-match': headEtagValue },
        )),
    ]);

    const winners = [undo, save].filter(r => r.status !== 412);
    const losers = [undo, save].filter(r => r.status === 412);
    assert.equal(winners.length, 1, 'exactly one racer wins');
    assert.equal(losers.length, 1, 'exactly one racer 412s');

    const responses = await db.responses.getAll();
    const atFlow = responses.filter(
        r => r.uri_collection === '/organizations/1/flows/'
            && r.uri_id === 'flow-race-1',
    );
    // Genesis create + Before Race + exactly one racer.
    assert.ok(
        atFlow.length >= 3,
        'winner wrote a document pair; loser wrote none extra',
    );

    // Phase Final Task 2: flow name lives on the pair plane.
    const got = await handleRequest(
        db, req('GET', '/organizations/1/flows/flow-race-1', token),
    );
    assert.equal(got.status, 200);
    const flow = await got.json() as { name: string };
    if (flow.name === 'Fresh Flow') {
        // Undo won the race, reverting all the way back to
        // genesis (the only pair before "Before Race"); the
        // save's write never landed.
        assert.equal(undo.status, 201);
        assert.equal(save.status, 412);
    } else {
        // The save won the race; the undo's write never landed
        // — its own event never posted.
        assert.equal(flow.name, 'Saved');
        assert.equal(save.status, 201);
        assert.equal(undo.status, 412);
        const events = await deriveFlowStateHistory(db, '1', 'flow-race-1');
        assert.ok(
            !events.some(
                e => e.id === 'flow-race-1-undo-ev',
            ),
            'the losing undo must not have posted its event',
        );
    }
});

const FLOW_PREFIX = '/organizations/1/flows/';

async function documentPairCount(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<number> {
    const pairs = await messageStore(db).getPairs(
        FLOW_PREFIX, flowId,
    );
    return pairs.filter((pair) =>
        pair.request.method === 'PUT'
        || pair.request.method === 'DELETE',
    ).length;
}

async function latestPutRequestBody(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<Record<string, unknown>> {
    const pairs = await messageStore(db).getPairs(
        FLOW_PREFIX, flowId,
    );
    const puts = pairs.filter((pair) =>
        pair.request.method === 'PUT',
    );
    const latest = puts[puts.length - 1];
    assert.ok(latest, 'no PUT pair at ' + flowId);
    return decodeRequestMessage(
        latest.request.message,
    ).body;
}

async function assertStoredPutOmitsUndoHistory(
    db: MemoryDbAdapter,
    flowId: string,
    pairCount: number,
    token: string,
): Promise<void> {
    const stored = JSON.parse(
        await storedPutBodyText(db, FLOW_PREFIX, flowId),
    ) as Record<string, unknown>;
    assert.equal(
        'hasUndoHistory' in stored, false,
        'stored PUT must omit hasUndoHistory',
    );
    const requestBody = await latestPutRequestBody(
        db, flowId,
    );
    const expected = flowStoredEntityOf(
        {
            uriId: flowId,
            pairId: flowId,
            method: 'PUT',
            body: requestBody,
        },
        '1',
    );
    assert.deepEqual(stored, expected);
    const got = await handleRequest(
        db, req('GET', '/organizations/1/flows/' + flowId, token),
    );
    assert.equal(got.status, 200);
    const wire = await got.json() as Record<string, unknown>;
    assert.equal(
        wire['hasUndoHistory'], pairCount > 1,
        'GET stamps hasUndoHistory when COUNT(*) > 1',
    );
    const { hasUndoHistory: _flag, ...fromGet } = wire;
    assert.deepEqual(fromGet, stored);
    assert.deepEqual(
        wire,
        flowEntityOf(
            {
                uriId: flowId,
                pairId: flowId,
                method: 'PUT',
                body: requestBody,
            },
            '1',
            pairCount,
        ),
    );
}

// G2: stored PUT = flowEntityOf minus hasUndoHistory.
// GET adds the stamp when this address has more than one
// PUT or DELETE pair. Covers every G2 writer.
test('hasUndoHistory is absent from the stored PUT and '
+ 'present on GET when COUNT(*) > 1',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const flowId = 'flow-g2-stream';
    const created = await createFlow(db, token, flowId);
    assert.equal(created.status, 201);
    assert.equal(await documentPairCount(db, flowId), 1);
    await assertStoredPutOmitsUndoHistory(
        db, flowId, 1, token,
    );

    const saveBody = documentBody(
        'Saved Graph', flowId + '-save',
        {
            graph: {
                nodes: [{
                    id: 'n-g2', name: 'N',
                    positionX: 0, positionY: 0,
                    isCreate: false, isArchive: false,
                    memberIds: [], attributes: [],
                    taskInstructions: '',
                }],
                edges: [],
            },
        },
    );
    const saved = await handleRequest(db, req(
        'PUT', '/organizations/1/flows/' + flowId, token, saveBody,
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(saved.status, 201);
    assert.equal(await documentPairCount(db, flowId), 2);
    await assertStoredPutOmitsUndoHistory(
        db, flowId, 2, token,
    );
    const putJson = await saved.json() as {
        hasUndoHistory?: boolean;
        graph?: unknown;
    };
    assert.equal('hasUndoHistory' in putJson, false);
    assert.ok(putJson.graph);

    const undone = await handleRequest(db, req(
        'POST', '/organizations/1/flows/' + flowId + '/undo', token, {
            eventId: flowId + '-undo',
            at: AT,
        },
    ));
    assert.equal(undone.status, 201);
    assert.equal(await documentPairCount(db, flowId), 3);
    await assertStoredPutOmitsUndoHistory(
        db, flowId, 3, token,
    );
});
