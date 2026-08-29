import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    deriveFlowStateHistory,
    flowEntityOf,
    flowStoredEntityOf,
} from '../api/derive-flows.ts';
import {
    documentMessagePairsAt,
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
    headMessagePairIdAt,
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
// already Task-2-tested against
// organizations/AjdvjuECVZEgZoFajaIEkg/ideas/projects-shaped
// synthetic
// families in tests/document-family.test.ts).

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
        ...(headers !== undefined ? { headers } : {}),
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
    ids?: {
        readonly projectFlowId?: string;
        readonly initialStateEventId?: string;
    },
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token,
        {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId: ids?.projectFlowId
                ?? generateIdentifier(),
            projectFlow: {
                project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: ids?.initialStateEventId
                ?? generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
}

// Task 5: create's own operation message pair (204, no
// body) is no longer the address's head — its synthesized
// document message pair (appended after, so strictly later)
// is. A save must echo THIS id, read fresh via GET, exactly
// as the real client (buildFlowPutBody's ctx.GETWithEtag)
// does.
async function headResponseId(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const id = got.headers.get('Response-ID');
    assert.ok(id
        , 'no Response-ID on GET /organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + '' + flowId);
    return id!;
}

async function headEtag(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const res = await handleRequest(
        db,
        req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            , token),
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
    // land on the message plane.
    const token = await organizationToken();
    const createBody = {
        ...flowFields('Original'),
        state: 'active',
        state_at: AT,
        state_event_id: generateIdentifier(),
        graph: emptyGraph(),
        graphDelta: emptyDelta(),
        revivals: [],
    };
    const create = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bgwNLywXomEwlIMSFlkukQ', token, createBody,
    ));
    assert.equal(create.status, 201);
    const update = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bgwNLywXomEwlIMSFlkukQ', token,
        documentBody('Renamed', generateIdentifier(), {
            state_at: '2026-01-01T00:00:01.000000Z',
            graphDelta: {
                ...emptyDelta(),
                nodes: [{
                    id: generateIdentifier(),
                    flow_id: 'bgwNLywXomEwlIMSFlkukQ',
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
        { 'if-match': await headEtag(db, token, 'bgwNLywXomEwlIMSFlkukQ') },
    ));
    assert.equal(update.status, 201);
    const wire = await update.json() as { name: string };
    assert.equal(wire.name, 'Renamed');
    const events = await deriveFlowStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
        , 'bgwNLywXomEwlIMSFlkukQ');
    assert.deepEqual(
        events.map(e => e.state), ['active', 'updated'],
    );
    // Phase Final Stage B: flow_nodes + flow_versions tables
    // retired — message-plane state events are the residual pin.
});

test('postFlowDocumentOp with revivals posts the restored'
+ ' events (the undo decomposition parity case)', async () => {
    const db = await freshDb();
    const nodeId = generateIdentifier();
    // Phase Final Task 2: message plane only — create then update
    // with a deletion + revival on the document body.
    const token = await organizationToken();
    const createBody = {
        ...flowFields('Original'),
        state: 'active',
        state_at: AT,
        state_event_id: generateIdentifier(),
        graph: emptyGraph(),
        graphDelta: {
            ...emptyDelta(),
            nodes: [{
                id: nodeId,
                flow_id: 'biDOZCyZATKcAVVOCbegTw',
                name: 'X',
                position_x: 0,
                position_y: 0,
                is_create: false,
                is_archive: false,
                task_instructions: '',
                at: AT,
            }],
            deletions: [{
                eventId: generateIdentifier(),
                entityId: nodeId,
                entityKind: 'node',
                at: AT,
            }],
        },
        revivals: [],
    };
    const create = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'biDOZCyZATKcAVVOCbegTw', token, createBody,
    ));
    assert.equal(create.status, 201);
    const update = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'biDOZCyZATKcAVVOCbegTw', token,
        {
            ...documentBody('Revived', generateIdentifier()),
            revivals: [
                {
                    eventId: generateIdentifier(),
                    entityId: nodeId,
                    at: AT,
                },
            ],
        },
        { 'if-match': await headEtag(db, token, 'biDOZCyZATKcAVVOCbegTw') },
    ));
    assert.equal(update.status, 201);
    // SIDECAR-KEEP (C3): pin graphDelta.deletions / revivals
    // on the flow document message pairs — no bulk states derive.
    const prefix = canonicalUriCollection('AjdvjuECVZEgZoFajaIEkg', '/flows/'
        + '');
    const [requests] = await Promise.all([
        db.messagePairs.getAllWhere('uri_collection', prefix),
        db.messagePairs.getAllWhere('uri_collection', prefix),
    ]);
    const messagePairs = documentMessagePairsAt(
        requests, prefix,
    ).filter((p) => p.uriId === 'biDOZCyZATKcAVVOCbegTw');
    const states: string[] = [];
    for (const messagePair of messagePairs) {
        const delta = messagePair.body['graphDelta'];
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
                    ] === nodeId
                ) {
                    states.push('deleted');
                }
            }
        }
        const revivals = messagePair.body['revivals'];
        if (Array.isArray(revivals)) {
            for (const entry of revivals) {
                if (
                    typeof entry === 'object'
                    && entry !== null
                    && (entry as Record<string, unknown>)[
                        'entityId'
                    ] === nodeId
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
        ...documentBody('Doc Shape', generateIdentifier()),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    for (const key of ['state', 'state_at', 'graph']) {
        assert.ok(key in body, key + ' missing from wire body');
    }
    // Phase Final Task 2: below-facade without a pair still
    // reconstructs the return entity from the body.
    const flow = await postFlowDocumentOp(
        db, generateIdentifier(), body, 'XXZruirZyAOoRpNxaDnpSA',
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
    await createFlow(db, token, 'ajKMlszDvGpoUWXASHPNEg');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ajKMlszDvGpoUWXASHPNEg', token,
        documentBody('No Match', generateIdentifier()),
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
    await createFlow(db, token, 'aVuvRoPHPHSNWPovkYhZqw');
    for (const bad of [
        '*',
        'W/"x"',
        '"a", "b"',
        'bare',
        '"' + 'b'.repeat(64) + '"',
    ]) {
        const res = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aVuvRoPHPHSNWPovkYhZqw', token,
            documentBody('Bad Match', generateIdentifier()),
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
    await createFlow(db, token, 'aYDQdfcyFUkOqCLKIIvnww');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aYDQdfcyFUkOqCLKIIvnww', token,
        documentBody('Stale Match', generateIdentifier()),
        { 'if-match': '"' + generateIdentifier() + '"' },
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
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'awMkvSKFOHJymfXEpFypPw', token,
        documentBody('Ghost', generateIdentifier()),
        { 'if-match': '"' + generateIdentifier() + '"' },
    ));
    assert.equal(res.status, 412);
    assert.equal(
        (await res.json()).error,
        'If-Match does not match the current document at '
        + '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'awMkvSKFOHJymfXEpFypPw',
    );
});

test('e2e: a byte-identical resend converges (one event, one'
+ ' pair, stored response returned)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'bZXXOWeDHCowVkWMhrZGgg');
    await headResponseId(db, token, 'bZXXOWeDHCowVkWMhrZGgg');
    const body = documentBody('Resend', generateIdentifier());
    const headers = {
        'if-match': await headEtag(db, token, 'bZXXOWeDHCowVkWMhrZGgg'),
    };
    const first = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bZXXOWeDHCowVkWMhrZGgg', token, body, headers,
    ));
    assert.equal(first.status, 201);
    const firstId = first.headers.get('Response-ID');
    const eventsAfterFirst =
        await deriveFlowStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
            , 'bZXXOWeDHCowVkWMhrZGgg');
    const requestsAfterFirst = await db.messagePairs.getAll();

    const second = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bZXXOWeDHCowVkWMhrZGgg', token, body, headers,
    ));
    assert.equal(second.status, 201);
    assert.equal(second.headers.get('Response-ID'), firstId);
    const stored = await db.messagePairs.getById(firstId!);
    assert.ok(stored !== undefined);
    assert.equal(
        second.headers.get('ETag'),
        strongEtagOf(stored.id),
    );
    const eventsAfterSecond =
        await deriveFlowStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
            , 'bZXXOWeDHCowVkWMhrZGgg');
    assert.equal(
        eventsAfterSecond.length, eventsAfterFirst.length,
    );
    const requestsAfterSecond = await db.messagePairs.getAll();
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
    await createFlow(db, token, 'bACksPDpiYvefaEzSXoaZg');
    await headResponseId(db, token, 'bACksPDpiYvefaEzSXoaZg');

    const noEcho = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bACksPDpiYvefaEzSXoaZg', token,
        documentBody('No Echo', generateIdentifier()),
    ));
    assert.equal(noEcho.status, 428);

    const staleEcho = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bACksPDpiYvefaEzSXoaZg', token,
        documentBody('Stale Echo', generateIdentifier()),
        { 'if-match': '"' + generateIdentifier() + '"' },
    ));
    assert.equal(staleEcho.status, 412);

    const fresh = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bACksPDpiYvefaEzSXoaZg', token,
        documentBody('Fresh Echo', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'bACksPDpiYvefaEzSXoaZg',
        ) },
    ));
    assert.equal(fresh.status, 201);
    assert.equal(fresh.headers.get('Follows'), null);
    assert.equal(fresh.headers.get('Supersedes'), null);
});

