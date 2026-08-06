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
    postInstancePatchOp,
    WRITE_RESPONSE_SPECS,
    formDocumentPairFor,
} from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
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
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';

// Instance PATCH — If-Match + full-state revision (R5).
// Two pairs per PATCH: wire delta + PUT {values} revision.
// Gate ladder after replay; ETag = revision pair id.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-02T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-patch-1';
const ATTR_ID = 'attr-patch-1';
const ATTR_NUM = 'attr-patch-num';
const ATTR_LOCKED = 'attr-patch-locked';
const ATTR_SUBMIT = 'attr-patch-submit';
const INSTANCE_ID = 'inst-patch-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;

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

async function appendInstancePair(
    db: MemoryDbAdapter,
    organization: string,
    typeId: string,
    instanceId: string,
    method: 'PUT' | 'DELETE',
    body: Record<string, unknown> | undefined,
    requestAt: string,
    headPairId?: string,
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
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

test('PATCH fresh If-Match → 200 + new ETag; GET full '
+ 'merged state from ONE head pair',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 200);
    const headEtag = put.headers.get('ETag')!;
    const before = await countInstancePairs(db);
    const patch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'World',
                },
            ],
        },
        { [IF_MATCH_HEADER]: headEtag },
    ));
    assert.equal(patch.status, 200);
    const newEtag = patch.headers.get('ETag');
    assert.ok(newEtag !== null && newEtag !== '');
    assert.notEqual(newEtag, headEtag);
    const echo = await patch.json() as {
        id: string;
        organization_id: string;
        record_type_id: string;
        set: { attribute_id: string; value: string }[];
        clear: string[];
    };
    assert.deepEqual(echo, {
        id: INSTANCE_ID,
        organization_id: ORGANIZATION,
        record_type_id: TYPE_ID,
        set: [
            { attribute_id: ATTR_ID, value: 'World' },
        ],
        clear: [],
    });
    const get = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('ETag'), newEtag);
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
        strongEtagOf(head.pairId),
        newEtag,
    );
    assert.equal(
        await countInstancePairs(db),
        before + 2,
        'each PATCH adds TWO pairs (wire + revision)',
    );
});

test('PATCH missing If-Match → 428',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 200);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
    ));
    assert.equal(res.status, 428);
    assert.deepEqual(await res.json(), {
        error: 'If-Match is required to PATCH '
            + INSTANCE_DETAIL,
    });
});

test('PATCH stale If-Match → 412; re-GET + retry → 200',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const e0 = put.headers.get('ETag')!;
    const p1 = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'B' }] },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(p1.status, 200);
    const e1 = p1.headers.get('ETag')!;
    const stale = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'C' }] },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(stale.status, 412);
    assert.deepEqual(await stale.json(), {
        error: 'If-Match does not match the '
            + 'current instance at ' + INSTANCE_DETAIL,
    });
    const freshGet = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(freshGet.status, 200);
    assert.equal(freshGet.headers.get('ETag'), e1);
    const retry = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'C' }] },
        { [IF_MATCH_HEADER]: e1 },
    ));
    assert.equal(retry.status, 200);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.deepEqual(head?.values, [
        { attribute_id: ATTR_ID, value: 'C' },
    ]);
});

test('PATCH If-Match * / list / weak / unquoted → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(put.status, 200);
    const malformed = [
        '*',
        '"a", "b"',
        'W/"weak"',
        'unquoted',
    ];
    for (const raw of malformed) {
        const res = await handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'x',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: raw },
        ));
        assert.equal(
            res.status, 400,
            'malformed If-Match: ' + raw,
        );
        assert.deepEqual(await res.json(), {
            error: 'If-Match must carry exactly one '
                + 'strong validator',
        });
    }
});

test('PATCH absent → 404 via missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        { [IF_MATCH_HEADER]: '"ghost"' },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });
});

test('PATCH tombstoned → 404; never revives',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const genesisId = await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'gone',
                },
            ],
        },
        AT,
    );
    await appendInstancePair(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        'DELETE', undefined, AT2, genesisId,
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        {
            [IF_MATCH_HEADER]: strongEtagOf(genesisId),
        },
    ));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
        error: 'Not found: record_instances/'
            + INSTANCE_ID,
    });
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.equal(head, undefined);
});

