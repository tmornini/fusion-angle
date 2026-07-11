import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT, handleRequest } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import type {
    WorkOrderFlowGraph,
    RequestEntity,
} from '../api/types.ts';
import { ValidationError } from '../api/types.ts';
import {
    validateWorkOrderDocumentBody,
} from '../api/validators.ts';
import { postWorkOrderDocumentOp } from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// Phase 5 Task 2 (fourth-family, 'stateless' evidence): PUT
// /work-orders/:id takes the entity's OWN fields only — no
// lifecycle trio, unlike ideas/projects/flows (Decision 7). A
// work order's lifecycle is written ONLY by the create/claim/
// transition/release ops, so a body carrying state/state_at/
// state_event_id 400s at the gate
// (validateWorkOrderDocumentBody), and the op posts no states
// event of its own.

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The frozen flow graph a work order carries, stored as the raw
// JSON string the work_orders.flow_graph column holds — the
// SAME fixture shape as api-work-orders-create.test.ts's own
// flowGraph() (each test file is an isolated world).
function flowGraph(): string {
    const graph: WorkOrderFlowGraph = {
        name: 'Test flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-finish', name: 'Done',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'e1', name: '',
                fromNodeId: 'n-start', toNodeId: 'n-finish',
            },
        ],
    };
    return jsonObjectField(
        graph as unknown as Record<string, unknown>,
    );
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
        organization_id: '1',
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
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = {
        ...documentFields(),
        organization_id: '1',
    };
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/work-orders/wo-doc-op-1',
        routePattern: 'work-orders/:id',
        routeSegments: ['work-orders', ':id'],
        pathSegments: ['work-orders', 'wo-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: '1',
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    const written = await postWorkOrderDocumentOp(
        db, 'wo-doc-op-1', body, 'current', pair,
    );
    assert.deepEqual(written, {
        organization_id: '1',
        ...documentFields(),
    });
    // Phase Final Stage B: work_orders table retired.
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 3. byte-identical resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-idea-document.test.ts's own
// "a byte-identical resend converges" case). This exercises the
// CURRENT hand-written work-orders/:id PUT (unchanged until the
// absorption commit registers WORK_ORDERS_WIRING) — the fast
// path lives at the gate (api.ts), agnostic to which op serves
// the route, so this pin holds unchanged straight through the
// absorption (finding 11: wire-byte parity). -----------------

test('a byte-identical PUT resend to work-orders/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = await freshDb();
    const body = documentFields();
    const first = await PUT(
        db, 'work-orders/wo-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'work-orders/wo-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

// -- 4. postWorkOrderCreationOp's synthesized create pairs
// (Phase 5 Task 3, the flow-creation-triple precedent): a live
// POST /work-orders now forms THREE pairs pre-tx — the gate's
// own operation pair (shares the WO's document address, per
// the registry-driven create-address override), a synthesized
// document pair (PUT-shaped, at the WO's own address), and a
// synthesized join pair (PUT-shaped, at the
// flows/:id/work-orders/:woid address). ----------------------

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`http://localhost${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// The workOrder facet reuses documentFields() — the SAME
// {display_id, flow_graph, position} shape section 1 above
// already validates — so the create body and the synthesized
// document pair's expected body are ONE construction, never
// two divergent literals. `displayId` defaults to
// documentFields()'s own value; a duplicate-create test
// overrides it so the SECOND create's document sub-body
// genuinely differs from the first's — the document pair's
// hash covers ONLY {display_id, flow_graph, position}
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
            'ev-1-' + flowWorkOrderId,
            'ev-2-' + flowWorkOrderId,
            'ev-3-' + flowWorkOrderId,
        ],
        states: ['n-start', 'n-finish', 'claimed'],
        stateEventAts: [
            '2099-01-01T00:00:00.000000Z',
            '2099-01-01T00:00:00.000001Z',
            '2099-01-01T00:00:00.000002Z',
        ],
    };
}

// Decode a stored request row's canonical message back into
// its method + body — the SAME decode
// tests/api-flow-document.test.ts's own decodeRequestMessage
// performs, reconstructed here read-only (each test file is
// an isolated world).
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
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

// The PUT-shaped row at a given address, excluding a prior
// id — never positional (an index-0/1 read is an implicit
// arrival-order dependency, the H7 hazard class): filter by
// address AND method instead.
function documentRowAt(
    requests: readonly RequestEntity[],
    prefix: string,
    uriId: string,
    excludeId?: string,
): RequestEntity | undefined {
    return requests.find(
        r => r.uri_prefix === prefix
            && r.uri_id === uriId
            && r.id !== excludeId
            && decodeRequestMessage(r.message).method === 'PUT',
    );
}

const ENTITY_PREFIX = '/organizations/1/work-orders/';

test('a work-order create appends a PUT-shaped document pair'
+ ' at the WO address and a PUT-shaped join pair at the join'
+ ' address, all three sharing one requestAt', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody('wo-c1', 'wo-c1-fwo', 'flow-c1'),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 6);
    assert.equal(responses.length, 6);

    const documentRow =
        documentRowAt(requests, ENTITY_PREFIX, 'wo-c1');
    assert.ok(documentRow, 'no document pair at the WO address');
    assert.deepEqual(
        validateWorkOrderDocumentBody(
            decodeRequestMessage(documentRow!.message).body,
        ).entity,
        documentFields(),
    );

    const joinPrefix =
        '/organizations/1/flows/flow-c1/work-orders/';
    const joinRow =
        documentRowAt(requests, joinPrefix, 'wo-c1-fwo');
    assert.ok(joinRow, 'no join pair at the join address');

    // slice(3): the fixture's own root-admin pairs (organization
    // document + role grant + membership, Phase 13 Tasks 1 and 3)
    // precede every test write and carry their OWN requestAt.
    const requestAts = new Set(
        requests.slice(3).map(r => r.at),
    );
    assert.equal(requestAts.size, 1);
});

test('a duplicate work-order create (same WO id) records'
+ ' Supersedes on its NEW document pair, never Follows',
async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody('wo-c2', 'wo-c2-fwo-a', 'flow-c2'),
    ));
    assert.equal(first.status, 204);
    const firstDocumentRow = documentRowAt(
        await db.requests.getAll(), ENTITY_PREFIX, 'wo-c2',
    );
    assert.ok(
        firstDocumentRow, 'no document pair on first create',
    );
    const firstDocumentId = firstDocumentRow!.id;

    const second = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody(
            'wo-c2', 'wo-c2-fwo-b', 'flow-c2', 'wo-c2-revised',
        ),
    ));
    assert.equal(second.status, 204);
    const secondDocumentRow = documentRowAt(
        await db.requests.getAll(), ENTITY_PREFIX, 'wo-c2',
        firstDocumentId,
    );
    assert.ok(secondDocumentRow, 'no second document pair');
    const secondDocumentResponse = await db.responses.getById(
        secondDocumentRow!.id,
    );
    assert.equal(
        secondDocumentResponse.supersedes, firstDocumentId,
    );

    for (const response of await db.responses.getAll()) {
        assert.equal(response.follows, undefined);
    }
});

test('a duplicate work-order create\'s own OPERATION pair'
+ ' also records Supersedes == the first DOCUMENT pair\'s'
+ ' id', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody('wo-c3', 'wo-c3-fwo-a', 'flow-c3'),
    ));
    assert.equal(first.status, 204);
    const firstDocumentRow = documentRowAt(
        await db.requests.getAll(), ENTITY_PREFIX, 'wo-c3',
    );
    assert.ok(firstDocumentRow);
    const firstDocumentId = firstDocumentRow!.id;

    const second = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody('wo-c3', 'wo-c3-fwo-b', 'flow-c3'),
    ));
    assert.equal(second.status, 204);
    const secondOperationId = second.headers.get('Response-ID');
    assert.ok(secondOperationId);
    const secondOperationResponse = await db.responses.getById(
        secondOperationId!,
    );
    assert.equal(
        secondOperationResponse.supersedes, firstDocumentId,
    );
});

test('a work-order create ignores a raw colliding states'
+ ' row (states ROW half stripped)', async () => {
    const db = await freshDb();
    const flowWorkOrderId = 'wo-c4-survives-fwo';
    // Phase Final Task 2: states ROW half stripped — raw
    // collision no longer aborts the pair-plane create.
    // Phase Final Stage B: states table retired.
    const res = await handleRequest(db, req(
        'POST', '/work-orders', DEV_TOKEN,
        workOrderCreateBody(
            'wo-c4-survives', flowWorkOrderId, 'flow-c4',
        ),
    ));
    assert.equal(res.status, 204);
    // 3 bootstrap pairs + 3 create pairs (op/document/join).
    assert.equal((await db.requests.getAll()).length, 6);
    assert.equal((await db.responses.getAll()).length, 6);
});
