import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';
import {
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// POST work-orders/:id/binding — bind WO ↔ instance.
// Ladder order is the covenant's (fence → body → instance →
// join → in-tx 409), NOT claim's internal body-first order —
// deliberate divergence so a foreign-WO bind with a
// malformed body is 403, never 400 (fence before body).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const ORGANIZATION_B = 'B';
const FLOW_ID = 'flow-bind-1';
const WO_ID = 'wo-bind-1';
const WO_UNBOUND = 'wo-bind-unbound';
const TYPE_ID = 'rt-bind-1';
const TYPE_OTHER = 'rt-bind-other';
const ATTR_ID = 'attr-bind-1';
const INSTANCE_ID = 'inst-bind-1';
const INSTANCE_2 = 'inst-bind-2';
const INSTANCE_TOMB = 'inst-bind-tomb';
const FR_ID = 'fr-bind-1';
const FWO_ID = 'fwo-bind-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;
const BINDING =
    '/work-orders/' + WO_ID + '/binding';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers: extraHeaders,
        operationId: TEST_OPERATION_ID,
    });
}

async function membershipPair(
    membershipId: string,
    body: Record<string, unknown>,
    organization: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error('missing memberships/:id spec');
    }
    return formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + membershipId,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', membershipId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [membershipId], body, SYSTEM_MEMBER_ID,
            organization,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

async function pairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.requests.getAll()).length;
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Bind Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
}

function bindBody(
    instanceId: string = INSTANCE_ID,
    recordTypeId: string = TYPE_ID,
): Record<string, unknown> {
    return {
        instance_id: instanceId,
        record_type_id: recordTypeId,
    };
}

async function seedOrganizationB(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedOrganizationDocument(
        db, ORGANIZATION_B, 'Beta',
    );
    const memBody = {
        organization_id: ORGANIZATION_B,
        identity_id: 'current',
        type: 'admin',
        at: AT,
    };
    await postMembershipDocumentOp(
        db, 'm-current-b', memBody, SYSTEM_MEMBER_ID,
        await membershipPair(
            'm-current-b', memBody, ORGANIZATION_B,
        ),
    );
}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/flows', token, {
            id: FLOW_ID,
            flow: {
                name: 'Bind Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: FLOW_ID + '-pf',
            projectFlow: {
                project_id: 'proj-bind-1',
                flow_id: FLOW_ID,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: FLOW_ID + '-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(res.status, 201);
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    fwoId: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', '/work-orders/' + woId, token, {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
    ));
    assert.equal(put.status, 201);
    const join = await handleRequest(db, req(
        'PUT',
        '/flows/' + FLOW_ID + '/work-orders/' + fwoId,
        token,
        {
            flow_id: FLOW_ID,
            work_order_id: woId,
            at: AT,
        },
    ));
    assert.equal(join.status, 201);
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
    typeId: string,
): Promise<void> {
    const path =
        '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId;
    const put = await handleRequest(db, req(
        'PUT', path, token, {
            name: 'Bind Type ' + typeId,
            description: '',
            position: 1,
            state: 'active',
            state_at: AT,
            state_event_id: typeId + '-genesis',
        },
    ));
    assert.equal(put.status, 201);
}

async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + '/' + ATTR_ID, token, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ));
    assert.equal(put.status, 201);
}

async function seedInstance(
    db: MemoryDbAdapter,
    token: string,
    instanceId: string,
): Promise<void> {
    const path = INSTANCES + '/' + instanceId;
    const put = await handleRequest(db, req(
        'PATCH', path, token, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Hello',
                },
            ],
        },
    ));
    assert.equal(put.status, 201);
}

async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
    recordId: string = TYPE_ID,
    frId: string = FR_ID,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT',
        '/flows/' + FLOW_ID + '/records/' + frId,
        token,
        {
            id: frId,
            flow_id: FLOW_ID,
            record_id: recordId,
            at: AT,
        },
    ));
    assert.equal(put.status, 201);
}