test('PATCH foreign instance id → 403 (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedOrganizationDocument(db, 'B', 'Beta');
    await appendInstancePair(
        db, 'B', 'rt-foreign', INSTANCE_ID,
        'PUT', {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'foreign',
                },
            ],
        },
        AT,
    );
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        { [IF_MATCH_HEADER]: '"anything"' },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error:
            'forbidden: record_instances/' + INSTANCE_ID
            + ' belongs to a different organization',
    });
});

test('PATCH set∩clear overlap → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'x',
                },
            ],
            clear: [ATTR_ID],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /set and clear/i);
});

test('PATCH duplicate in set → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                { attribute_id: ATTR_ID, value: 'a' },
                { attribute_id: ATTR_ID, value: 'b' },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /duplicate attribute_id/);
});

test('PATCH both empty → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [], clear: [] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty|set|clear/i);
});

test('PATCH value \'\' → 400 (G9)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                { attribute_id: ATTR_ID, value: '' },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /empty/i);
});

test('PATCH unknown attribute_id → 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: 'attr-unknown',
                    value: 'x',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 400);
    const err = await res.json() as { error: string };
    assert.match(err.error, /unknown attribute_id/);
});

test('PATCH unwritable id in clear → 403 (ACL covers clear)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [],
    });
    const put = await putInstance(db, adminToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
        { attribute_id: ATTR_LOCKED, value: 's' },
    ]);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_LOCKED] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
        error: 'forbidden: attribute '
            + ATTR_LOCKED
            + ' is not writable with the held roles',
    });
});

test('PATCH clear of absent value → 200; revision '
+ 'appended; values unchanged',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    // Known attribute never present on the head.
    await putAttribute(db, adminToken, ATTR_NUM, {
        name: 'Amount',
        attribute_type: 'number',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    const before = await countInstancePairs(db);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { clear: [ATTR_NUM] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 200);
    const afterHead = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.deepEqual(afterHead?.values, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assert.equal(
        await countInstancePairs(db),
        before + 2,
    );
});

test('PATCH write-without-read attr → 200; echo has value',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putAttribute(db, adminToken, ATTR_SUBMIT, {
        name: 'SubmitOnly',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
    const put = await putInstance(db, memberToken, []);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_SUBMIT,
                    value: 'secret-submit',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(res.status, 200);
    const echo = await res.json() as {
        set: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(echo.set, [
        {
            attribute_id: ATTR_SUBMIT,
            value: 'secret-submit',
        },
    ]);
    const get = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    const body = await get.json() as {
        values: unknown[];
    };
    assert.deepEqual(body.values, []);
});

test('byte-identical PATCH resend → 200 REPLAY; ETag '
+ 'ORIGINAL even after later revisions',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const e0 = put.headers.get('ETag')!;
    const body = {
        set: [
            { attribute_id: ATTR_ID, value: 'B' },
        ],
    };
    const first = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(first.status, 200);
    const originalEtag = first.headers.get('ETag')!;
    const originalBody = await first.json();
    const originalResponseId =
        first.headers.get('Response-ID')!;
    // Later revision advances the head.
    const secondWrite = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'C',
                },
            ],
        },
        { [IF_MATCH_HEADER]: originalEtag },
    ));
    assert.equal(secondWrite.status, 200);
    assert.notEqual(
        secondWrite.headers.get('ETag'),
        originalEtag,
    );
    // Byte-identical resend of the FIRST patch (stale If-Match)
    // must replay BEFORE the outcome ladder.
    const replay = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken, body,
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(replay.status, 200);
    assert.equal(
        replay.headers.get('ETag'),
        originalEtag,
        'replay carries ORIGINAL etag',
    );
    assert.equal(
        replay.headers.get('Response-ID'),
        originalResponseId,
    );
    assert.deepEqual(
        await replay.json(),
        originalBody,
    );
});

test('two writers, same If-Match → first 200, second 412',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'base' },
    ]);
    const etag = put.headers.get('ETag')!;
    const [a, b] = await Promise.all([
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-a',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: etag },
        )),
        handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, memberToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'race-b',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: etag },
        )),
    ]);
    assert.deepEqual(
        [a.status, b.status].sort(),
        [200, 412],
    );
});

