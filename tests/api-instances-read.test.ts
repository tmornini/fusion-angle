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
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
    strongEtagOf,
    HEX64,
} from '../api/message-pair.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Instance GET detail + list: read projection by attribute
// ACL, advertised ETag is documentVersion of the projected
// body (not the stored version, not pair id). List embeds
// etag sans quotes. Full-state head only (R5 — no fold).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-02T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-inst-1';
const ATTR_PUBLIC = 'attr-pub';
const ATTR_SECRET = 'attr-sec';
const INSTANCE_A = 'inst-a';
const INSTANCE_B = 'inst-b';
const INSTANCE_C = 'inst-c';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';

function detailPath(instanceId: string): string {
    return INSTANCES + '/' + instanceId;
}

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

async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function adminDb(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipPair(db, 'm-member1', {
        organization_id: ORGANIZATION,
        identity_id: 'member1',
        type: 'member',
        at: AT,
    });
    return {
        db,
        adminToken: await organizationToken(
            'current', ORGANIZATION,
        ),
        memberToken: await organizationToken(
            'member1', ORGANIZATION,
        ),
    };
}

function typeBody(): Record<string, unknown> {
    return {
        name: 'Rental',
        description: 'Rental desc',
        position: 1,
        state: 'active',
        state_at: AT,
        state_event_id: TYPE_ID + '-genesis',
    };
}

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assert.equal(put.status, 201);
}

async function putAttribute(
    db: MemoryDbAdapter,
    adminToken: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + '/' + attrId, adminToken, body,
    ));
    assert.equal(put.status, 201);
}

async function seedPublicAndSecretAttrs(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    await putAttribute(db, adminToken, ATTR_SECRET, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
    });
}

async function putInstance(
    db: MemoryDbAdapter,
    token: string,
    instanceId: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
): Promise<Response> {
    return handleRequest(db, req(
        'PATCH',
        detailPath(instanceId),
        token,
        { set: [...set] },
    ));
}

// Below-gate revision / tombstone seeds — PATCH and DELETE
// handlers land later; GET must still prove one-head-read
// and tombstone-as-absent via synthetic PUT|DELETE pairs.
async function appendInstancePair(
    db: MemoryDbAdapter,
    organization: string,
    typeId: string,
    instanceId: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, unknown> | undefined,
    requestAt: string,
): Promise<string> {
    const pathname = '/organizations/' + organization
        + '/record-types/' + typeId
        + '/instances/' + instanceId;
    const pair = await formWritePair({
        method,
        pathname,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: pathname.slice(1).split('/'),
        headerFields: [],
        body: body ?? {},
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization,
        responseStatus: method === 'DELETE' ? 204 : 200,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

interface InstanceDetailWire {
    id: string;
    organization_id: string;
    record_type_id: string;
    values: { attribute_id: string; value: string }[];
    etag?: string;
}

test('GET detail member → 200; only read-permitted '
+ 'values; ETag is quoted 64-hex',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedPublicAndSecretAttrs(db, adminToken);
    const put = await putInstance(
        db, adminToken, INSTANCE_A, [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'Hello',
            },
            {
                attribute_id: ATTR_SECRET,
                value: 'hidden',
            },
        ],
    );
    assert.equal(put.status, 201);
    const putPairId = put.headers.get('Response-ID');
    assert.ok(putPairId !== null && putPairId !== '');
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(res.status, 200);
    const etag = res.headers.get('ETag');
    assert.ok(etag !== null && HEX64.test(etag.slice(1, -1)));
    assert.notEqual(etag, strongEtagOf(putPairId!));
    const body = await res.json() as InstanceDetailWire;
    assert.deepEqual(body, {
        id: INSTANCE_A,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        values: [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'Hello',
            },
        ],
    });
    assert.equal(
        'etag' in body,
        false,
        'detail embeds no etag field (header only)',
    );
});

test('GET detail, caller reads ZERO → 200 values: []',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_SECRET, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
    });
    const put = await putInstance(
        db, adminToken, INSTANCE_A, [
            {
                attribute_id: ATTR_SECRET,
                value: 'hidden',
            },
        ],
    );
    assert.equal(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(res.status, 200);
    const body = await res.json() as InstanceDetailWire;
    assert.deepEqual(body, {
        id: INSTANCE_A,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        values: [],
    });
});

test('GET detail admin → 200 all values (bypass)',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    await seedPublicAndSecretAttrs(db, adminToken);
    const put = await putInstance(
        db, adminToken, INSTANCE_A, [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'Hello',
            },
            {
                attribute_id: ATTR_SECRET,
                value: 'hidden',
            },
        ],
    );
    assert.equal(put.status, 201);
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), adminToken,
    ));
    assert.equal(res.status, 200);
    const body = await res.json() as InstanceDetailWire;
    assert.equal(body.values.length, 2);
    const byId = new Map(
        body.values.map((v) => [v.attribute_id, v.value]),
    );
    assert.equal(byId.get(ATTR_PUBLIC), 'Hello');
    assert.equal(byId.get(ATTR_SECRET), 'hidden');
});

test('GET detail absent → 404 record_instances '
+ '(missedReadError)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'GET', detailPath('inst-missing'), memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_instances/inst-missing',
    });
});