async function seededDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
    tokenB: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedOrganizationB(db);
    const token = await organizationToken(
        'current', ORGANIZATION,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    await seedFlow(db, token);
    await seedWorkOrder(db, token, WO_ID, FWO_ID);
    await seedWorkOrder(
        db, token, WO_UNBOUND, 'fwo-bind-unbound',
    );
    await seedLiveType(db, token, TYPE_ID);
    await seedAttribute(db, token);
    await seedInstance(db, token, INSTANCE_ID);
    await seedFlowTypeJoin(db, token);
    return { db, token, tokenB };
}

// 1. foreign-WO bind + malformed body → 404 (miss first)
test('foreign-WO bind with malformed body → 404'
+ ' (miss before body)',
async () => {
    const { db, tokenB } = await seededDb();
    const res = await handleRequest(db, req(
        'POST', BINDING, tokenB,
        { not_a_key: true },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: work_orders/' + WO_ID,
    });
});

// 2. absent WO → 404
test('absent WO bind → 404',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'POST', '/work-orders/wo-absent/binding',
        token, bindBody(),
    ));
    assert.equal(res.status, 404);
});

// 3. bad body → 400
test('bad body (missing key / unknown key / empty'
+ ' id) → 400',
async () => {
    const { db, token } = await seededDb();
    const missing = await handleRequest(db, req(
        'POST', BINDING, token,
        { instance_id: INSTANCE_ID },
    ));
    assert.equal(missing.status, 400);

    const unknown = await handleRequest(db, req(
        'POST', BINDING, token, {
            instance_id: INSTANCE_ID,
            record_type_id: TYPE_ID,
            extra: true,
        },
    ));
    assert.equal(unknown.status, 400);

    const empty = await handleRequest(db, req(
        'POST', BINDING, token, {
            instance_id: '',
            record_type_id: TYPE_ID,
        },
    ));
    assert.equal(empty.status, 400);
});

// 4. instance miss postures → 404 (no oracle)
test('absent / tombstoned / foreign-org instance'
+ ' → 404 (indistinguishable)',
async () => {
    const { db, token, tokenB } = await seededDb();

    const absent = await handleRequest(db, req(
        'POST', BINDING, token,
        bindBody('inst-missing', TYPE_ID),
    ));
    assert.equal(absent.status, 404);
    assert.deepEqual(await absent.json(), {
        error: 'Not found: record_instances/'
            + 'inst-missing',
    });

    await seedInstance(db, token, INSTANCE_TOMB);
    const del = await handleRequest(db, req(
        'DELETE',
        INSTANCES + '/' + INSTANCE_TOMB,
        token,
    ));
    assert.equal(del.status, 204);
    const tomb = await handleRequest(db, req(
        'POST', BINDING, token,
        bindBody(INSTANCE_TOMB, TYPE_ID),
    ));
    assert.equal(tomb.status, 404);
    assert.deepEqual(await tomb.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_TOMB,
    });

    // Foreign-org instance under B (distinct type id —
    // record-type ids are globally ownership-fenced).
    const typeIdB = 'rt-bind-foreign-b';
    const typeB =
        '/organizations/' + ORGANIZATION_B
        + '/record-types/' + typeIdB;
    const putTypeB = await handleRequest(db, req(
        'PUT', typeB, tokenB, {
            name: 'Foreign',
            description: '',
            position: 1,
            state: 'active',
            state_at: AT,
            state_event_id: typeIdB + '-genesis',
        },
    ));
    assert.equal(putTypeB.status, 201);
    const putAttrB = await handleRequest(db, req(
        'PUT',
        typeB + '/attributes/' + ATTR_ID,
        tokenB,
        {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
            write_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
        },
    ));
    assert.equal(putAttrB.status, 201);
    const foreignInst = 'inst-foreign-b';
    const putInstB = await handleRequest(db, req(
        'PATCH',
        typeB + '/instances/' + foreignInst,
        tokenB,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
        },
    ));
    assert.equal(putInstB.status, 201);
    // Bind under org A with the foreign instance id + the
    // org-A joined type — head resolves under fenced org
    // only, so foreign is absent 404 (no oracle).
    const foreign = await handleRequest(db, req(
        'POST', BINDING, token,
        bindBody(foreignInst, TYPE_ID),
    ));
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), {
        error: 'Not found: record_instances/'
            + foreignInst,
    });
});

