import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { generateIdentifier } from '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { listenHttp, NO_STORE } from '../server/http-server.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    seedAIMember,
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';
import {
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { apiRequest, partsOf } from './http-fixtures.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';

// A work-orders QUERY serves the collection GET's parts
// whose work orders match the search text, best first. A
// work order matches on its own fields and on what its
// flow, its members, and its bound record serve this
// caller, never on a value the caller's GET would hide.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const OTHER_ORGANIZATION = 'BBjWJsjYIDkTRKIIPrzWRw';
const ADMIN_IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';
const MEMBER_IDENTITY = 'nkgaOHZISTQrILTfPThWCA';
const MEMBER_NAME = 'Zebulon Quartermaine';
const AI_IDENTITY = generateIdentifier();
const HIDDEN_VALUE = 'classified-salary-90000';
const OPEN_VALUE = 'Marigold';

const ORGANIZATION_PATH = '/organizations/' + ORGANIZATION;
const WORK_ORDERS = ORGANIZATION_PATH + '/work-orders/';

type Order = {
    readonly id: string,
    readonly flowId: string,
    readonly nodeId: string,
};

type World = {
    readonly db: MemoryDbAdapter,
    readonly adminToken: string,
    readonly memberToken: string,
};

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
    });
}

async function created(
    db: MemoryDbAdapter,
    request: Request,
): Promise<Response> {
    const res = await handleRequest(db, request);
    assert(
        res.status === 200 || res.status === 201,
        request.method + ' ' + request.url
            + ' answered ' + res.status,
    );
    return res;
}

async function landed(
    db: MemoryDbAdapter,
    request: Request,
): Promise<void> {
    await (await created(db, request)).body?.cancel();
}

async function etagOf(
    db: MemoryDbAdapter,
    path: string,
    token: string,
): Promise<string> {
    const res = await handleRequest(db, req('GET', path, token));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    return res.headers.get('ETag')!;
}

async function world(): Promise<World> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedHumanMember(db, MEMBER_IDENTITY, MEMBER_NAME);
    return {
        db,
        adminToken: await organizationToken(
            ADMIN_IDENTITY, ORGANIZATION,
        ),
        memberToken: await organizationToken(
            MEMBER_IDENTITY, ORGANIZATION,
        ),
    };
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

