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
    IF_MATCH_HEADER,
    strongEtagOf,
    type MessagePair,
} from '../api/message-pair.ts';
import {
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import {
    instancesUriPrefix,
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';

// POST work-orders/:id/transition — instance-head shape
// (Task 4 dual-accept; Task 8 gate cut). Value-bearing
// set/clear dialect + If-Match ladder against the bound
// instance head; pure moves remain one-pair; legacy
// fieldValues is rejected at the gate.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const ORGANIZATION_B = 'B';
const FLOW_ID = 'flow-tx-inst-1';
const WO_ID = 'wo-tx-inst-1';
const WO_UNBOUND = 'wo-tx-inst-unbound';
const TYPE_ID = 'rt-tx-inst-1';
const ATTR_ID = 'attr-tx-inst-1';
const ATTR_LOCKED = 'attr-tx-inst-locked';
const ATTR_NUM = 'attr-tx-inst-num';
const INSTANCE_ID = 'inst-tx-inst-1';
const FR_ID = 'fr-tx-inst-1';
const FWO_ID = 'fwo-tx-inst-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;
const TRANSITION =
    '/work-orders/' + WO_ID + '/transition';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            ...(extraHeaders ?? {}),
        },
        ...(body !== undefined
            ? { body: JSON.stringify(body) }
            : {}),
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
        headPairId: undefined,
    });
}

async function requestCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.requests.getAll()).length;
}

async function instancePairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    const prefix = instancesUriPrefix(
        ORGANIZATION, TYPE_ID,
    );
    const responses = await db.responses.getAllWhere(
        'uri_prefix', prefix,
    );
    return responses.filter(
        (r) => r.uri_id === INSTANCE_ID,
    ).length;
}

function graphJson(): Record<string, unknown> {
    return {
        name: 'Tx Inst Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [],
        edges: [],
    };
}

function pureMoveBody(
    eventId: string = 'te-pure',
): Record<string, unknown> {
    return {
        transitionEventId: eventId,
        targetState: 'n-next',
        release: null,
        transitionAt: nowUtc(),
    };
}

function valueBody(
    opts: {
        eventId?: string;
        set?: {
            attribute_id: string;
            value: string;
        }[];
        clear?: string[];
        instanceId?: string;
        recordTypeId?: string;
        includeSet?: boolean;
        includeClear?: boolean;
        includeInstanceId?: boolean;
        includeRecordTypeId?: boolean;
    } = {},
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        transitionEventId: opts.eventId ?? 'te-val',
        targetState: 'n-next',
        release: null,
        transitionAt: nowUtc(),
    };
    const includeInstanceId =
        opts.includeInstanceId !== false;
    const includeRecordTypeId =
        opts.includeRecordTypeId !== false;
    if (includeInstanceId) {
        body['instance_id'] =
            opts.instanceId ?? INSTANCE_ID;
    }
    if (includeRecordTypeId) {
        body['record_type_id'] =
            opts.recordTypeId ?? TYPE_ID;
    }
    const includeSet = opts.includeSet !== false
        || opts.set !== undefined;
    const includeClear = opts.includeClear === true
        || opts.clear !== undefined;
    if (includeSet) {
        body['set'] = opts.set ?? [
            {
                attribute_id: ATTR_ID,
                value: 'updated',
            },
        ];
    }
    if (includeClear) {
        body['clear'] = opts.clear ?? [];
    }
    return body;
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