// Task 5: create's own 204 operation message pair and its
// synthesized document message pair are now TWO rows at
// organizations/:id/flows/:id's address — the GET-attached
// head is the DOCUMENT message pair (appended strictly
// later; a live PUT chains Follows/Supersedes off it), never
// the create response's own operation Response-ID.
test('e2e: GET organizations/:id/flows/:id carries'
    + ' Response-ID == the head pair'
+ ' id — create\'s own synthesized document message pair, never its'
+ ' operation response (Task 8: ledger-derived handler)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const created = await createFlow(db, token, 'bWdlaTZZcKRsLsGXiKQZkw');
    const createdId = created.headers.get('Response-ID');
    assert.ok(createdId);
    const got = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bWdlaTZZcKRsLsGXiKQZkw', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    assert.notEqual(headId, createdId);
    const etag = await headEtag(db, token, 'bWdlaTZZcKRsLsGXiKQZkw');
    const stored = await db.messagePairs.getById(headId);
    assert.ok(stored !== undefined);
    assert.equal(etag, strongEtagOf(stored.id));
    const requests = await db.messagePairs.getAll();
    const atAddress = requests.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === 'bWdlaTZZcKRsLsGXiKQZkw',
    );
    assert.equal(atAddress.length, 2);
    assert.ok(atAddress.some(r => r.id === headId));
});