async function seedFlow(
    { db, adminToken }: World,
    id: string,
    name: string,
): Promise<void> {
    await landed(db, req(
        'POST', ORGANIZATION_PATH + '/flows/', adminToken, {
            id,
            flow: flowFields(name),
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: id,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
}

// A work order on a flow of its own, sitting at a node
// named `nodeName`; its graph is frozen as `graphName`.
async function seedOrder(
    w: World,
    order: {
        readonly flowName: string,
        readonly graphName: string,
        readonly displayId: string,
        readonly nodeName: string,
        readonly taskInstructions: string,
    },
): Promise<Order> {
    const id = generateIdentifier();
    const flowId = generateIdentifier();
    const nodeId = generateIdentifier();
    await seedFlow(w, flowId, order.flowName);
    await seedCreatedWorkOrder(w.db, {
        organization: ORGANIZATION,
        id,
        fields: {
            display_id: order.displayId,
            flow_graph: {
                name: order.graphName,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [{
                    id: nodeId,
                    name: order.nodeName,
                    positionX: 0,
                    positionY: 0,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                    taskInstructions: order.taskInstructions,
                }],
                edges: [],
            },
            position: 1,
        },
        flowId,
        births: [nodeId, nodeId],
        at: AT,
        token: w.adminToken,
        claim: 'released',
    });
    return { id, flowId, nodeId };
}

// Two work orders: one on "Approval", one on "Shipping".
async function twoOrders(): Promise<{
    w: World,
    approval: Order,
    shipping: Order,
}> {
    const w = await world();
    const approval = await seedOrder(w, {
        flowName: 'Approval',
        graphName: 'Approval',
        displayId: 'a7c3e1f9',
        nodeName: 'Inspection',
        taskInstructions: 'Verify the invoice totals',
    });
    const shipping = await seedOrder(w, {
        flowName: 'Shipping',
        graphName: 'Shipping',
        displayId: 'b8d4f2a0',
        nodeName: 'Packaging',
        taskInstructions: 'Wrap the parcel',
    });
    return { w, approval, shipping };
}

function query(
    db: MemoryDbAdapter,
    token: string,
    body: unknown,
): Promise<Response> {
    return handleRequest(db, req('QUERY', WORK_ORDERS, token, body));
}

async function matchedIds(
    db: MemoryDbAdapter,
    token: string,
    text: string,
): Promise<string[]> {
    const res = await query(db, token, { q: text });
    if (res.status === 204) {
        await res.body?.cancel();
        return [];
    }
    assertStrictEquals(res.status, 200);
    return (await partsOf<{ id: string }>(res))
        .map((part) => part.body().toValue().id);
}

async function claimBy(
    { db, adminToken }: World,
    workOrderId: string,
    token: string,
    expiresAt: string,
): Promise<void> {
    const path = WORK_ORDERS + workOrderId;
    await landed(db, req(
        'PUT', path + '/claim', token,
        {
            claimEventId: generateIdentifier(),
            claimAt: nowUtc(),
            expireEventId: generateIdentifier(),
            expireAt: nowUtc(),
            expires_at: expiresAt,
        },
        { [IF_MATCH_HEADER]: await etagOf(db, path, adminToken) },
    ));
}

type Binding = {
    readonly typeId: string,
    readonly openAttribute: string,
    readonly hiddenAttribute: string,
    readonly instanceId: string,
    readonly instanceDetail: string,
};

async function seedAttribute(
    { db, adminToken }: World,
    typeDetail: string,
    id: string,
    name: string,
    readRoles: readonly string[],
): Promise<void> {
    await landed(db, req(
        'PUT', typeDetail + '/attributes/' + id, adminToken, {
            name,
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...readRoles],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ));
}

// Binds the order to an instance of a record type with an
// open and an admin-only attribute, the instance holding
// `values` by attribute.
async function bound(
    w: World,
    order: Order,
    values: (binding: Binding) => readonly {
        attribute_id: string,
        value: string,
    }[],
): Promise<Binding> {
    const { db, adminToken } = w;
    const typeId = generateIdentifier();
    const typeDetail = ORGANIZATION_PATH + '/record-types/' + typeId;
    const instanceId = generateIdentifier();
    const binding = {
        typeId,
        openAttribute: generateIdentifier(),
        hiddenAttribute: generateIdentifier(),
        instanceId,
        instanceDetail: typeDetail + '/instances/' + instanceId,
    };
    await landed(db, req('PUT', typeDetail, adminToken, {
        name: 'Hiring',
        description: '',
        position: 1,
        state: 'active',
    }));
    await seedAttribute(
        w, typeDetail, binding.openAttribute, 'Title',
        DEFAULT_ATTRIBUTE_ACL_ROLES,
    );
    await seedAttribute(
        w, typeDetail, binding.hiddenAttribute, 'Salary',
        ['admin'],
    );
    await landed(db, req(
        'PATCH', binding.instanceDetail, adminToken,
        { set: values(binding) },
        { [IF_NONE_MATCH_HEADER]: '*' },
    ));
    const flowRecordId = generateIdentifier();
    await landed(db, req(
        'PUT',
        ORGANIZATION_PATH + '/flows/' + order.flowId
            + '/records/' + flowRecordId,
        adminToken,
        {
            id: flowRecordId,
            flow_id: order.flowId,
            record_id: typeId,
            at: AT,
        },
    ));
    const workOrder = WORK_ORDERS + order.id;
    await landed(db, req(
        'PUT', workOrder + '/binding', adminToken,
        { instance_id: instanceId, record_type_id: typeId },
        {
            [IF_MATCH_HEADER]:
                await etagOf(db, workOrder, adminToken),
        },
    ));
    return binding;
}

Deno.test('matches by flow name with a typo', async () => {
    const { w, approval } = await twoOrders();
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'aproval'),
        [approval.id],
    );
});

Deno.test('ranks an exact match above a typo', async () => {
    const w = await world();
    const typo = await seedOrder(w, {
        flowName: 'Aproval',
        graphName: 'Aproval',
        displayId: 'c1c1c1c1',
        nodeName: 'Start',
        taskInstructions: '',
    });
    const exact = await seedOrder(w, {
        flowName: 'Approval',
        graphName: 'Approval',
        displayId: 'd2d2d2d2',
        nodeName: 'Start',
        taskInstructions: '',
    });
    const got = await handleRequest(
        w.db, req('GET', WORK_ORDERS, w.memberToken),
    );
    assertEquals(
        (await partsOf<{ id: string }>(got))
            .map((part) => part.body().toValue().id),
        [typo.id, exact.id],
    );
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'approval'),
        [exact.id, typo.id],
    );
});

const FIELD_CASES: readonly (readonly [
    string, (approval: Order) => string,
])[] = [
    ['display id with its hash', () => '#a7c3e1f9'],
    ['whole work-order id', (approval) => approval.id],
    ['state name', () => 'inspection'],
    ['task instructions', () => 'invoice totals'],
    ['flow id', (approval) => approval.flowId],
];

for (const [label, textOf] of FIELD_CASES) {
    Deno.test('matches by ' + label, async () => {
        const { w, approval } = await twoOrders();
        assertEquals(
            await matchedIds(w.db, w.memberToken, textOf(approval)),
            [approval.id],
        );
    });
}