async function seedMember1(
    db: MemoryDbAdapter,
): Promise<void> {
    const memBody = {
        organization_id: ORGANIZATION,
        identity_id: 'member1',
        type: 'member',
        at: AT,
    };
    await postMembershipDocumentOp(
        db, 'm-member1', memBody, SYSTEM_MEMBER_ID,
        await membershipPair(
            'm-member1', memBody, ORGANIZATION,
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
                name: 'Tx Inst Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: FLOW_ID + '-pf',
            projectFlow: {
                project_id: 'proj-tx-inst-1',
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
    assert.equal(res.status, 204);
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
    assert.equal(put.status, 200);
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
    assert.equal(join.status, 200);
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, token, {
            name: 'Tx Inst Type',
            description: '',
            position: 1,
            state: 'active',
            state_at: AT,
            state_event_id: TYPE_ID + '-genesis',
        },
    ));
    assert.equal(put.status, 200);
}

async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + '/' + attrId, token, body,
    ));
    assert.equal(put.status, 200);
}

async function seedWritableText(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    await seedAttribute(db, token, ATTR_ID, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

async function seedInstance(
    db: MemoryDbAdapter,
    token: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[] = [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ],
): Promise<string> {
    const put = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, token,
        { set: [...set] },
    ));
    assert.equal(put.status, 200);
    return put.headers.get('ETag')!;
}

async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT',
        '/flows/' + FLOW_ID + '/records/' + FR_ID,
        token,
        {
            id: FR_ID,
            flow_id: FLOW_ID,
            record_id: TYPE_ID,
            at: AT,
        },
    ));
    assert.equal(put.status, 200);
}

async function bindInstance(
    db: MemoryDbAdapter,
    token: string,
    woId: string = WO_ID,
    instanceId: string = INSTANCE_ID,
    recordTypeId: string = TYPE_ID,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/work-orders/' + woId + '/binding',
        token,
        {
            instance_id: instanceId,
            record_type_id: recordTypeId,
        },
    ));
    assert.equal(res.status, 204);
}

async function seededBound(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
    tokenB: string;
    etag: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedMember1(db);
    await seedOrganizationB(db);
    const adminToken = await organizationToken(
        'current', ORGANIZATION,
    );
    const memberToken = await organizationToken(
        'member1', ORGANIZATION,
    );
    const tokenB = await organizationToken(
        'current', ORGANIZATION_B,
    );
    await seedFlow(db, adminToken);
    await seedWorkOrder(
        db, adminToken, WO_ID, FWO_ID,
    );
    await seedWorkOrder(
        db, adminToken, WO_UNBOUND, 'fwo-tx-unbound',
    );
    await seedLiveType(db, adminToken);
    await seedWritableText(db, adminToken);
    const etag = await seedInstance(db, adminToken);
    await seedFlowTypeJoin(db, adminToken);
    await bindInstance(db, adminToken);
    return {
        db, adminToken, memberToken, tokenB, etag,
    };
}

// --- 1. set/clear dialect ---

test('duplicate attribute_id in set → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [
                { attribute_id: ATTR_ID, value: 'a' },
                { attribute_id: ATTR_ID, value: 'b' },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /duplicate attribute_id/);
});

test('set∩clear overlap → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [
                { attribute_id: ATTR_ID, value: 'x' },
            ],
            clear: [ATTR_ID],
            includeClear: true,
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /set and clear/);
});

test("set value '' → 400",
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [
                { attribute_id: ATTR_ID, value: '' },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty/i);
});

test('set+clear keys present but both empty → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [],
            clear: [],
            includeClear: true,
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /non-empty set or clear/,
    );
});

// --- 2. If-Match ladder ---

test('value-bearing missing If-Match → 428',
async () => {
    const { db, adminToken } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody(),
    ));
    assert.equal(res.status, 428);
    assert.deepEqual(await res.json(), {
        error:
            'If-Match is required to transition with'
            + ' set/clear at ' + TRANSITION,
    });
});

test('value-bearing malformed If-Match → 400',
async () => {
    const { db, adminToken } = await seededBound();
    const malformed = [
        'W/"x"',
        '*',
        '"a", "b"',
        'unquoted',
    ];
    for (const raw of malformed) {
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({ eventId: 'te-mal-' + raw }),
            { [IF_MATCH_HEADER]: raw },
        ));
        assert.equal(
            res.status, 400,
            'malformed If-Match: ' + raw,
        );
        assert.deepEqual(await res.json(), {
            error:
                'If-Match must carry exactly one'
                + ' strong validator',
        });
    }
});