// Task 8: the organizations/:id/flows/:id GET's Response-ID source switched
// from
// headMessagePairIdAt (message-pair.ts's ANY-method LOCK head) to
// documentHeadMessagePairId (document-family.ts's DOCUMENT head — the
// SAME deriveDocumentsAt reduction the GET already runs to build
// the entity). Design decision 6 means only PUT ever writes at a
// document address, so the two reductions agree for a live flow
// — this proves the wire Response-ID equals headMessagePairIdAt's own,
// independently computed value, not merely that the route
// returns SOME header.
test('e2e: the organizations/:id/flows/:id Response-ID'
    + ' equals headMessagePairIdAt\'s own'
+ ' reduction over the same address (documentHeadMessagePairId parity)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'biSFoHVEGnaArklDDblCXQ');
    const got = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'biSFoHVEGnaArklDDblCXQ', token),
    );
    assert.equal(got.status, 200);
    const headId = got.headers.get('Response-ID');
    assert.ok(headId);
    const lockHead = await headMessagePairIdAt(
        db,
        canonicalUriCollection('AjdvjuECVZEgZoFajaIEkg', '/flows/'),
        'biSFoHVEGnaArklDDblCXQ',
    );
    assert.equal(headId, lockHead);
});

test('e2e: an old-shape PUT body 400s (validateFlowPutBody'
+ ' retired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'bZzeCdjzbfoAExMKEafrVA');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'bZzeCdjzbfoAExMKEafrVA', token,
        {
            flow: flowFields('Old Shape'),
            eventId: generateIdentifier(),
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
    await createFlow(db, token, 'cnRwmsMXKOgLWsMVIjtubQ');
    // versions setup RETIRED (Phase 15 Task 7); undo no longer
    // consumes a flow_versions row.

    const requestsBefore = await db.messagePairs.getAll();
    const responsesBefore = await db.messagePairs.getAll();
    const eventsBefore = await deriveFlowStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg',
        'cnRwmsMXKOgLWsMVIjtubQ',
    );

    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cnRwmsMXKOgLWsMVIjtubQ/undo', token, {
            flow: flowFields('Old Shape Undo'),
            eventId: generateIdentifier(),
            at: AT,
            graphDelta: emptyDelta(),
            revivals: [],
            // `graph` deliberately omitted — the old shape.
        },
        { 'if-match': await headEtag(
            db, token, 'cnRwmsMXKOgLWsMVIjtubQ',
        ) },
    ));
    assert.equal(res.status, 400);

    const requestsAfter = await db.messagePairs.getAll();
    const responsesAfter = await db.messagePairs.getAll();
    const eventsAfter = await deriveFlowStateHistory(db
        , 'AjdvjuECVZEgZoFajaIEkg',
        'cnRwmsMXKOgLWsMVIjtubQ',
    );
    assert.equal(requestsAfter.length, requestsBefore.length);
    assert.equal(responsesAfter.length, responsesBefore.length);
    assert.equal(eventsAfter.length, eventsBefore.length);
});