// 5. record_type_id not among flow joins → 400
// Instance must be LIVE under the asserted type so the
// ladder reaches the join check (instance before join).
test('record_type_id not among WO flow joins → 400',
async () => {
    const { db, token } = await seededDb();
    await seedLiveType(db, token, TYPE_OTHER);
    const otherAttrPath =
        '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_OTHER
        + '/attributes/' + ATTR_ID;
    const attr = await handleRequest(db, req(
        'PUT', otherAttrPath, token, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
            write_roles: [
                ...DEFAULT_ATTRIBUTE_ACL_ROLES,
            ],
        },
    ));
    assert.equal(attr.status, 201);
    const otherInst = 'inst-bind-other';
    const inst = await handleRequest(db, req(
        'PATCH',
        '/organizations/' + ORGANIZATION
        + '/record-types/' + TYPE_OTHER
        + '/instances/' + otherInst,
        token,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
        },
    ));
    assert.equal(inst.status, 201);
    const res = await handleRequest(db, req(
        'POST', BINDING, token,
        bindBody(otherInst, TYPE_OTHER),
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /not joined to the work order's flow/,
    );
});

// 6. fresh bind → 204 + GET embed; unbound omits keys
test('fresh bind → 204; detail + list embed; unbound'
+ ' omits keys',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'POST', BINDING, token, bindBody(),
    ));
    assert.equal(res.status, 201);

    const detail = await handleRequest(db, req(
        'GET', '/work-orders/' + WO_ID, token,
    ));
    assert.equal(detail.status, 200);
    const d = await detail.json() as Record<
        string, unknown
    >;
    assert.equal(d['instance_id'], INSTANCE_ID);
    assert.equal(d['record_type_id'], TYPE_ID);

    const list = await handleRequest(db, req(
        'GET', '/work-orders', token,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as Record<
        string, unknown
    >[];
    const bound = rows.find((r) => r['id'] === WO_ID);
    const unbound = rows.find(
        (r) => r['id'] === WO_UNBOUND,
    );
    assert.ok(bound !== undefined);
    assert.ok(unbound !== undefined);
    assert.equal(bound['instance_id'], INSTANCE_ID);
    assert.equal(bound['record_type_id'], TYPE_ID);
    assert.equal(
        Object.hasOwn(unbound, 'instance_id'),
        false,
    );
    assert.equal(
        Object.hasOwn(unbound, 'record_type_id'),
        false,
    );
});

// 7. re-bind same pair → 204 replay (pair count stable)
test('re-bind same pair byte-identically → 204'
+ ' replay (pair count unchanged)',
async () => {
    const { db, token } = await seededDb();
    const first = await handleRequest(db, req(
        'POST', BINDING, token, bindBody(),
    ));
    assert.equal(first.status, 201);
    const before = await pairCount(db);
    const second = await handleRequest(db, req(
        'POST', BINDING, token, bindBody(),
    ));
    assert.equal(second.status, 201);
    assert.equal(await pairCount(db), before);
});

// 8. bind different instance → 409
test('bind different instance → 409',
async () => {
    const { db, token } = await seededDb();
    await seedInstance(db, token, INSTANCE_2);
    const first = await handleRequest(db, req(
        'POST', BINDING, token, bindBody(),
    ));
    assert.equal(first.status, 201);
    const res = await handleRequest(db, req(
        'POST', BINDING, token,
        bindBody(INSTANCE_2, TYPE_ID),
    ));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), {
        error:
            'work order is already bound to a'
            + ' different instance',
    });
});
