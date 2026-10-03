import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
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
    postInstancePatchOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
    parseIfMatch,
    IF_NONE_MATCH_HEADER,
} from '../api/message-pair.ts';
import { RetiredEntityError } from '../api/db.ts';
import {
    INSTANCE_DETAIL_PATTERN,
} from '../api/family-registry.ts';
import {
    instancesUriPrefix,
    deriveInstanceHead,
} from '../api/derive-record-instances.ts';
import {
    documentMessagePairsAt,
} from '../api/derive-documents.ts';
import {
    nowUtc,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../shared/types.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Instance DELETE — tombstone posture (Task 18 / R4 / R9).
// Absent → missedReadError; live OR already-tombstoned →
// append tombstone (ledger-complete, not a no-append case).

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const TYPE_ID = generateIdentifier();
const ATTR_ID = generateIdentifier();
const ATTR_LOCKED = generateIdentifier();
const INSTANCE_ID = generateIdentifier();

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;
// History route is Task 19 — pin only if registered.
const INSTANCE_HISTORY = INSTANCE_DETAIL + '/versions/';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(extraHeaders !== undefined
            ? { headers: extraHeaders } : {}),
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

async function seedMembershipMessagePair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );
}

async function adminDb(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: ORGANIZATION,
        identity_id: 'nkgaOHZISTQrILTfPThWCA',
        type: 'member',
        at: AT,
    });
    return {
        db,
        adminToken: await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
        ),
        memberToken: await organizationToken(
            'nkgaOHZISTQrILTfPThWCA', ORGANIZATION,
        ),
    };
}

function typeBody(): Record<string, unknown> {
    return {
        name: 'Rental',
        description: 'Rental desc',
        position: 1,
        state: 'active',
    };
}

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assertStrictEquals(put.status, 201);
}

async function putAttribute(
    db: MemoryDbAdapter,
    adminToken: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + attrId, adminToken, body,
    ));
    assertStrictEquals(put.status, 201);
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
        'PATCH', INSTANCE_DETAIL, token,
        { set: [...set] },
        { [IF_NONE_MATCH_HEADER]: '*' },
    ));
}

async function countInstanceMessagePairs(
    db: MemoryDbAdapter,
): Promise<number> {
    const prefix = instancesUriPrefix(
        ORGANIZATION, TYPE_ID,
    );
    const responses = await db.messagePairs.getCollectionPairs(prefix,
    );
    return responses.filter(
        (r) => r.name === INSTANCE_ID,
    ).length;
}

async function countDeleteMessagePairs(
    db: MemoryDbAdapter,
): Promise<number> {
    const prefix = instancesUriPrefix(
        ORGANIZATION, TYPE_ID,
    );
    const [requests] = await Promise.all([
        db.messagePairs.getCollectionPairs(prefix),
        db.messagePairs.getCollectionPairs(prefix),
    ]);
    return documentMessagePairsAt(
        requests, prefix,
    ).filter(
        (messagePair) => messagePair.name === INSTANCE_ID
            && messagePair.method === 'DELETE',
    ).length;
}

Deno.test('DELETE live instance → 204; then collection omit, '
+ 'detail 410, PATCH+pin 410, PATCH create 410, second '
+ 'DELETE appends nothing (R4)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    const before = await countInstanceMessagePairs(db);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(del.status, 204);
    assertStrictEquals(
        await countInstanceMessagePairs(db),
        before + 1,
    );
    assertStrictEquals(await countDeleteMessagePairs(db), 1);

    const list = await handleRequest(db, req(
        'GET', INSTANCES, memberToken,
    ));
    // The tombstoned instance was the type's only one.
    assertStrictEquals(list.status, 204);
    assertStrictEquals(await list.text(), '');

    const detail = await handleRequest(db, req(
        'GET', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(detail.status, 410);
    assertEquals(await detail.json(), {
        error: 'Gone: record_instances/' + INSTANCE_ID,
    });

    // Versions list of an owned tombstone is 410.
    const history = await handleRequest(db, req(
        'GET', INSTANCE_HISTORY, memberToken,
    ));
    assertStrictEquals(history.status, 410);
    assertEquals(await history.json(), {
        error: 'Gone: record_instances/'
            + INSTANCE_ID,
    });

    const patch = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        { set: [{ attribute_id: ATTR_ID, value: 'x' }] },
        {
            [IF_MATCH_HEADER]: put.headers.get('ETag')!,
        },
    ));
    assertStrictEquals(patch.status, 410);
    assertEquals(await patch.json(), {
        error: 'Gone: record_instances/' + INSTANCE_ID,
    });

    const putAgain = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'revive',
                },
            ],
        },
        { [IF_NONE_MATCH_HEADER]: '*' },
    ));
    assertStrictEquals(putAgain.status, 410);
    assertEquals(await putAgain.json(), {
        error: 'Document is gone at ' + INSTANCE_DETAIL,
    });

    // New bytes: different Authorization → not a replay.
    // Already-gone DELETE is 204 and does not append.
    const messagePairsBeforeSecond = await countInstanceMessagePairs(db);
    const deletesBefore = await countDeleteMessagePairs(db);
    const del2 = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, adminToken,
    ));
    assertStrictEquals(del2.status, 204);
    assertStrictEquals(
        await countInstanceMessagePairs(db),
        messagePairsBeforeSecond,
        'already-gone DELETE does not append',
    );
    assertStrictEquals(
        await countDeleteMessagePairs(db),
        deletesBefore,
    );
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assertStrictEquals(head, undefined);
});

