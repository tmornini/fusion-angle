import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { sha256Hex } from '../shared/digest.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    jsonObjectField,
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    WorkOrderFlowGraph,
    RequestEntity,
} from '../api/types.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import {
    validateWorkOrderDocumentBody,
} from '../api/validators.ts';

const BASE = 'http://localhost';

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

function createBody(id: string, flowWorkOrderId: string) {
    return {
        id,
        workOrder: {
            display_id: 'abcd',
            flow_graph: flowGraph(),
            position: 1,
        },
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: 'flow-1',
            work_order_id: id,
            at: nowUtc(),
        },
        stateEventIds: ['ev-1-' + id, 'ev-2-' + id, 'ev-3-' + id],
        states: ['n-start', 'n-finish', 'claimed'],
        stateEventAts: [
            '2099-01-01T00:00:00.000000Z',
            '2099-01-01T00:00:00.000001Z',
            '2099-01-01T00:00:00.000002Z',
        ],
    };
}

async function createWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    id: string,
): Promise<Response> {
    return handleRequest(db, req(
        'POST', '/work-orders', token,
        createBody(id, id + '-fwo'),
    ));
}

function claimBody() {
    return {
        claimEventId: generateCryptoSafeBase62(),
        claimAt: nowUtc(),
        expireEventId: generateCryptoSafeBase62(),
        expireAt: nowUtc(),
    };
}

function transitionBody() {
    return {
        transitionEventId: generateCryptoSafeBase62(),
        targetState: 'n-finish',
        fieldValues: [],
        release: null,
        transitionAt: nowUtc(),
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

// The PUT-shaped row at a given address — never positional
// (Task 3: two rows, the operation pair and the synthesized
// document pair, now share the WO's own address, so an
// index-0 read is an implicit arrival-order dependency, the
// H7 hazard class). Filter by address AND method instead.
function putShapedRowsAt(
    requests: readonly RequestEntity[],
    prefix: string,
    uriId: string,
): RequestEntity[] {
    return requests.filter(
        r => r.uri_prefix === prefix
            && r.uri_id === uriId
            && decodeRequestMessage(r.message).method === 'PUT',
    );
}

test('a work-order create appends three pairs: the operation'
+ ' and document pairs share the entity address, the join'
+ ' pair lands at its own address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createWorkOrder(db, token, 'wo-1');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 6);
    assert.equal(responses.length, 6);

    const atEntityAddress = requests.filter(
        r => r.uri_prefix === '/organizations/1/work-orders/'
            && r.uri_id === 'wo-1',
    );
    assert.equal(atEntityAddress.length, 2);
    const putRowsAtEntityAddress = putShapedRowsAt(
        requests, '/organizations/1/work-orders/', 'wo-1',
    );
    assert.equal(putRowsAtEntityAddress.length, 1);
});

test('a work-order create\'s document pair body validates as'
+ ' a WorkOrderDocumentBody matching the created work'
+ ' order\'s own fields', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createWorkOrder(db, token, 'wo-1b');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const documentRows = putShapedRowsAt(
        requests, '/organizations/1/work-orders/', 'wo-1b',
    );
    assert.equal(documentRows.length, 1);
    const documentBody =
        decodeRequestMessage(documentRows[0]!.message).body;
    assert.deepEqual(
        validateWorkOrderDocumentBody(documentBody).entity,
        {
            display_id: 'abcd',
            flow_graph: flowGraph(),
            position: 1,
        },
    );
});

test('a work-order create\'s join pair lands at the'
+ ' flow/work-orders address, PUT-shaped, at the join id',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await createWorkOrder(db, token, 'wo-1c');
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const joinRows = putShapedRowsAt(
        requests,
        '/organizations/1/flows/flow-1/work-orders/',
        'wo-1c-fwo',
    );
    assert.equal(joinRows.length, 1);
});

test('a failed work-order create appends none of the three'
+ ' pairs (whole-tx abort)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await db.states.put('ev-2-wo-doomed', {
        entity_id: 'other',
        state: 'n-finish',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const res = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createBody('wo-doomed', 'fwo-doomed'),
    ));
    assert.equal(res.status, 409);
    assert.equal((await db.requests.getAll()).length, 3);
    assert.equal((await db.responses.getAll()).length, 3);
});

test('a claim appends its pair at an operation address:'
+ ' uriId stays empty', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createWorkOrder(db, token, 'wo-2');
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo-2/claim', token, claimBody(),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const claimRow = requests.find(
        r => r.uri_prefix
            === '/organizations/1/work-orders/wo-2/claim/',
    );
    assert.ok(claimRow);
    assert.equal(claimRow!.uri_id, '');
});

test('a repeat idempotent claim by the same holder still'
+ ' appends its own pair (no crash, counts stay'
+ ' balanced)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createWorkOrder(db, token, 'wo-3');
    const first = await handleRequest(db, req(
        'POST', '/work-orders/wo-3/claim', token, claimBody(),
    ));
    assert.equal(first.status, 204);
    const second = await handleRequest(db, req(
        'POST', '/work-orders/wo-3/claim', token, claimBody(),
    ));
    assert.equal(second.status, 204);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    const claimRows = requests.filter(
        r => r.uri_prefix
            === '/organizations/1/work-orders/wo-3/claim/',
    );
    assert.equal(claimRows.length, 2);
});