// --- Task 5: create + undo synthesized second pairs ---

test('e2e: POST flows forms a document message pair at the flow\'s'
+ ' own address and a join pair at the project_flows'
+ ' address, all sharing the create\'s requestAt',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const projectFlowId = generateIdentifier();
    const initialStateEventId = generateIdentifier();
    const created = await createFlow(db, token, flowId, {
        projectFlowId,
        initialStateEventId,
    });
    assert.equal(created.status, 201);

    const messagePairs = await db.messagePairs.getAll();
    assert.equal(messagePairs.length, 5);

    const flowAddress = messagePairs.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === flowId,
    );
    assert.equal(flowAddress.length, 2);
    const documentRow = flowAddress.find(
        r => decodeRequestMessage(r.request).method === 'PUT',
    );
    assert.ok(documentRow, 'no document message pair at the flow address');
    const decodedDocument =
        decodeRequestMessage(documentRow!.request);
    const expectedDocument = {
        name: 'Fresh Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: initialStateEventId,
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
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'qfhFObbtDfxUZwEGxySBoQ/flows/';
    const joinAddress = messagePairs.filter(
        r => r.uri_collection === joinPrefix
            && r.uri_id === projectFlowId,
    );
    assert.equal(joinAddress.length, 1);
    const decodedJoin =
        decodeRequestMessage(joinAddress[0]!.request);
    assert.equal(decodedJoin.method, 'PUT');
    assert.deepEqual(decodedJoin.body, {
        project_id: 'qfhFObbtDfxUZwEGxySBoQ',
        flow_id: flowId,
        at: AT,
    });

    // All three pairs share ONE origination — the create's own
    // requestAt. slice(3): the fixture's own root-admin pairs
    // (organization document + role grant + membership, Phase 13
    // Tasks 1 and 3) precede every test write and carry their
    // OWN requestAt.
    const ats = new Set(
        messagePairs.slice(3).map(r => r.request_at),
    );
    assert.equal(ats.size, 1);
});

