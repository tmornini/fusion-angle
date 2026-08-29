import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT, handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import type {
    WorkOrderFlowGraph,
    MessagePairEntity,
} from '../api/types.ts';
import { ValidationError } from '../api/types.ts';
import {
    validateWorkOrderDocumentBody,
} from '../api/validators.ts';
import { postWorkOrderDocumentOp } from '../api/routes.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const NODE_START = generateIdentifier();
const NODE_FINISH = generateIdentifier();
const WO_RESEND = generateIdentifier();
const WO_C1 = generateIdentifier();
const WO_C1_FWO = generateIdentifier();
const WO_C2 = generateIdentifier();
const WO_C2_FWO_A = generateIdentifier();
const WO_C2_FWO_B = generateIdentifier();
const FLOW_C2 = generateIdentifier();
const WO_C3 = generateIdentifier();
const WO_C3_FWO_A = generateIdentifier();
const WO_C3_FWO_B = generateIdentifier();
const FLOW_C3 = generateIdentifier();
const WO_C4 = generateIdentifier();
const WO_C4_FWO = generateIdentifier();
const FLOW_C4 = generateIdentifier();

// Phase 5 Task 2 (fourth-family, 'stateless' evidence): PUT
// /organizations/:id/work-orders/:id takes the entity's OWN
// fields only — no lifecycle trio, unlike ideas, projects,
// and flows (Decision 7). A work order's lifecycle is
// written ONLY by the create/claim/transition/release ops,
// so a body carrying state/state_at/state_event_id 400s at
// the gate (validateWorkOrderDocumentBody), and the op
// posts no states event of its own.

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The frozen flow graph a work order carries, stored as a
// native object on work_orders.flow_graph — the SAME fixture
// shape as api-work-orders-create.test.ts's own flowGraph()
// (each test file is an isolated world).
function flowGraph(): Record<string, unknown> {
    const graph: WorkOrderFlowGraph = {
        name: 'Test flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: NODE_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: NODE_FINISH, name: 'Done',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
                fromNodeId: NODE_START, toNodeId: NODE_FINISH,
            },
        ],
    };
    return graph as unknown as Record<string, unknown>;
}

function documentFields() {
    return {
        display_id: 'wo-doc-1',
        flow_graph: flowGraph(),
        position: 2,
    };
}

// -- 1. validateWorkOrderDocumentBody -----------------------

test('validateWorkOrderDocumentBody accepts the entity fields'
+ ' plus an optional organization_id', () => {
    const doc = validateWorkOrderDocumentBody({
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    });
    assert.deepEqual(doc.entity, documentFields());
});

test('validateWorkOrderDocumentBody accepts the entity fields'
+ ' with organization_id absent', () => {
    const doc = validateWorkOrderDocumentBody(documentFields());
    assert.deepEqual(doc.entity, documentFields());
});

test('validateWorkOrderDocumentBody rejects a trio key at the'
+ ' gate (the stateless covenant, validator-enforced)', () => {
    assert.throws(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state: 'active',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state_at: '2026-01-01T00:00:00.000000Z',
        }),
        ValidationError,
    );
    assert.throws(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state_event_id: 'ev-1',
        }),
        ValidationError,
    );
});

// -- 2. postWorkOrderDocumentOp (below-gate, MemoryDbAdapter) --