test('a transition appends its pair at an operation'
+ ' address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createWorkOrder(db, token, 'wo-4');
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo-4/transition', token,
        transitionBody(),
    ));
    assert.equal(res.status, 204);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_prefix
            === '/organizations/1/work-orders/wo-4/'
                + 'transition/',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, '');
});

test('PUT a flow-work-order join appends its pair at the'
+ ' join address and the wire body matches a domain'
+ ' read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createWorkOrder(db, token, 'wo-5');
    const at = nowUtc();
    const res = await handleRequest(db, req(
        'PUT', '/flows/flow-1/work-orders/fwo-join', token,
        { flow_id: 'flow-1', work_order_id: 'wo-5', at },
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    // Task 3: createWorkOrder above ALSO synthesizes a join
    // pair at this same prefix (its own flowWorkOrderId
    // 'wo-5-fwo') — a prefix-only find() would match that row
    // first (inserted before this explicit PUT) instead of
    // this test's own pair, so the uri_id filter is required,
    // not merely defensive.
    const row = requests.find(
        r => r.uri_prefix
            === '/organizations/1/flows/flow-1/work-orders/'
            && r.uri_id === 'fwo-join',
    );
    assert.ok(row);
    assert.equal(row!.uri_id, 'fwo-join');
    const domainRow =
        await db.flowWorkOrders.getById('fwo-join');
    assert.deepEqual(await res.json(), domainRow);
});

test('stored messages verify against their hashes',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await createWorkOrder(db, token, 'wo-6');
    await handleRequest(db, req(
        'POST', '/work-orders/wo-6/claim', token, claimBody(),
    ));
    await handleRequest(db, req(
        'POST', '/work-orders/wo-6/transition', token,
        transitionBody(),
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
    await createWorkOrder(db, token, 'wo-7');
    await handleRequest(db, req(
        'POST', '/work-orders/wo-7/claim', token, claimBody(),
    ));
    await handleRequest(db, req(
        'POST', '/work-orders/wo-7/transition', token,
        transitionBody(),
    ));
    await db.states.put('ev-2-wo-fail', {
        entity_id: 'other',
        state: 'n-finish',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createBody('wo-fail', 'fwo-fail'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});

// ── PUT work-orders/:id (the entity itself — gap fix) ──

function workOrderFields(displayId: string) {
    return {
        display_id: displayId,
        flow_graph: flowGraph(),
        position: 1,
    };
}

test('a PUT to a fresh work order appends its pair at the'
+ ' entity address', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders/wo-8', token,
        workOrderFields('wo-8-display'),
    ));
    assert.equal(res.status, 200);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, 4);
    assert.equal(
        requests[3]!.uri_prefix,
        '/organizations/1/work-orders/',
    );
    assert.equal(requests[3]!.uri_id, 'wo-8');
    const responses = await db.responses.getAll();
    assert.equal(responses[3]!.id, requests[3]!.id);
});

test('a second PUT to the same work order records'
+ ' supersedes', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const first = await handleRequest(db, req(
        'PUT', '/work-orders/wo-9', token,
        workOrderFields('First'),
    ));
    assert.equal(first.status, 200);
    const firstId = first.headers.get('Response-ID');
    assert.ok(firstId);
    assert.equal(first.headers.get('Supersedes'), null);
    const second = await handleRequest(db, req(
        'PUT', '/work-orders/wo-9', token,
        workOrderFields('Second'),
    ));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('Supersedes'), firstId);
});

test('the PUT work-orders/:id wire body matches a direct'
+ ' domain read', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/work-orders/wo-10', token,
        workOrderFields('Wired'),
    ));
    assert.equal(res.status, 200);
    const workOrderRow =
        await db.workOrders.getById('wo-10');
    assert.deepEqual(await res.json(), workOrderRow);
});

test('a byte-identical PUT resend to work-orders/:id returns'
+ ' the stored response and appends nothing', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = workOrderFields('Idempotent');
    const first = await handleRequest(db, req(
        'PUT', '/work-orders/wo-11', token, body,
    ));
    const firstId = first.headers.get('Response-ID');
    const second = await handleRequest(db, req(
        'PUT', '/work-orders/wo-11', token, body,
    ));
    assert.equal(second.headers.get('Response-ID'), firstId);
    assert.equal((await db.requests.getAll()).length, 4);
    assert.equal((await db.responses.getAll()).length, 4);
});

test('request and response counts stay balanced across a'
+ ' mix of work-orders/:id PUTs and one failed create',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    await handleRequest(db, req(
        'PUT', '/work-orders/wo-12', token,
        workOrderFields('Mixed'),
    ));
    await handleRequest(db, req(
        'PUT', '/work-orders/wo-12', token,
        workOrderFields('Mixed Again'),
    ));
    await db.states.put('ev-2-wo-fail2', {
        entity_id: 'other',
        state: 'n-finish',
        member_id: 'current',
        at: '2020-01-01T00:00:00.000000Z',
    });
    const failed = await handleRequest(db, req(
        'POST', '/work-orders', token,
        createBody('wo-fail2', 'fwo-fail2'),
    ));
    assert.equal(failed.status, 409);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
});