test('value-bearing stale If-Match → 412',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const first = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            eventId: 'te-stale-1',
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'B',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(first.status, 204);
    const stale = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            eventId: 'te-stale-2',
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'C',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(stale.status, 412);
    assert.deepEqual(await stale.json(), {
        error:
            'If-Match does not match the current '
            + 'instance at ' + INSTANCE_DETAIL,
    });
});

test('value-bearing fresh If-Match → 204; head advances',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const before = await instancePairCount(db);
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'World',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 204);
    const get = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, adminToken,
    ));
    assert.equal(get.status, 200);
    const body = await get.json() as {
        values: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(body.values, [
        { attribute_id: ATTR_ID, value: 'World' },
    ]);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(head !== undefined);
    assert.equal(
        get.headers.get('ETag'),
        strongEtagOf(head.pairId),
    );
    assert.notEqual(
        get.headers.get('ETag'),
        etag,
    );
    assert.equal(
        await instancePairCount(db),
        before + 1,
        'one revision pair on the instance',
    );
});

test('pure move WITH If-Match → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        pureMoveBody('te-pure-if'),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
});

// --- 3. A2 presence ---

test('set present + missing instance_id → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({ includeInstanceId: false }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /instance_id and.*record_type_id are required/,
    );
});

test('set present + missing record_type_id → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({ includeRecordTypeId: false }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /instance_id and.*record_type_id are required/,
    );
});

test('pure move carrying instance_id → 400',
async () => {
    const { db, adminToken } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken, {
            ...pureMoveBody('te-pure-assert'),
            instance_id: INSTANCE_ID,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /forbidden on a pure move/);
});

test('pure move carrying record_type_id → 400',
async () => {
    const { db, adminToken } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken, {
            ...pureMoveBody('te-pure-rt'),
            record_type_id: TYPE_ID,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /forbidden on a pure move/);
});

// --- 4. bind assert ---

test('body bind ≠ current bind → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({ instanceId: 'inst-other' }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(
        err.error,
        /do not match the work order's binding/,
    );
});

test('value-bearing on UNBOUND WO → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST',
        '/work-orders/' + WO_UNBOUND + '/transition',
        adminToken,
        valueBody({ eventId: 'te-unbound' }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
        error: 'work order has no instance binding',
    });
});

// --- 5. ACL ---

test('set naming role-locked attribute → 403',
async () => {
    const {
        db, adminToken, memberToken, etag,
    } = await seededBound();
    await seedAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Ops Only',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: ['ops'],
    });
    // Re-seed instance so locked attr can be written by
    // admin first if needed; head etag from genesis.
    const res = await handleRequest(db, req(
        'POST', TRANSITION, memberToken,
        valueBody({
            eventId: 'te-acl-set',
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'ok',
                },
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'secret',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error:
            'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

test('CLEAR naming role-locked attribute → 403',
async () => {
    const {
        db, adminToken, memberToken,
    } = await seededBound();
    await seedAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Ops Only',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: ['ops'],
    });
    const put = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, adminToken, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'Hello',
                },
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'secret',
                },
            ],
        },
    ));
    // PUT create-only — re-PUT may 409; use PATCH.
    let headEtag = put.headers.get('ETag');
    if (put.status !== 200) {
        const get = await handleRequest(db, req(
            'GET', INSTANCE_DETAIL, adminToken,
        ));
        headEtag = get.headers.get('ETag');
        const patch = await handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, adminToken, {
                set: [
                    {
                        attribute_id: ATTR_LOCKED,
                        value: 'secret',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: headEtag! },
        ));
        assert.equal(patch.status, 200);
        headEtag = patch.headers.get('ETag');
    }
    const res = await handleRequest(db, req(
        'POST', TRANSITION, memberToken,
        valueBody({
            eventId: 'te-acl-clear',
            set: [],
            clear: [ATTR_LOCKED],
            includeClear: true,
        }),
        { [IF_MATCH_HEADER]: headEtag! },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error:
            'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

test('admin bypasses role-locked attribute ACL',
async () => {
    const { db, adminToken, etag } = await seededBound();
    await seedAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Ops Only',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: ['ops'],
    });
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            eventId: 'te-acl-admin',
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'by-admin',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 204);
});