Deno.test('matches by claimant name', async () => {
    const { w, approval } = await twoOrders();
    await claimBy(
        w, approval.id, w.memberToken,
        '2099-12-31T00:00:00.000000Z',
    );
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'quartermaine'),
        [approval.id],
    );
});

Deno.test('a lapsed claim\'s member does not match', async () => {
    const { w, approval } = await twoOrders();
    await claimBy(
        w, approval.id, w.memberToken,
        '2020-01-01T00:00:00.000000Z',
    );
    const res = await query(w.db, w.memberToken, {
        q: 'quartermaine',
    });
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
});

// A work order the member with `token` created: its last
// transition is that member's.
async function seedOrderBy(
    w: World,
    token: string,
): Promise<string> {
    const flowId = generateIdentifier();
    await seedFlow(w, flowId, 'Intake');
    const id = generateIdentifier();
    await seedCreatedWorkOrder(w.db, {
        organization: ORGANIZATION,
        id,
        fields: {
            display_id: 'e3e3e3e3',
            flow_graph: {
                name: 'Intake',
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [],
                edges: [],
            },
            position: 1,
        },
        flowId,
        births: [generateIdentifier(), generateIdentifier()],
        at: AT,
        token,
        claim: 'released',
    });
    return id;
}

Deno.test('matches by the last transition\'s member name',
async () => {
    const w = await world();
    const id = await seedOrderBy(w, w.memberToken);
    assertEquals(
        await matchedIds(w.db, w.adminToken, 'quartermaine'),
        [id],
    );
});

Deno.test('matches by an AI member\'s name', async () => {
    const w = await world();
    await seedAIMember(w.db, AI_IDENTITY, 'Calliope Assistant');
    const id = await seedOrderBy(
        w, await organizationToken(AI_IDENTITY, ORGANIZATION),
    );
    assertEquals(
        await matchedIds(w.db, w.adminToken, 'calliope'),
        [id],
    );
});

Deno.test('matches by an open bound value', async () => {
    const { w, approval } = await twoOrders();
    await bound(w, approval, (binding) => [
        { attribute_id: binding.openAttribute, value: OPEN_VALUE },
    ]);
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'marigold'),
        [approval.id],
    );
});

// The instance GET refuses an instance of a tombstoned
// type, so its values are no longer this caller's to match.
Deno.test('a deleted record type\'s bound value does not match',
async () => {
    const { w, approval } = await twoOrders();
    const binding = await bound(w, approval, (each) => [
        { attribute_id: each.openAttribute, value: OPEN_VALUE },
    ]);
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'marigold'),
        [approval.id],
    );
    await landed(w.db, req(
        'PUT', ORGANIZATION_PATH + '/record-types/' + binding.typeId,
        w.adminToken,
        {
            name: 'Hiring',
            description: '',
            position: 1,
            state: 'deleted',
        },
    ));
    const instance = await handleRequest(w.db, req(
        'GET', binding.instanceDetail, w.memberToken,
    ));
    assertStrictEquals(instance.status, 404);
    await instance.body?.cancel();
    const res = await query(w.db, w.memberToken, { q: 'marigold' });
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
});

Deno.test('a member cannot match a hidden bound value',
async () => {
    const { w, approval } = await twoOrders();
    await bound(w, approval, (binding) => [
        { attribute_id: binding.openAttribute, value: OPEN_VALUE },
        { attribute_id: binding.hiddenAttribute, value: HIDDEN_VALUE },
    ]);
    const res = await query(w.db, w.memberToken, { q: HIDDEN_VALUE });
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
    assertEquals(
        await matchedIds(w.db, w.adminToken, HIDDEN_VALUE),
        [approval.id],
    );
});

// The transition sets the hidden value on the instance and
// records it on the event; clearing it from the instance
// leaves the event the only place it lives.
Deno.test('a member cannot match a hidden event value',
async () => {
    const { w, approval } = await twoOrders();
    const binding = await bound(w, approval, (each) => [
        { attribute_id: each.openAttribute, value: OPEN_VALUE },
    ]);
    const workOrder = WORK_ORDERS + approval.id;
    await landed(w.db, req(
        'POST', workOrder + '/transition', w.adminToken,
        {
            transitionEventId: generateIdentifier(),
            targetState: generateIdentifier(),
            release: null,
            transitionAt: nowUtc(),
            instance_id: binding.instanceId,
            record_type_id: binding.typeId,
            set: [{
                attribute_id: binding.hiddenAttribute,
                value: HIDDEN_VALUE,
            }],
        },
        {
            [IF_MATCH_HEADER]:
                await etagOf(w.db, workOrder, w.adminToken)
                + ', ' + await etagOf(
                    w.db, binding.instanceDetail, w.adminToken,
                ),
        },
    ));
    await landed(w.db, req(
        'PATCH', binding.instanceDetail, w.adminToken,
        { clear: [binding.hiddenAttribute] },
        {
            [IF_MATCH_HEADER]: await etagOf(
                w.db, binding.instanceDetail, w.adminToken,
            ),
        },
    ));
    const instance = await handleRequest(w.db, req(
        'GET', binding.instanceDetail, w.adminToken,
    ));
    assert(!(await instance.text()).includes(HIDDEN_VALUE));
    const res = await query(w.db, w.memberToken, { q: HIDDEN_VALUE });
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
    assertEquals(
        await matchedIds(w.db, w.adminToken, HIDDEN_VALUE),
        [approval.id],
    );
});