test('e2e: a duplicate POST flows (same id) succeeds — the'
+ ' create op holds no echo — and its second document message pair'
+ ' carries Supersedes to the first, never Follows, while'
+ ' the first document message pair was genesis', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const flowId = generateIdentifier();

    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token,
        {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(first.status, 201);

    const requestsAfterFirst = await db.messagePairs.getAll();
    const flowAddressAfterFirst = requestsAfterFirst.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === flowId,
    );
    const firstDocumentRequest = flowAddressAfterFirst.find(
        r => decodeRequestMessage(r.request).method === 'PUT',
    );
    assert.ok(
        firstDocumentRequest,
        'no document message pair at the flow address after create 1',
    );
    const firstDocumentResponse = await db.messagePairs.getById(
        firstDocumentRequest!.id,
    );
    assert.equal('supersedes' in firstDocumentResponse, false);
    assert.equal('follows' in firstDocumentResponse, false);

    const SECOND_AT = '2026-01-01T00:00:01.000000Z';
    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token,
        {
            id: flowId,
            flow: flowFields('Fresh Flow'),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: 'qfhFObbtDfxUZwEGxySBoQ',
                flow_id: flowId,
                at: SECOND_AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: SECOND_AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(
        second.status, 201,
        'the create op holds no echo — no 412',
    );

    const requestsAfterSecond = await db.messagePairs.getAll();
    const flowAddressAfterSecond = requestsAfterSecond.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === flowId,
    );
    const documentRequests = flowAddressAfterSecond.filter(
        r => decodeRequestMessage(r.request).method === 'PUT',
    );
    assert.equal(documentRequests.length, 2);
    const secondDocumentRequest = documentRequests.find(
        r => r.id !== firstDocumentRequest!.id,
    );
    assert.ok(
        secondDocumentRequest,
        'no second document message pair at the flow address',
    );
    const secondDocumentResponse = await db.messagePairs.getById(
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
// now resolved SERVER-SIDE from the
// organizations/:id/flows/:id document-message-pair
// history, so the setup needs a genuine PRIOR SAVE (the
// one-node graph) followed by a SECOND save that moves the head
// away from it — undo must revert exactly that second save,
// landing back on the first save's own graph, never a
// client-supplied one.
test('e2e: POST organizations/:id/flows/:id/undo forms a'
+ ' document message pair with graph matching the'
+ ' post-undo reassembly', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'cvdqOxjRwvTEYzWTrFDNFw');

    // A non-trivial undo TARGET (one node) — so the graph
    // comparison below actually exercises the mechanism rather
    // than trivially equating two empty graphs.
    const nodeId = generateIdentifier();
    const undoneGraph = {
        nodes: [{
            id: nodeId, name: 'N',
            positionX: 0, positionY: 0,
            isCreate: false, isArchive: false,
            memberIds: [], attributes: [],
            taskInstructions: '',
        }],
        edges: [],
    };
    const firstSave = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cvdqOxjRwvTEYzWTrFDNFw', token,
        documentBody('One Node', generateIdentifier(), {
            graph: undoneGraph,
            graphDelta: {
                nodes: [{
                    id: nodeId,
                    flow_id: 'cvdqOxjRwvTEYzWTrFDNFw',
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
            db, token, 'cvdqOxjRwvTEYzWTrFDNFw',
        ) },
    ));
    assert.equal(firstSave.status, 201);

    // A SECOND save moves the head away from the one-node
    // graph — undo must revert THIS, landing back on the
    // first save's own one-node graph.
    const secondSave = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cvdqOxjRwvTEYzWTrFDNFw', token,
        documentBody('Back To Empty', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'cvdqOxjRwvTEYzWTrFDNFw',
        ) },
    ));
    assert.equal(secondSave.status, 201);

    const requestsBeforeUndo = await db.messagePairs.getAll();
    const responsesBeforeUndo = await db.messagePairs.getAll();

    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cvdqOxjRwvTEYzWTrFDNFw/undo', token, {
            eventId: generateIdentifier(),
            at: AT,
        },
        { 'if-match': await headEtag(
            db, token, 'cvdqOxjRwvTEYzWTrFDNFw',
        ) },
    ));
    assert.equal(undone.status, 201);

    const requestsAfterUndo = await db.messagePairs.getAll();
    const responsesAfterUndo = await db.messagePairs.getAll();
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

    const responses = await db.messagePairs.getAll();
    const documentResponses = responses.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === 'cvdqOxjRwvTEYzWTrFDNFw',
    );
    const priorIds = new Set(
        responsesBeforeUndo.map((r) => r.id),
    );
    const undoDocumentResponse = documentResponses.find(
        r => !priorIds.has(r.id),
    );
    assert.ok(
        undoDocumentResponse,
        'no new document message pair after undo',
    );

    const requests = await db.messagePairs.getAll();
    const undoDocumentRequest = requests.find(
        r => r.id === undoDocumentResponse!.id,
    );
    assert.ok(undoDocumentRequest);
    const decoded =
        decodeRequestMessage(undoDocumentRequest!.request);
    assert.equal(decoded.method, 'PUT');
    assert.deepEqual(
        decoded.body['graph'],
        undoneGraph,
        'the restore write carries the ORIGINAL one-node'
        + ' graph, resolved from the message plane — never a'
        + ' client-supplied one',
    );

    const after = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'cvdqOxjRwvTEYzWTrFDNFw', token),
    );
    const afterBody = await after.json() as {
        graph: Record<string, unknown>;
    };
    assert.deepEqual(
        decoded.body['graph'],
        afterBody.graph,
    );
});