// Phase Final Task 2: work_orders ROW half stripped — op
// returns a reconstructed entity + appends the pair only.
test('postWorkOrderDocumentOp returns the entity and the'
+ ' pair; work_orders row plane stays empty', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = {
        ...documentFields(),
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
    };
    const messagePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yAhMcJGxllmQkLemOQjCmA',
        routePattern: 'organizations/:id/work-orders/:id',
        routeSegments: ['work-orders', ':id'],
        pathSegments: ['work-orders', 'yAhMcJGxllmQkLemOQjCmA'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    const written = await postWorkOrderDocumentOp(
        db, 'yAhMcJGxllmQkLemOQjCmA', body,
        'XXZruirZyAOoRpNxaDnpSA', messagePair,
    );
    assert.deepEqual(written, {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        ...documentFields(),
    });
    // Phase Final Stage B: work_orders table retired.
    assert.equal((await db.messagePairs.getAll()).length, 1);
    assert.equal((await db.messagePairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-idea-document.test.ts's own
// "a byte-identical resend converges" case). This exercises the
// CURRENT hand-written organizations/:id/work-orders/:id PUT (unchanged until
// the
// absorption commit registers WORK_ORDERS_WIRING) — the fast
// path lives at the gate (api.ts), agnostic to which op serves
// the route, so this pin holds unchanged straight through the
// absorption (finding 11: wire-byte parity). -----------------

test('a byte-identical PUT resend to'
    + ' organizations/:id/work-orders/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = await freshDb();
    const body = documentFields();
    const first = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO_RESEND, body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO_RESEND
            , body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.messagePairs.getAll()).length, 3);
    assert.equal((await db.messagePairs.getAll()).length, 3);
});

// -- 4. postWorkOrderCreationOp's synthesized create pairs
// (Phase 5 Task 3, the flow-creation-triple precedent): a live
// POST /work-orders now forms THREE pairs pre-tx — the gate's
// own operation message pair (shares the WO's document
// address, per the registry-driven create-address override),
// a synthesized document message pair (PUT-shaped, at the
// WO's own address), and a synthesized join pair
// (PUT-shaped, at the
// organizations/:id/flows/:id/work-orders/:woid address).
// ----------------------

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

// The workOrder facet reuses documentFields() — the SAME
// {display_id, flow_graph, position} shape section 1 above
// already validates — so the create body and the synthesized
// document message pair's expected body are ONE construction,
// never two divergent literals. `displayId` defaults to
// documentFields()'s own value; a duplicate-create test
// overrides it so the SECOND create's document sub-body
// genuinely differs from the first's — the document message
// pair's hash covers ONLY {display_id, flow_graph, position}
// (workOrderCreateDocumentBody's own three picked keys), so
// two creates sharing that sub-body would collide on
// appendMessagePair's concurrent-retry guard and the second
// pair would never land, an artifact of the test fixture, not
// the create op.
function workOrderCreateBody(
    id: string,
    flowWorkOrderId: string,
    flowId: string,
    displayId = 'wo-doc-1',
) {
    return {
        id,
        workOrder: {
            ...documentFields(),
            display_id: displayId,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: flowId,
            work_order_id: id,
            at: nowUtc(),
        },
        // Derived from flowWorkOrderId (always fresh per
        // call), never from id — a duplicate create (same WO
        // id, fresh join id) must mint fresh state events too,
        // or its states.postEvent would collide with the
        // first create's.
        stateEventIds: [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ],
        states: [NODE_START, NODE_FINISH, 'claimed'],
        stateEventAts: [
            '2099-01-01T00:00:00.000000Z',
            '2099-01-01T00:00:00.000001Z',
            '2099-01-01T00:00:00.000002Z',
        ],
    };
}

// Decode a stored request row's serializeWire message back into
// its method + body — the SAME decode
// tests/api-flow-document.test.ts's own decodeRequestMessage
// performs, reconstructed here read-only (each test file is
// an isolated world).
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
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// The PUT-shaped row at a given address, excluding a prior
// id — never positional (an index-0/AjdvjuECVZEgZoFajaIEkg read is an
// implicit
// arrival-order dependency, the H7 hazard class): filter by
// address AND method instead.
function documentRowAt(
    messagePairs: readonly MessagePairEntity[],
    prefix: string,
    uriId: string,
    excludeId?: string,
): MessagePairEntity | undefined {
    return messagePairs.find(
        r => r.uri_collection === prefix
            && r.uri_id === uriId
            && r.id !== excludeId
            && decodeRequestMessage(r.request).method
                === 'PUT',
    );
}

const ENTITY_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/';

test('a work-order create appends a PUT-shaped document'
+ ' message pair at the WO address and a PUT-shaped join pair'
+ ' at the join address, all three sharing one requestAt',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C1, WO_C1_FWO, 'aNoIDzecmwfawmsLSsDsPw'),
    ));
    assert.equal(res.status, 201);
    const messagePairs = await db.messagePairs.getAll();
    assert.equal(messagePairs.length, 6);

    const documentRow =
        documentRowAt(messagePairs, ENTITY_PREFIX, WO_C1);
    assert.ok(
        documentRow, 'no document message pair at the WO address',
    );
    assert.deepEqual(
        validateWorkOrderDocumentBody(
            decodeRequestMessage(documentRow!.request).body,
        ).entity,
        documentFields(),
    );

    const joinPrefix =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/aNoIDzecmwfawmsLSsDsPw/'
            + 'work-orders/';
    const joinRow =
        documentRowAt(messagePairs, joinPrefix, WO_C1_FWO);
    assert.ok(joinRow, 'no join pair at the join address');

    // slice(3): the fixture's own root-admin pairs (organization
    // document + role grant + membership, Phase 13 Tasks 1 and 3)
    // precede every test write and carry their OWN requestAt.
    const requestAts = new Set(
        messagePairs.slice(3).map(r => r.request_at),
    );
    assert.equal(requestAts.size, 1);
});

