import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { EntityNotFoundError } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { GET, PUT } from './in-page-facade.ts';
import {
    memoryDbAdapter,
} from '../api/db-memory.ts';
import {
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import type {
    WorkOrderFlowGraph,
    MessagePairEntity,
} from '../shared/types.ts';
import { ValidationError } from '../shared/types.ts';
import {
    validateWorkOrderDocumentBody,
    validateWorkOrderVersion,
} from '../api/validators.ts';
import { postWorkOrderDocumentOp } from '../api/routes.ts';
import {
    formWriteMessagePair,
    responseRecordOf,
} from '../api/message-pair.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';


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

Deno.test('a work-order body with organization_id is 400', async () => {
    assertThrows(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        }),
        ValidationError,
    );
    const db = await freshDb();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + generateIdentifier(),
        token: DEV_TOKEN,
        body: {
            ...documentFields(),
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        },
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'unexpected key "organization_id" for'
            + ' WorkOrderDocumentBody',
    });
});

Deno.test('validateWorkOrderDocumentBody accepts the entity fields'
+ ' with organization_id absent', () => {
    const doc = validateWorkOrderDocumentBody(documentFields());
    assertEquals(doc.entity, documentFields());
});

Deno.test('validateWorkOrderDocumentBody rejects a trio key at the'
+ ' gate (the stateless covenant, validator-enforced)', () => {
    assertThrows(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state: 'active',
        }),
        ValidationError,
    );
    assertThrows(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state_at: '2026-01-01T00:00:00.000000Z',
        }),
        ValidationError,
    );
    assertThrows(
        () => validateWorkOrderDocumentBody({
            ...documentFields(),
            state_event_id: 'ev-1',
        }),
        ValidationError,
    );
});

// -- 2. postWorkOrderDocumentOp (below-gate, MemoryDbAdapter) --

// Only the POST creates: the op reads the head first, so an
// absent work order is the head read's miss and nothing lands.
Deno.test('the document op refuses an absent work order',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = documentFields();
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
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    const before = (await db.messagePairs.getAll()).length;
    await assertRejects(
        () => postWorkOrderDocumentOp(
            db, 'yAhMcJGxllmQkLemOQjCmA', body,
            'XXZruirZyAOoRpNxaDnpSA', messagePair,
            'AjdvjuECVZEgZoFajaIEkg',
        ),
        EntityNotFoundError,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

// -- 3. a same-body resend (the shadow-ledger pin's sibling
// at the op level — see tests/api-idea-document.test.ts's own
// "a byte-identical resend converges" case). The resend names
// the head with If-Match; the statement matches its body
// against that head, so nothing lands (Decision 11). --------

Deno.test('a same-body PUT resend under the head\'s tag to'
    + ' organizations/:id/work-orders/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = await freshDb();
    const body = documentFields();
    const head = await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id: WO_RESEND,
        fields: body,
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const second = (await PUT(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + WO_RESEND
            , body, DEV_TOKEN,
        operationIdHeader([
            ['If-Match', head.query('header.etag').toText()],
        ])))
            .body().toValue();
    assertEquals(head.body().toValue(), second);
    // The schema's rows and the create's three: the fields
    // equal the head's, so the statement stores nothing.
    assertStrictEquals((await db.messagePairs.getAll()).length, 6);
    assertStrictEquals((await db.messagePairs.getAll()).length, 6);
});

// -- 4. postWorkOrderCreationOp's synthesized create pairs
// (Phase 5 Task 3, the flow-creation-triple precedent): a live
// POST /work-orders now forms THREE pairs pre-tx — the gate's
// own operation message pair (shares the WO's document,
// per the registry-driven create-document override),
// a synthesized document message pair (PUT-shaped, at the
// WO's own document), and a synthesized join pair
// (PUT-shaped, at the
// organizations/:id/flows/:id/work-orders/:woid document).
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
    });
}

// The workOrder facet reuses documentFields() — the SAME
// {display_id, flow_graph, position} shape section 1 above
// already validates — so the create body and the synthesized
// document message pair's expected body are ONE construction,
// never two divergent literals. `displayId` defaults to
// documentFields()'s own value; a duplicate-create test
// overrides it so the SECOND create's document sub-body
// genuinely differs from the first's.
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

// The PUT-shaped row at a given document, excluding a prior
// id — never positional (an index-0/AjdvjuECVZEgZoFajaIEkg read is an
// implicit
// arrival-order dependency, the H7 hazard class): filter by
// document AND method instead.
function documentRowAt(
    messagePairs: readonly MessagePairEntity[],
    prefix: string,
    name: string,
    excludeId?: string,
): MessagePairEntity | undefined {
    return messagePairs.find(
        r => r.path === prefix
            && r.name === name
            && r.id !== excludeId
            && r.method === 'PUT',
    );
}