// The undo's If-Match gate (locked-class parity for the
// flows sub-resource POST): an undo names the head it
// intends to revert, exactly as a save names the head it
// intends to replace. Without the echo the server would be
// free to revert whatever happened to be current when its
// own resolution walk ran — a 412 the caller can neither
// predict nor act on. These three pin the gate's outcomes.
test('e2e: POST undo without If-Match is 428 and stores'
+ ' nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'ncQDxSCbnUKFdKmFHzhqyQ');
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ncQDxSCbnUKFdKmFHzhqyQ', token,
        documentBody('Undoable', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'ncQDxSCbnUKFdKmFHzhqyQ',
        ) },
    ));
    const before = (await db.messagePairs.getAll()).length;

    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ncQDxSCbnUKFdKmFHzhqyQ/undo', token,
        { eventId: generateIdentifier(), at: AT },
    ));

    assert.equal(undone.status, 428);
    assert.equal(
        (await db.messagePairs.getAll()).length, before,
        'a 428 undo stores nothing',
    );
});

test('e2e: POST undo with a stale If-Match is 412 and stores'
+ ' nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'zzVLgKwrIUqXQTHxaSbAmg');
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'zzVLgKwrIUqXQTHxaSbAmg', token,
        documentBody('First', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'zzVLgKwrIUqXQTHxaSbAmg',
        ) },
    ));
    // The echo the caller captured, then a save that moves
    // the head out from under it.
    const stale = await headEtag(
        db, token, 'zzVLgKwrIUqXQTHxaSbAmg',
    );
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'zzVLgKwrIUqXQTHxaSbAmg', token,
        documentBody('Second', generateIdentifier()),
        { 'if-match': stale },
    ));
    const before = (await db.messagePairs.getAll()).length;

    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'zzVLgKwrIUqXQTHxaSbAmg/undo', token,
        { eventId: generateIdentifier(), at: AT },
        { 'if-match': stale },
    ));

    assert.equal(undone.status, 412);
    assert.equal(
        (await db.messagePairs.getAll()).length, before,
        'a 412 undo stores nothing',
    );
});

test('e2e: POST undo echoing the current head succeeds',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'pAYuqZoLC0OFbTfLPWCjLA');
    await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'pAYuqZoLC0OFbTfLPWCjLA', token,
        documentBody('Undoable', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'pAYuqZoLC0OFbTfLPWCjLA',
        ) },
    ));

    const undone = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'pAYuqZoLC0OFbTfLPWCjLA/undo', token,
        { eventId: generateIdentifier(), at: AT },
        { 'if-match': await headEtag(
            db, token, 'pAYuqZoLC0OFbTfLPWCjLA',
        ) },
    ));

    assert.equal(undone.status, 201);
});