test('GET detail tombstoned → 404 record_instances',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const genesisId = await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_A,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'gone',
                },
            ],
        },
        AT,
    );
    await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_A,
        'DELETE', undefined, AT2, genesisId,
    );
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_A,
    });
});

test('GET detail foreign instance id under own org path '
+ '→ 404 (missedReadError R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    // Below-gate pair under org B: resolveGlobalOwner reads
    // uri_collection org segment. Same instance id must not be
    // live under org 1 (head miss → missedReadError probe).
    await seedOrganizationDocument(db, 'B', 'Beta');
    await appendInstancePair(
        db, 'B', 'rt-foreign', INSTANCE_A,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'foreign',
                },
            ],
        },
        AT,
    );
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error:
            'Not found: record_instances/' + INSTANCE_A,
    });
});

test('GET list → 200 id-lex ASC; tombstones omitted; '
+ 'row etag == detail ETag sans quotes',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    // Seed out of id-lex order; include a tombstone.
    const putB = await putInstance(
        db, memberToken, INSTANCE_B, [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'B',
            },
        ],
    );
    assert.equal(putB.status, 201);
    const pairB = putB.headers.get('Response-ID')!;
    const putA = await putInstance(
        db, memberToken, INSTANCE_A, [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'A',
            },
        ],
    );
    assert.equal(putA.status, 201);
    const pairA = putA.headers.get('Response-ID')!;
    const genesisC = await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_C,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'C',
                },
            ],
        },
        AT,
    );
    await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_C,
        'DELETE', undefined, AT2, genesisC,
    );
    const list = await handleRequest(db, req(
        'GET', INSTANCES, memberToken,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as InstanceDetailWire[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.id, INSTANCE_A);
    assert.equal(rows[1]!.id, INSTANCE_B);
    assert.ok(HEX64.test(rows[0]!.etag!));
    assert.ok(HEX64.test(rows[1]!.etag!));
    const detailA = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(detailA.status, 200);
    const detailEtag = detailA.headers.get('ETag');
    assert.ok(detailEtag !== null);
    assert.equal(
        rows[0]!.etag,
        detailEtag.slice(1, -1),
    );
    assert.deepEqual(rows[0]!.values, [
        {
            attribute_id: ATTR_PUBLIC,
            value: 'A',
        },
    ]);
});

test('GET list under absent type → 404 record_types',
async () => {
    const { db, memberToken } = await adminDb();
    const res = await handleRequest(db, req(
        'GET', INSTANCES, memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_types/' + TYPE_ID,
    });
});

test('document ETag === version; instance projected ETag '
+ 'is not stored',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_PUBLIC, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(
        db, memberToken, INSTANCE_A, [
            {
                attribute_id: ATTR_PUBLIC,
                value: 'Hello',
            },
        ],
    );
    assert.equal(put.status, 201);
    const pairId = put.headers.get('Response-ID')!;
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(res.status, 200);
    const header = res.headers.get('ETag');
    assert.ok(header !== null);
    assert.match(header.slice(1, -1), HEX64);
    const stored = await db.responses.getById(pairId);
    assert.ok(stored !== undefined);
    assert.match(stored.version, HEX64);
    assert.notEqual(
        header.slice(1, -1),
        stored.version,
        'instance projected ETag is not stored version',
    );
    assert.notEqual(pairId, stored.version);
});

test('GET after full-state revision pair → values from '
+ 'ONE head (no fold across genesis)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedPublicAndSecretAttrs(db, adminToken);
    // Genesis delta (set only) — incomplete vs later head.
    const genesisId = await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_A,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'old',
                },
            ],
        },
        AT,
    );
    // Synthetic full-state revision (Task 17 will write
    // this shape from PATCH). GET must return THIS head
    // only — not merge with genesis.
    const revisionId = await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_A,
        'PUT', {
            values: [
                {
                    attribute_id: ATTR_PUBLIC,
                    value: 'new',
                },
                {
                    attribute_id: ATTR_SECRET,
                    value: 'sec',
                },
            ],
        },
        AT2,
        genesisId,
    );
    const res = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), adminToken,
    ));
    assert.equal(res.status, 200);
    const revEtag = res.headers.get('ETag');
    assert.ok(
        revEtag !== null
        && HEX64.test(revEtag.slice(1, -1)),
    );
    assert.notEqual(revEtag, strongEtagOf(revisionId));
    const body = await res.json() as InstanceDetailWire;
    const byId = new Map(
        body.values.map((v) => [v.attribute_id, v.value]),
    );
    assert.equal(byId.get(ATTR_PUBLIC), 'new');
    assert.equal(byId.get(ATTR_SECRET), 'sec');
    assert.equal(byId.has('missing'), false);
    // Member projection still applies on the revision head.
    const memberRes = await handleRequest(db, req(
        'GET', detailPath(INSTANCE_A), memberToken,
    ));
    assert.equal(memberRes.status, 200);
    const memberBody =
        await memberRes.json() as InstanceDetailWire;
    assert.deepEqual(memberBody.values, [
        {
            attribute_id: ATTR_PUBLIC,
            value: 'new',
        },
    ]);
});