const ENTITY_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/';

Deno.test('a work-order create appends a PUT-shaped document'
+ ' message pair at the WO document and a PUT-shaped join pair'
+ ' at the join document, all three sharing one operation id',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C1, WO_C1_FWO, 'aNoIDzecmwfawmsLSsDsPw'),
    ));
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    const messagePairs = await db.messagePairs.getAll();
    assertStrictEquals(messagePairs.length, 6);

    const documentRow =
        documentRowAt(messagePairs, ENTITY_PREFIX, WO_C1);
    assert(
        documentRow, 'no document message pair at the WO document',
    );
    const version = validateWorkOrderVersion(
        responseRecordOf(documentRow!.response)!,
    );
    assertEquals(
        {
            display_id: version.display_id,
            flow_graph: version.flow_graph,
            position: version.position,
        },
        documentFields(),
    );

    const joinPrefix =
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/aNoIDzecmwfawmsLSsDsPw/'
            + 'work-orders/';
    const joinRow =
        documentRowAt(messagePairs, joinPrefix, WO_C1_FWO);
    assert(joinRow, 'no join pair at the join document');

    // slice(4): the nil root, then the fixture's own
    // root-admin pairs (organization document + role grant
    // + membership) precede every test write.
    const requestAts = new Set(
        messagePairs.slice(4).map(r => r.operation_id),
    );
    assertStrictEquals(requestAts.size, 1);
});

Deno.test('a duplicate work-order create (same WO id) is 409'
+ ' and records no second document message pair',
async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C2, WO_C2_FWO_A, FLOW_C2),
    ));
    assertStrictEquals(first.status, 201);
    const firstDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C2,
    );
    assert(
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
    assertStrictEquals(second.status, 409);
    await second.body?.cancel();
    const secondDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C2,
        firstDocumentId,
    );
    assertStrictEquals(secondDocumentRow, undefined);

    for (const response of await db.messagePairs.getAll()) {
        assertStrictEquals('follows' in response, false);
    }
});

Deno.test('a duplicate work-order create\'s operation shares'
+ ' the document name and is 409 over that head', async () => {
    const db = await freshDb();
    const first = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(WO_C3, WO_C3_FWO_A, FLOW_C3),
    ));
    assertStrictEquals(first.status, 201);
    const firstDocumentRow = documentRowAt(
        await db.messagePairs.getAll(), ENTITY_PREFIX, WO_C3,
    );
    assert(firstDocumentRow);

    // The create declares its genesis, so a taken name
    // refuses whatever the body.
    const second = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , DEV_TOKEN,
        workOrderCreateBody(
            WO_C3, WO_C3_FWO_B, FLOW_C3, 'wo-c3-revised',
        ),
    ));
    assertStrictEquals(second.status, 409);
    assertEquals(await second.json(), {
        error: 'Document already exists at ' + ENTITY_PREFIX
            + WO_C3,
    });
    const head = await db.messagePairs.getHeadPair(
        ENTITY_PREFIX, WO_C3,
    );
    assertStrictEquals(head?.id, firstDocumentRow!.id);
});

Deno.test('a work-order create ignores a raw colliding states'
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
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
    // The fixture's pairs + 3 create pairs (operation,
    // version, join).
    assertStrictEquals((await db.messagePairs.getAll()).length, 6);
    assertStrictEquals((await db.messagePairs.getAll()).length, 6);
});

// -- 5. the PUT is its own version ---------------------------

Deno.test('a work-order PUT with neither conditional is 428',
async () => {
    const db = await freshDb();
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + generateIdentifier(),
        token: DEV_TOKEN,
        body: documentFields(),
    }));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

for (const [label, headers] of [
    ['If-Match', { 'If-Match': '"' + generateIdentifier()
        + '"' }],
    ['If-None-Match: *', { 'If-None-Match': '*' }],
] as const) {
    Deno.test('a work-order PUT with ' + label
    + ' on an absent work order is 404', async () => {
        const db = await freshDb();
        const before = (await db.messagePairs.getAll())
            .length;
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: ENTITY_PREFIX + generateIdentifier(),
            token: DEV_TOKEN,
            headers,
            body: documentFields(),
        }));
        assertStrictEquals(res.status, 404);
        await res.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    });
}

Deno.test('a work-order PUT on a foreign work order is'
+ ' 403', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: documentFields(),
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + id,
        token: await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA',
            'BBjWJsjYIDkTRKIIPrzWRw',
        ),
        headers: { 'If-None-Match': '*' },
        body: documentFields(),
    }));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});