test('a duplicate work-order create (same WO id) records'
+ ' Supersedes on its NEW document message pair, never Follows',
async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C2, WO_C2_FWO_A, FLOW_C2),
    ));
    assert.equal(first.status, 201);
    const firstDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C2,
    );
    assert.ok(
        firstDocumentRow, 'no document message pair on first create',
    );
    const firstDocumentId = firstDocumentRow!.id;

    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(
            WO_C2, WO_C2_FWO_B, FLOW_C2, 'wo-c2-revised',
        ),
    ));
    assert.equal(second.status, 201);
    const secondDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C2,
        firstDocumentId,
    );
    assert.ok(secondDocumentRow, 'no second document message pair');
    const secondDocumentResponse = await db.messagePairs.getById(
        secondDocumentRow!.id,
    );
    assert.equal(
        'supersedes' in secondDocumentResponse, false,
    );

    for (const response of await db.messagePairs.getAll()) {
        assert.equal('follows' in response, false);
    }
});

test('a duplicate work-order create\'s own OPERATION pair'
+ ' stores no predecessor column', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C3, WO_C3_FWO_A, FLOW_C3),
    ));
    assert.equal(first.status, 201);
    const firstDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C3,
    );
    assert.ok(firstDocumentRow);

    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C3, WO_C3_FWO_B, FLOW_C3),
    ));
    assert.equal(second.status, 201);
    const secondOperationId = second.headers.get('Response-ID');
    assert.ok(secondOperationId);
    const secondOperationResponse = await db.messagePairs.getById(
        secondOperationId!,
    );
    assert.equal(
        'supersedes' in secondOperationResponse, false,
    );
});

test('a work-order create ignores a raw colliding states'
+ ' row (states ROW half stripped)', async () => {
    const db = await freshDb();
    const flowWorkOrderId = WO_C4_FWO;
    // Phase Final Task 2: states ROW half stripped — raw
    // collision no longer aborts the message-plane create.
    // Phase Final Stage B: states table retired.
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(
            WO_C4, flowWorkOrderId, FLOW_C4,
        ),
    ));
    assert.equal(res.status, 201);
    // 2 seed pairs (org+membership) + 4 create pairs
    // (operation, document, join, genesis claim).
    assert.equal((await db.messagePairs.getAll()).length, 6);
    assert.equal((await db.messagePairs.getAll()).length, 6);
});