// R9 pin: a wire pair formed against If-Match = H0 must
// 412 when the head advanced AFTER that pair was formed —
// never silently re-derive onto R1 and rebase values.
// Promise.all alone is not enough (timing can hide rebase).
test('R9: stale formed pair after head advance → 412 '
+ '(no silent rebase onto newer head)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'H0' },
    ]);
    const h0 = parseIfMatch(put.headers.get('ETag')!)!;
    const staleBody = {
        set: [
            {
                attribute_id: ATTR_ID,
                value: 'stale-writer',
            },
        ],
    };
    // Form the wire pair as the gate would, with If-Match
    // still targeting H0 (gate-equivalent check already
    // "passed" for this pair).
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
        body: staleBody,
        requesterIdentityId: 'member1',
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseStatus: 200,
        responseBody: {
            id: INSTANCE_ID,
            organization_id: ORGANIZATION,
            record_type_id: TYPE_ID,
            set: staleBody.set,
            clear: [],
        },
        headPairId: undefined,
    });
    // Advance the real head past H0.
    const advance = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'advanced',
                },
            ],
        },
        { [IF_MATCH_HEADER]: strongEtagOf(h0) },
    ));
    assert.equal(advance.status, 200);
    const live = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.ok(live !== undefined);
    assert.notEqual(live.pairId, h0);
    assert.deepEqual(live.values, [
        { attribute_id: ATTR_ID, value: 'advanced' },
    ]);
    // Stale writer must 412 on ifMatchTarget (= H0), not
    // merge against live and 200.
    await assert.rejects(
        () => postInstancePatchOp(
            db,
            [ORGANIZATION, TYPE_ID, INSTANCE_ID],
            staleBody,
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
    assert.deepEqual(after?.values, [
        { attribute_id: ATTR_ID, value: 'advanced' },
    ]);
    assert.equal(after?.pairId, live.pairId);
});

test('explicit-follows race pin: formDocumentPairFor never '
+ 're-reads head when follows is supplied',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    const h0 = parseIfMatch(put.headers.get('ETag')!)!;
    // Advance the real head past h0.
    const p1 = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'B',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(p1.status, 200);
    const live = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assert.notEqual(live?.pairId, h0);
    // Form a revision anchored to the STALE head id
    // explicitly — must not silently re-read live head.
    const revision = await formDocumentPairFor(db, {
        routePattern: INSTANCE_DETAIL_PATTERN,
        params: [ORGANIZATION, TYPE_ID, INSTANCE_ID],
        method: 'PUT',
        body: {
            values: [
                {
                    attribute_id: ATTR_ID,
                    value: 'stale-merge',
                },
            ],
        },
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        chain: 'follows',
        follows: h0,
        response: { status: 200, body: {} },
    });
    assert.equal(
        revision.follows,
        h0,
        'explicit follows wins; no live-head re-read',
    );
    assert.notEqual(revision.follows, live?.pairId);
});

test('ETag/ACL interplay: unreadable write moves head; '
+ 'blind writer 412s, re-GETs, retries → converges',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putAttribute(db, adminToken, ATTR_LOCKED, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
    });
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'public' },
    ]);
    const e0 = put.headers.get('ETag')!;
    // Admin writes an unreadable (to member) attribute —
    // head ETag advances.
    const adminPatch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken,
        {
            set: [
                {
                    attribute_id: ATTR_LOCKED,
                    value: 'hidden',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(adminPatch.status, 200);
    const e1 = adminPatch.headers.get('ETag')!;
    assert.notEqual(e1, e0);
    // Member still holding e0 412s.
    const blind = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'updated',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e0 },
    ));
    assert.equal(blind.status, 412);
    // Re-GET: member does not see secret, but gets new ETag.
    const reget = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(reget.status, 200);
    assert.equal(reget.headers.get('ETag'), e1);
    const visible = await reget.json() as {
        values: { attribute_id: string; value: string }[];
    };
    assert.deepEqual(visible.values, [
        { attribute_id: ATTR_ID, value: 'public' },
    ]);
    const retry = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'updated',
                },
            ],
        },
        { [IF_MATCH_HEADER]: e1 },
    ));
    assert.equal(retry.status, 200);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    const byId = new Map(
        head!.values.map(
            (v) => [v.attribute_id, v.value],
        ),
    );
    assert.equal(byId.get(ATTR_ID), 'updated');
    assert.equal(byId.get(ATTR_LOCKED), 'hidden');
});

test('pair count: each PATCH adds TWO pairs',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'A' },
    ]);
    assert.equal(await countInstancePairs(db), 1);
    await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'B',
                },
            ],
        },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assert.equal(await countInstancePairs(db), 3);
});