Deno.test('If-None-Match: * on a work order that exists is'
+ ' 412 and stores nothing', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const head = await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: documentFields(),
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + id,
        token: DEV_TOKEN,
        headers: { 'If-None-Match': '*' },
        body: { ...documentFields(), position: 9 },
    }));
    assertStrictEquals(res.status, 412);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    const after = await handleRequest(db, apiRequest({
        method: 'GET', path: ENTITY_PREFIX + id,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(
        after.headers.get('etag'),
        head.query('header.etag').toText(),
    );
    await after.body?.cancel();
});

const KEEP_FLOW = generateIdentifier();
const KEEP_TYPE = generateIdentifier();
const KEEP_ATTRIBUTE = generateIdentifier();
const KEEP_INSTANCE = generateIdentifier();
const KEEP_WO = generateIdentifier();

// A work order with a state and a claim (its create) and a
// binding, through the live routes.
async function claimedBoundWorkOrder(
    db: Awaited<ReturnType<typeof freshDb>>,
): Promise<void> {
    const at = '2026-01-01T00:00:00.000000Z';
    const typePath = '/organizations/AjdvjuECVZEgZoFajaIEkg'
        + '/record-types/' + KEEP_TYPE;
    const writes: [string, string, unknown, Record<string, string>][] = [
        ['POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', {
            id: KEEP_FLOW,
            flow: {
                name: 'Keep Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: KEEP_FLOW,
                at,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: at,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        }, {}],
        ['PUT', typePath, {
            name: 'Keep Type',
            description: '',
            position: 1,
            state: 'active',
        }, {}],
        ['PUT', typePath + '/attributes/' + KEEP_ATTRIBUTE, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: ['admin', 'member'],
            write_roles: ['admin', 'member'],
        }, {}],
        ['PATCH', typePath + '/instances/' + KEEP_INSTANCE, {
            set: [{ attribute_id: KEEP_ATTRIBUTE, value: 'x' }],
        }, { 'If-None-Match': '*' }],
        ['PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + KEEP_FLOW + '/records/' + generateIdentifier(), {
            flow_id: KEEP_FLOW,
            record_id: KEEP_TYPE,
            at,
        }, {}],
        ['POST', ENTITY_PREFIX, workOrderCreateBody(
            KEEP_WO, generateIdentifier(), KEEP_FLOW,
        ), {}],
    ];
    for (const [method, path, body, headers] of writes) {
        const res = await handleRequest(db, apiRequest({
            method, path, token: DEV_TOKEN, body, headers,
        }));
        assertStrictEquals(res.status, 201, method + ' ' + path);
        await res.body?.cancel();
    }
    const read = await GET(
        db, ENTITY_PREFIX.slice(1) + KEEP_WO, DEV_TOKEN,
        operationIdHeader(),
    );
    const bound = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + KEEP_WO + '/binding',
        token: DEV_TOKEN,
        body: {
            instance_id: KEEP_INSTANCE,
            record_type_id: KEEP_TYPE,
        },
        headers: { 'If-Match': read.query('header.etag').toText() },
    }));
    assertStrictEquals(bound.status, 200);
    await bound.body?.cancel();
}

Deno.test('a work-order PUT keeps the head\'s facets', async () => {
    const db = await freshDb();
    await claimedBoundWorkOrder(db);
    const read = await GET<Record<string, unknown>>(
        db, ENTITY_PREFIX.slice(1) + KEEP_WO, DEV_TOKEN,
        operationIdHeader(),
    );
    const fields = { ...documentFields(), position: 7 };
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + KEEP_WO,
        token: DEV_TOKEN,
        body: fields,
        headers: { 'If-Match': read.query('header.etag').toText() },
    }));
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), {
        ...read.body().toValue(),
        ...fields,
        events: [],
    });
    const head = read.body().toValue() as {
        state?: string;
        claim?: unknown;
        instance_id?: string;
        record_type_id?: string;
    };
    assertStrictEquals(head.state, NODE_FINISH);
    assert(head.claim !== undefined);
    assertStrictEquals(head.instance_id, KEEP_INSTANCE);
    assertStrictEquals(head.record_type_id, KEEP_TYPE);
});

Deno.test('a work-order GET streams its head with its ETag',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: documentFields(),
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const get = await handleRequest(db, apiRequest({
        method: 'GET',
        path: ENTITY_PREFIX + id,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(get.status, 200);
    const head = await db.messagePairs.getHeadPair(
        ENTITY_PREFIX, id,
    );
    assert(head !== null);
    assertStrictEquals(pairIdOf(get), head.id);
    assertEquals(await get.json(), responseRecordOf(head.response));
});