// --- 6. constraints ---

test('type-nonconforming value → 400',
async () => {
    const { db, adminToken, etag } = await seededBound();
    await seedAttribute(db, adminToken, ATTR_NUM, {
        name: 'Amount',
        attribute_type: 'number',
        sort_order: 2,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            eventId: 'te-type',
            set: [
                {
                    attribute_id: ATTR_NUM,
                    value: 'not-a-number',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /finite number/);
});

// --- 7. one tx ---

test('fresh success grows requests by EXACTLY 2',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const before = await requestCount(db);
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({ eventId: 'te-tx-2' }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 204);
    assert.equal(
        await requestCount(db),
        before + 2,
    );
});

test('pre-tx failure grows requests by 0',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const before = await requestCount(db);
    const res = await handleRequest(db, req(
        'POST', TRANSITION, adminToken,
        valueBody({
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: '',
                },
            ],
        }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 400);
    assert.equal(
        await requestCount(db),
        before,
    );
});

// --- 8. race ---

test('two concurrent value-bearing same If-Match → '
+ '[204, 412] and one revision',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const beforePairs = await instancePairCount(db);
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({
                eventId: 'te-race-a',
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-a',
                    },
                ],
            }),
            { [IF_MATCH_HEADER]: etag },
        )),
        handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({
                eventId: 'te-race-b',
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-b',
                    },
                ],
            }),
            { [IF_MATCH_HEADER]: etag },
        )),
    ]);
    assert.deepEqual(
        [a.status, b.status].sort(),
        [204, 412],
    );
    assert.equal(
        await instancePairCount(db),
        beforePairs + 1,
        'exactly one revision pair',
    );
});

// --- 9. byte-identical resend ---

test('byte-identical resend → 204 replay, no second '
+ 'revision',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const body = valueBody({
        eventId: 'te-replay',
        set: [
            {
                attribute_id: ATTR_ID,
                value: 'replay-val',
            },
        ],
    });
    // Fix transitionAt so resend is byte-identical.
    body['transitionAt'] =
        '2026-06-01T00:00:00.000000Z';
    const first = await handleRequest(db, req(
        'POST', TRANSITION, adminToken, body,
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(first.status, 204);
    const afterFirst = await instancePairCount(db);
    const afterFirstReq = await requestCount(db);
    const replay = await handleRequest(db, req(
        'POST', TRANSITION, adminToken, body,
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(replay.status, 204);
    assert.equal(
        await instancePairCount(db),
        afterFirst,
        'no second revision on replay',
    );
    assert.equal(
        await requestCount(db),
        afterFirstReq,
        'no second op pair on replay',
    );
});

// --- 10. honest miss ---

test('absent WO transition (instance shape) → 404',
async () => {
    const { db, adminToken, etag } = await seededBound();
    const res = await handleRequest(db, req(
        'POST',
        '/work-orders/wo-absent/transition',
        adminToken,
        valueBody({ eventId: 'te-absent' }),
        { [IF_MATCH_HEADER]: etag },
    ));
    assert.equal(res.status, 404);
});

test('absent WO pure-move transition → 404',
async () => {
    const { db, adminToken } = await seededBound();
    const res = await handleRequest(db, req(
        'POST',
        '/work-orders/wo-absent/transition',
        adminToken,
        pureMoveBody('te-absent-pure'),
    ));
    assert.equal(res.status, 404);
});