// The flow's current name is a field only while the flow
// lives; the name frozen into the graph is another field.
Deno.test('a deleted flow\'s name does not match', async () => {
    const w = await world();
    const order = await seedOrder(w, {
        flowName: 'Vanishing',
        graphName: 'Frozen Graph',
        displayId: 'f4f4f4f4',
        nodeName: 'Start',
        taskInstructions: '',
    });
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'vanishing'),
        [order.id],
    );
    const flow = ORGANIZATION_PATH + '/flows/' + order.flowId;
    await landed(w.db, req(
        'PUT', flow, w.adminToken,
        {
            ...flowFields('Vanishing'),
            state: 'deleted',
            state_at: AT,
            state_event_id: generateIdentifier(),
            graph: { nodes: [], edges: [] },
            graphDelta: emptyDelta(),
            revivals: [],
        },
        { [IF_MATCH_HEADER]: await etagOf(w.db, flow, w.adminToken) },
    ));
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'vanishing'),
        [],
    );
    assertEquals(
        await matchedIds(w.db, w.memberToken, 'frozen graph'),
        [order.id],
    );
});

for (const [label, text] of [
    ['nothing matches', 'xylophone quasar'],
    ['an empty q', ''],
] as const) {
    Deno.test(label + ' is 204', async () => {
        const { w } = await twoOrders();
        const res = await query(w.db, w.memberToken, { q: text });
        assertStrictEquals(res.status, 204);
        await res.body?.cancel();
    });
}

Deno.test('a bad body is 400', async () => {
    const { w } = await twoOrders();
    const res = await query(w.db, w.memberToken, { q: 5 });
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('a foreign path is 403', async () => {
    const { w } = await twoOrders();
    const res = await handleRequest(w.db, req(
        'QUERY',
        '/organizations/' + OTHER_ORGANIZATION + '/work-orders/',
        w.memberToken,
        { q: 'approval' },
    ));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});

// Two transmissions of one message differ only in the
// lines that name each transmission.
function withoutTransmission(message: HttpMessage): string {
    return message.withFieldDeleted('date')
        .withFieldDeleted('request-id').toWire();
}

Deno.test('a part is the GET\'s part', async () => {
    const { w, approval } = await twoOrders();
    const matched = await partsOf<{ id: string }>(
        await query(w.db, w.memberToken, { q: 'inspection' }),
    );
    const listed = await partsOf<{ id: string }>(
        await handleRequest(
            w.db, req('GET', WORK_ORDERS, w.memberToken),
        ),
    );
    const listedPart = listed.find((part) =>
        part.body().toValue().id === approval.id);
    assert(listedPart !== undefined);
    assertEquals(
        matched.map(withoutTransmission),
        [withoutTransmission(listedPart)],
    );
});

// The server answers every API response the same cache
// rule: a search is as uncacheable as the GET it narrows.
Deno.test('a QUERY over HTTP is no-store as its GET is',
async () => {
    const { w } = await twoOrders();
    const root = await Deno.makeTempDir({ prefix: 'fusion-query-' });
    const listener = await listenHttp({
        adapter: w.db,
        staticRoot: root,
        port: 0,
        host: '127.0.0.1',
        log: () => {},
    });
    try {
        const url = 'http://127.0.0.1:' + String(listener.port)
            + '/api' + WORK_ORDERS;
        const headers = {
            'authorization': 'Bearer ' + w.memberToken,
            'operation-id': generateIdentifier(),
        };
        const searched = await fetch(url, {
            method: 'QUERY',
            headers: {
                ...headers,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ q: 'approval' }),
        });
        await searched.body?.cancel();
        const listed = await fetch(url, { headers });
        await listed.body?.cancel();
        assertStrictEquals(searched.status, 200);
        assertStrictEquals(listed.status, 200);
        assertStrictEquals(
            searched.headers.get('cache-control'), NO_STORE,
        );
        assertStrictEquals(
            listed.headers.get('cache-control'), NO_STORE,
        );
    } finally {
        await listener.close();
        await Deno.remove(root, { recursive: true });
    }
});