Deno.test('DELETE never-existed id → 404 missedReadError (R2)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const res = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), {
        error: 'Not found: ' + INSTANCE_DETAIL,
    });
    assertStrictEquals(await countInstanceMessagePairs(db), 0);
});

Deno.test('DELETE byte-identical replay → 204 from the gate\'s'
+ ' already-gone branch; no statement runs, nothing appends',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await putInstance(db, memberToken, []);
    const operationId = generateIdentifier();
    const first = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined, undefined, operationId,
    ));
    assertStrictEquals(first.status, 204);
    const afterFirst = await countInstanceMessagePairs(db);
    const second = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined, undefined, operationId,
    ));
    assertStrictEquals(second.status, 204);
    assertStrictEquals(
        await countInstanceMessagePairs(db),
        afterFirst,
        'byte-identical replay does not append',
    );
});

Deno.test('DELETE member with zero write roles → 204 '
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
    assertStrictEquals(put.status, 201);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(del.status, 204);
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assertStrictEquals(head, undefined);
});

Deno.test('a malformed If-Match on an instance DELETE is 400',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    const put = await putInstance(db, memberToken, []);
    assertStrictEquals(put.status, 201);
    const before = await countInstanceMessagePairs(db);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined,
        { [IF_MATCH_HEADER]: '"stale-or-anything"' },
    ));
    assertStrictEquals(del.status, 400);
    await del.body?.cancel();
    assertStrictEquals(
        await countInstanceMessagePairs(db), before,
    );
    const head = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assertStrictEquals(head?.id, INSTANCE_ID);
});

Deno.test('a stale If-Match on an instance DELETE is 412;'
+ ' nothing stored', async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    const before = await countInstanceMessagePairs(db);
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined,
        { [IF_MATCH_HEADER]: '"' + generateIdentifier() + '"' },
    ));
    assertStrictEquals(del.status, 412);
    assertEquals(await del.json(), {
        error: 'If-Match does not match the current document at '
            + INSTANCE_DETAIL,
    });
    assertStrictEquals(
        await countInstanceMessagePairs(db), before,
    );
    assertStrictEquals(await countDeleteMessagePairs(db), 0);
});

Deno.test('the head\'s If-Match on an instance DELETE is 204',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'Hello' },
    ]);
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
        undefined,
        { [IF_MATCH_HEADER]: put.headers.get('ETag')! },
    ));
    assertStrictEquals(del.status, 204);
    await del.body?.cancel();
    assertStrictEquals(await countDeleteMessagePairs(db), 1);
});

// R9 resurrect-hole: tombstone interleaved after a PATCH
// wire pair was formed (gate-equivalent) but before its tx.
// PATCH must 412 (or honest miss) — never revive the head.
Deno.test('R9 resurrect-hole: DELETE between PATCH form and '
+ 'append → 410; head stays tombstoned',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const put = await putInstance(db, memberToken, [
        { attribute_id: ATTR_ID, value: 'live' },
    ]);
    assertStrictEquals(put.status, 201);
    const h0 = parseIfMatch(put.headers.get('ETag')!)!;
    const patchBody = {
        set: [
            {
                attribute_id: ATTR_ID,
                value: 'revived',
            },
        ],
    };
    const staleMessagePair = await formWriteMessagePair({
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
        requesterIdentityId: 'nkgaOHZISTQrILTfPThWCA',
        requestAt: nowUtc(),
        organization: ORGANIZATION,
        responseBody: {
            id: INSTANCE_ID,
            organization_id: ORGANIZATION,
            record_type_id: TYPE_ID,
            set: patchBody.set,
            clear: [],
        },
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    // Concurrent DELETE tombstones the document.
    const del = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assertStrictEquals(del.status, 204);
    assertStrictEquals(
        await deriveInstanceHead(
            db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
        ),
        undefined,
    );
    const err = await assertRejects(
        () => postInstancePatchOp(
            db,
            [ORGANIZATION, TYPE_ID, INSTANCE_ID],
            patchBody,
            'nkgaOHZISTQrILTfPThWCA',
            staleMessagePair,
            ORGANIZATION,
            ['member'],
        ),
    );
    assertInstanceOf(err, RetiredEntityError);
    assertStrictEquals(
        err.message,
        'Gone: record_instances/' + INSTANCE_ID,
    );
    const after = await deriveInstanceHead(
        db, ORGANIZATION, TYPE_ID, INSTANCE_ID,
    );
    assertStrictEquals(
        after,
        undefined,
        'PATCH must never revive a tombstoned head',
    );
});