// NAMED REWRITE (Phase 14 Task 8, undo-as-replay): no
// flow_versions row is published or consumed at all any more —
// undo resolves its target from the
// organizations/:id/flows/:id document-message-pair
// history, so the setup needs a genuine PRIOR SAVE (giving undo
// a target: genesis) before the race, and the post-race
// assertions drop every flow_versions check (there is no
// consumed-or-survives row to inspect).
test('e2e: an undo racing a save — the loser 412s, storage'
+ ' shows exactly one new document message pair, and the whole'
+ ' loser transaction lands nothing',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createFlow(db, token, 'biakjMJqdIlFhfVZBGhpKw');
    const before = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'biakjMJqdIlFhfVZBGhpKw', token,
        documentBody('Before Race', generateIdentifier()),
        { 'if-match': await headEtag(
            db, token, 'biakjMJqdIlFhfVZBGhpKw',
        ) },
    ));
    assert.equal(before.status, 201);
    const headEtagValue = await headEtag(
        db, token, 'biakjMJqdIlFhfVZBGhpKw',
    );

    const undoEventId = generateIdentifier();
    const [undo, save] = await Promise.all([
        handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'biakjMJqdIlFhfVZBGhpKw/undo', token, {
                eventId: undoEventId,
                at: AT,
            },
            { 'if-match': headEtagValue },
        )),
        handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'biakjMJqdIlFhfVZBGhpKw', token,
            documentBody('Saved', generateIdentifier()),
            { 'if-match': headEtagValue },
        )),
    ]);

    const winners = [undo, save].filter(r => r.status !== 412);
    const losers = [undo, save].filter(r => r.status === 412);
    assert.equal(winners.length, 1, 'exactly one racer wins');
    assert.equal(losers.length, 1, 'exactly one racer 412s');

    const responses = await db.messagePairs.getAll();
    const atFlow = responses.filter(
        r => r.uri_collection === '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'flows/'
            && r.uri_id === 'biakjMJqdIlFhfVZBGhpKw',
    );
    // Genesis create + Before Race + exactly one racer.
    assert.ok(
        atFlow.length >= 3,
        'winner wrote a document message pair; loser wrote none extra',
    );

    // Phase Final Task 2: flow name lives on the message plane.
    const got = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'biakjMJqdIlFhfVZBGhpKw', token),
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
        const events = await deriveFlowStateHistory(db
            , 'AjdvjuECVZEgZoFajaIEkg', 'biakjMJqdIlFhfVZBGhpKw');
        assert.ok(
            !events.some(
                e => e.id === undoEventId,
            ),
            'the losing undo must not have posted its event',
        );
    }
});

const FLOW_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/';

async function documentMessagePairCount(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<number> {
    const messagePairs = await messageStore(db)
        .getMessagePairs(FLOW_PREFIX, flowId);
    return messagePairs.filter((messagePair) =>
        messagePair.method === 'PUT'
        || messagePair.method === 'DELETE',
    ).length;
}

async function latestPutRequestBody(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<Record<string, unknown>> {
    const messagePairs = await messageStore(db)
        .getMessagePairs(FLOW_PREFIX, flowId);
    const puts = messagePairs.filter((messagePair) =>
        messagePair.method === 'PUT',
    );
    const latest = puts[puts.length - 1];
    assert.ok(latest, 'no PUT pair at ' + flowId);
    return decodeRequestMessage(
        latest.request,
    ).body;
}

async function assertStoredPutOmitsUndoHistory(
    db: MemoryDbAdapter,
    flowId: string,
    messagePairCount: number,
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
            messagePairId: flowId,
            method: 'PUT',
            body: requestBody,
        },
        'AjdvjuECVZEgZoFajaIEkg',
    );
    assert.deepEqual(stored, expected);
    const got = await handleRequest(
        db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId, token),
    );
    assert.equal(got.status, 200);
    const wire = await got.json() as Record<string, unknown>;
    assert.equal(
        wire['hasUndoHistory'], messagePairCount > 1,
        'GET stamps hasUndoHistory when COUNT(*) > 1',
    );
    const { hasUndoHistory: _flag, ...fromGet } = wire;
    assert.deepEqual(fromGet, stored);
    assert.deepEqual(
        wire,
        flowEntityOf(
            {
                uriId: flowId,
                messagePairId: flowId,
                method: 'PUT',
                body: requestBody,
            },
            'AjdvjuECVZEgZoFajaIEkg',
            messagePairCount,
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
    const flowId = generateIdentifier();
    const created = await createFlow(db, token, flowId);
    assert.equal(created.status, 201);
    assert.equal(await documentMessagePairCount(db, flowId), 1);
    await assertStoredPutOmitsUndoHistory(
        db, flowId, 1, token,
    );

    const saveBody = documentBody(
        'Saved Graph', generateIdentifier(),
        {
            graph: {
                nodes: [{
                    id: generateIdentifier(), name: 'N',
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
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            , token, saveBody,
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(saved.status, 201);
    assert.equal(await documentMessagePairCount(db, flowId), 2);
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
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/undo', token, {
            eventId: generateIdentifier(),
            at: AT,
        },
        { 'if-match': await headEtag(db, token, flowId) },
    ));
    assert.equal(undone.status, 201);
    assert.equal(await documentMessagePairCount(db, flowId), 3);
    await assertStoredPutOmitsUndoHistory(
        db, flowId, 3, token,
    );
});
