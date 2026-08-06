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
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    postInstancePatchOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    IF_MATCH_HEADER,
    strongEtagOf,
    parseIfMatch,
} from '../api/message-pair.ts';
import {
    ApiError,
    HTTP_PRECONDITION_FAILED,
} from '../api/http-errors.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    instancesUriPrefix,
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';
import {
    documentPairsAt,
} from '../api/derive-documents.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';

// Instance DELETE — tombstone posture (Task 18 / R4 / R9).
// Absent → missedReadError; live OR already-tombstoned →
// append tombstone (ledger-complete, not a no-append case).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-del-1';
const ATTR_ID = 'attr-del-1';
const ATTR_LOCKED = 'attr-del-locked';
const INSTANCE_ID = 'inst-del-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;
// History route is Task 19 — pin only if registered.
const INSTANCE_HISTORY = INSTANCE_DETAIL + '/history';

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
        headPairId: undefined,
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
    assert.equal(put.status, 200);
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
    assert.equal(put.status, 200);
}

async function seedWritableTextAttr(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    await putAttribute(db, adminToken, ATTR_ID, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

async function putInstance(
    db: MemoryDbAdapter,
    token: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, token,
        { set: [...set] },
    ));
}

async function countInstancePairs(
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

async function countDeletePairs(
    db: MemoryDbAdapter,
): Promise<number> {
    const prefix = instancesUriPrefix(
        ORGANIZATION, TYPE_ID,
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return documentPairsAt(
        requests, responses, prefix,
    ).filter(
        (pair) => pair.uriId === INSTANCE_ID
            && pair.method === 'DELETE',
    ).length;
}

test('DELETE live instance → 204; then collection omit, '
+ 'detail 404, PATCH 404, PUT 409, second DELETE appends '
+ 'tombstone (R4)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 200);
    const before = await countInstancePairs(db);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(del.status, 204);
    assert.equal(
        await countInstancePairs(db),
        before + 1,
    );
    assert.equal(await countDeletePairs(db), 1);

    const list = await handleRequest(db, req(
        'GET', INSTANCES, memberToken,
    ));
    assert.equal(list.status, 200);
    const rows = await list.json() as { id: string }[];
    assert.equal(
        rows.some((r) => r.id === INSTANCE_ID),
        false,
        'tombstoned instance omitted from collection',
    );

    const detail = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(detail.status, 404);
    assert.deepEqual(await detail.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });

    // History GET (Task 19): tombstone → 404 R2, same body
    // as detail miss (never a live revision chain).
    const history = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assert.equal(history.status, 404);
    assert.deepEqual(await history.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });

    const patch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        { [IF_MATCH_HEADER]: '"ghost"' },
    ));
    assert.equal(patch.status, 404);
    assert.deepEqual(await patch.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });

    const putAgain = await handleRequest(db, req(
        'PUT', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'revive',
                },
            ],
        },
    ));
    assert.equal(putAgain.status, 409);
    assert.deepEqual(await putAgain.json(), {
        error: 'instance already exists at '
            + INSTANCE_DETAIL,
    });

    // New bytes: different Authorization → not a replay.
    // R4: append a SECOND tombstone pair.
    const pairsBeforeSecond = await countInstancePairs(db);
    const deletesBefore = await countDeletePairs(db);
    const del2 = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, adminToken,
    ));
    assert.equal(del2.status, 204);
    assert.equal(
        await countInstancePairs(db),
        pairsBeforeSecond + 1,
        'second DELETE appends new tombstone pair',
    );
    assert.equal(
        await countDeletePairs(db),
        deletesBefore + 1,
    );
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(head, undefined);
});

test('DELETE never-existed id → 404 missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });
    assert.equal(await countInstancePairs(db), 0);
});

test('DELETE byte-identical replay → 204 (replay fast path)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putInstance(db, memberToken, []);
    const first = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(first.status, 204);
    const afterFirst = await countInstancePairs(db);
    const second = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(second.status, 204);
    assert.equal(
        await countInstancePairs(db),
        afterFirst,
        'byte-identical replay does not append',
    );
});

test('DELETE member with zero write roles → 204 '
+ '(path-tier only)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    // Attribute not writable by member; empty genesis is
    // path-tier. DELETE must also ignore value ACL.
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [],
    });
    const put = await putInstance(db, memberToken, []);
    assert.equal(put.status, 200);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(del.status, 204);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(head, undefined);
});

test('DELETE with If-Match header → 204 (header ignored)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const put = await putInstance(db, memberToken, []);
    assert.equal(put.status, 200);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined,
        { [IF_MATCH_HEADER]: '"stale-or-anything"' },
    ));
    assert.equal(del.status, 204);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(head, undefined);
});

// R9 resurrect-hole: tombstone interleaved after a PATCH
// wire pair was formed (gate-equivalent) but before its tx.
// PATCH must 412 (or honest miss) — never revive the head.
test('R9 resurrect-hole: DELETE between PATCH form and '
+ 'append → 412; head stays tombstoned',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'live' },
    ]);
    assert.equal(put.status, 200);
    const h0 = parseIfMatch(put.headers.get('ETag')!)!;
    const patchBody = {
        set: [
            {
                attribute_id: ATTR_ID,
                value: 'revived',
            },
        ],
    };
    const stalePair = await formWritePair({
        method: 'PATCH',
        pathname: INSTANCE_DETAIL,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments:
            INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: [
            'organizations', ORGANIZATION,
            'record-types', TYPE_ID,
            'instances', INSTANCE_ID,
        ],
        headerFields: [
            {
                name: IF_MATCH_HEADER,
                value: strongEtagOf(h0),
            },
        ],
        body: patchBody,
        requesterIdentityId: 'member1',
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseStatus: 200,
        responseBody: {
            id: INSTANCE_ID,
            organization_id: ORGANIZATION,
            record_type_id: TYPE_ID,
            set: patchBody.set,
            clear: [],
        },
        headPairId: undefined,
    });
    // Concurrent DELETE tombstones the address.
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(del.status, 204);
    assert.equal(
        await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        ),
        undefined,
    );
    await assert.rejects(
        () => postInstancePatchOp(
            db,
            [ORGANIZATION, TYPE_ID, INSTANCE_ID],
            patchBody,
            'member1',
            stalePair,
            ORGANIZATION,
            ['member'],
        ),
        (error: unknown) => {
            assert.ok(error instanceof ApiError);
            assert.equal(
                error.status,
                HTTP_PRECONDITION_FAILED,
            );
            assert.match(
                error.message,
                /If-Match does not match/,
            );
            return true;
        },
    );
    const after = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(
        after,
        undefined,
        'PATCH must never revive a tombstoned head',
    );
});
